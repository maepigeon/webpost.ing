package com.springbootprojects.webpostingserver.migration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Connection;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Core database migration engine. Framework-independent — accepts a JdbcTemplate
 * and a list of MigrationScripts; callers (e.g. DatabaseMigrationService) are
 * responsible for loading scripts from disk or classpath.
 *
 * Tracking table (default: schema_migrations):
 *   version    VARCHAR(100) PRIMARY KEY
 *   applied_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
 *   checksum   VARCHAR(64)  DEFAULT NULL
 *
 * Version format: "V{NNN}__description" — the numeric part is used for ordering,
 * so V10 sorts after V9 even though "V10" < "V9" lexicographically.
 */
public class DatabaseMigrator {

    private static final Logger log = LoggerFactory.getLogger(DatabaseMigrator.class);
    private static final Pattern VERSION_RE = Pattern.compile("^V(\\d+)__.*$");

    private final JdbcTemplate jdbc;
    private final String trackingTable;

    // ── Public API types ──────────────────────────────────────────────────────

    public record MigrationScript(String version, String checksum, String sql) {}

    public record MigrationResult(int applied, int skipped, List<String> failures) {
        public boolean hasFailures() { return !failures.isEmpty(); }
    }

    // ── Constructors ──────────────────────────────────────────────────────────

    public DatabaseMigrator(JdbcTemplate jdbc) {
        this(jdbc, "schema_migrations");
    }

    /** Overload used in tests so test runs use a separate tracking table. */
    public DatabaseMigrator(JdbcTemplate jdbc, String trackingTable) {
        if (trackingTable == null || trackingTable.isBlank()) throw new IllegalArgumentException("trackingTable must not be blank");
        this.jdbc = jdbc;
        this.trackingTable = trackingTable;
    }

    // ── Setup ─────────────────────────────────────────────────────────────────

    /**
     * Creates the tracking table if it doesn't exist, and adds the checksum
     * column if it was created by an older version of the tool (migrate.sh).
     */
    public void ensureTrackingTable() {
        jdbc.execute("""
            CREATE TABLE IF NOT EXISTS %s (
                version    VARCHAR(100) PRIMARY KEY,
                applied_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                checksum   VARCHAR(64)  DEFAULT NULL
            )""".formatted(trackingTable));

        // Backfill checksum column for tracking tables created by the legacy bash script
        jdbc.execute("""
            DO $$ BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                 WHERE table_name = '%s' AND column_name = 'checksum'
              ) THEN
                ALTER TABLE %s ADD COLUMN checksum VARCHAR(64) DEFAULT NULL;
              END IF;
            END $$""".formatted(trackingTable, trackingTable));
    }

    // ── Querying ──────────────────────────────────────────────────────────────

    /** Returns the set of version strings already recorded in the tracking table. */
    public Set<String> appliedVersions() {
        return new HashSet<>(jdbc.queryForList("SELECT version FROM " + trackingTable, String.class));
    }

    /**
     * Returns scripts from {@code all} that have NOT yet been applied,
     * in version order. Does NOT call ensureTrackingTable — call that first.
     */
    public List<MigrationScript> pendingScripts(List<MigrationScript> all) {
        Set<String> applied = appliedVersions();
        return sortByVersion(all).stream()
                .filter(s -> !applied.contains(s.version()))
                .collect(Collectors.toList());
    }

    /**
     * Compares the checksum of every script in {@code current} against what was
     * recorded when it was applied. Returns the list of versions whose content
     * has changed since they were applied.
     */
    public List<String> detectChecksumMismatches(List<MigrationScript> current) {
        Map<String, String> stored = new HashMap<>();
        jdbc.query(
            "SELECT version, checksum FROM " + trackingTable + " WHERE checksum IS NOT NULL",
            (org.springframework.jdbc.core.RowCallbackHandler) rs ->
                stored.put(rs.getString("version"), rs.getString("checksum")));

        return current.stream()
                .filter(s -> {
                    String storedCk = stored.get(s.version());
                    return storedCk != null && !storedCk.equals(s.checksum());
                })
                .map(MigrationScript::version)
                .collect(Collectors.toList());
    }

    // ── Migration ─────────────────────────────────────────────────────────────

    /**
     * Applies all pending migrations from {@code scripts} in version order.
     * Calls ensureTrackingTable automatically.
     *
     * If a migration fails, the exception is rethrown immediately — subsequent
     * migrations are NOT attempted. The failed migration is NOT recorded.
     */
    public MigrationResult migrate(List<MigrationScript> scripts) {
        ensureTrackingTable();
        Set<String> applied = appliedVersions();
        List<MigrationScript> sorted = sortByVersion(scripts);

        int appliedCount = 0;
        int skippedCount = 0;

        for (MigrationScript script : sorted) {
            if (applied.contains(script.version())) {
                log.debug("Skipping already-applied migration: {}", script.version());
                skippedCount++;
                continue;
            }
            applyScript(script);
            appliedCount++;
        }

        return new MigrationResult(appliedCount, skippedCount, List.of());
    }

    /**
     * Executes the SQL in {@code script} and records the version + checksum.
     * Uses ScriptUtils so multi-statement scripts (BEGIN/COMMIT, DO $$...$$) work.
     * The tracking INSERT only runs after the SQL succeeds — a failed SQL leaves
     * no trace in the tracking table.
     */
    void applyScript(MigrationScript script) {
        log.info("Applying migration: {}", script.version());
        byte[] sqlBytes = script.sql().getBytes(StandardCharsets.UTF_8);
        org.springframework.core.io.Resource resource = new ByteArrayResource(sqlBytes);

        jdbc.execute((Connection conn) -> {
            ScriptUtils.executeSqlScript(conn, resource);
            return null;
        });

        jdbc.update(
            "INSERT INTO " + trackingTable + " (version, checksum) VALUES (?, ?) ON CONFLICT DO NOTHING",
            script.version(), script.checksum()
        );
        log.info("Migration {} applied successfully", script.version());
    }

    // ── Static helpers ────────────────────────────────────────────────────────

    /** Sorts a list of scripts by numeric version (V10 > V9, not lexicographically). */
    public static List<MigrationScript> sortByVersion(List<MigrationScript> scripts) {
        return scripts.stream()
                .sorted((a, b) -> compareVersions(a.version(), b.version()))
                .collect(Collectors.toList());
    }

    /**
     * Numeric-aware version comparator.
     * "V10__x" > "V9__x" even though lexicographically "V10" < "V9".
     */
    public static int compareVersions(String v1, String v2) {
        int n1 = versionNumber(v1);
        int n2 = versionNumber(v2);
        if (n1 != n2) return Integer.compare(n1, n2);
        return v1.compareTo(v2);
    }

    /** Extracts the leading integer from a "V{NNN}__description" filename. */
    public static int versionNumber(String version) {
        Matcher m = VERSION_RE.matcher(version);
        return m.matches() ? Integer.parseInt(m.group(1)) : Integer.MAX_VALUE;
    }

    /** Returns the first 16 hex characters of the SHA-256 of the given SQL text. */
    public static String checksum(String sql) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] bytes = md.digest(sql.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : bytes) sb.append(String.format("%02x", b));
            return sb.substring(0, 16);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 unavailable", e);
        }
    }

    /** Constructs a MigrationScript from a filename (with or without .sql) and SQL text. */
    public static MigrationScript fromSqlText(String filename, String sql) {
        String version = filename.endsWith(".sql") ? filename.substring(0, filename.length() - 4) : filename;
        return new MigrationScript(version, checksum(sql), sql);
    }
}
