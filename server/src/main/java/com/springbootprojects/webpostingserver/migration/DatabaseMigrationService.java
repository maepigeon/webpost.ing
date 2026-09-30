package com.springbootprojects.webpostingserver.migration;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Runs pending database migrations automatically on application startup.
 * SQL scripts are loaded from classpath:db/migrations/V*.sql and applied
 * in version order via DatabaseMigrator.
 */
@Service
public class DatabaseMigrationService {

    private static final Logger log = LoggerFactory.getLogger(DatabaseMigrationService.class);
    private static final String MIGRATIONS_PATTERN = "classpath:db/migrations/V*.sql";

    private final JdbcTemplate jdbc;

    public DatabaseMigrationService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @PostConstruct
    public void migrate() throws Exception {
        PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
        Resource[] resources = resolver.getResources(MIGRATIONS_PATTERN);

        if (resources.length == 0) {
            log.info("No migration scripts found at {}", MIGRATIONS_PATTERN);
            return;
        }

        // Sort by filename so they're in filesystem order before handing off to migrator
        Arrays.sort(resources, Comparator.comparing(r -> r.getFilename() == null ? "" : r.getFilename()));

        List<DatabaseMigrator.MigrationScript> scripts = new ArrayList<>();
        for (Resource resource : resources) {
            String filename = resource.getFilename();
            String sql = new String(resource.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            scripts.add(DatabaseMigrator.fromSqlText(filename, sql));
        }

        // Two files sharing a version number is always a mistake — usually a
        // rename that left the original behind, or two branches picking the
        // same next number. The runner would apply one and then fail on the
        // other, leaving the schema half-migrated with no record of why, so it
        // is better to refuse before touching the database.
        Map<String, List<String>> byVersion = new LinkedHashMap<>();
        for (DatabaseMigrator.MigrationScript script : scripts) {
            String number = script.version().split("__", 2)[0];
            byVersion.computeIfAbsent(number, k -> new ArrayList<>()).add(script.version());
        }
        List<String> duplicates = byVersion.entrySet().stream()
                .filter(e -> e.getValue().size() > 1)
                .map(e -> e.getKey() + " -> " + e.getValue())
                .toList();
        if (!duplicates.isEmpty()) {
            throw new IllegalStateException(
                    "Duplicate migration version(s): " + duplicates
                    + ". Each V number must appear exactly once — delete or renumber the extra file.");
        }

        log.info("Found {} migration script(s) on classpath", scripts.size());
        DatabaseMigrator migrator = new DatabaseMigrator(jdbc);
        migrator.ensureTrackingTable();

        List<String> mismatches = migrator.detectChecksumMismatches(scripts);
        if (!mismatches.isEmpty()) {
            log.warn("Checksum mismatch detected for already-applied migrations: {}. " +
                     "Migration files may have been modified after being applied.", mismatches);
        }

        DatabaseMigrator.MigrationResult result = migrator.migrate(scripts);
        log.info("Database migration complete — applied: {}, skipped (already applied): {}",
                 result.applied(), result.skipped());
    }
}
