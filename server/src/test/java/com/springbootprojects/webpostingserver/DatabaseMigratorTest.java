package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.migration.DatabaseMigrator;
import com.springbootprojects.webpostingserver.migration.DatabaseMigrator.MigrationResult;
import com.springbootprojects.webpostingserver.migration.DatabaseMigrator.MigrationScript;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.*;

/**
 * Comprehensive integration tests for DatabaseMigrator.
 *
 * All tests use a separate tracking table and separate test tables so they
 * never touch the real schema_migrations table or any production schema.
 * Both tracking table and test tables are dropped in tearDown.
 */
@SpringBootTest
class DatabaseMigratorTest {

    @Autowired
    JdbcTemplate jdbc;

    // Isolated tracking table for these tests — never touches schema_migrations
    private static final String TRACKING = "test_migrator_tracking_junit";

    // DDL tables created by test migration scripts — all cleaned up in tearDown
    private static final String TBL_ALPHA   = "test_mig_alpha_junit";
    private static final String TBL_BRAVO   = "test_mig_bravo_junit";
    private static final String TBL_CHARLIE = "test_mig_charlie_junit";

    @BeforeEach
    void setUp() {
        // Clean slate before each test
        dropIfExists(TRACKING, TBL_ALPHA, TBL_BRAVO, TBL_CHARLIE);
    }

    @AfterEach
    void tearDown() {
        dropIfExists(TRACKING, TBL_ALPHA, TBL_BRAVO, TBL_CHARLIE);
    }

    // ── Static / pure logic (no DB) ───────────────────────────────────────────

    @Test
    void versionNumber_extractsLeadingInteger() {
        assertThat(DatabaseMigrator.versionNumber("V001__baseline")).isEqualTo(1);
        assertThat(DatabaseMigrator.versionNumber("V9__foo")).isEqualTo(9);
        assertThat(DatabaseMigrator.versionNumber("V010__bar")).isEqualTo(10);
        assertThat(DatabaseMigrator.versionNumber("V100__large")).isEqualTo(100);
    }

    @Test
    void versionNumber_unknownFormatReturnsMaxValue() {
        assertThat(DatabaseMigrator.versionNumber("not_a_version")).isEqualTo(Integer.MAX_VALUE);
        assertThat(DatabaseMigrator.versionNumber("")).isEqualTo(Integer.MAX_VALUE);
    }

    @Test
    void sortByVersion_isNumericNotLexicographic() {
        // Lexicographic order would put V10 before V2 — numeric order must not do that
        List<MigrationScript> scripts = List.of(
            script("V10__ten", "SELECT 1"),
            script("V2__two", "SELECT 1"),
            script("V1__one", "SELECT 1")
        );
        List<MigrationScript> sorted = DatabaseMigrator.sortByVersion(scripts);
        assertThat(sorted).extracting(MigrationScript::version)
                .containsExactly("V1__one", "V2__two", "V10__ten");
    }

    @Test
    void compareVersions_numericSortingAcrossGaps() {
        // V3 before V9, V9 before V10
        assertThat(DatabaseMigrator.compareVersions("V3__a", "V9__b")).isNegative();
        assertThat(DatabaseMigrator.compareVersions("V9__b", "V10__c")).isNegative();
        assertThat(DatabaseMigrator.compareVersions("V10__c", "V3__a")).isPositive();
        assertThat(DatabaseMigrator.compareVersions("V5__x", "V5__x")).isZero();
    }

    @Test
    void checksum_isDeterministicAndChangesWithContent() {
        String a = DatabaseMigrator.checksum("SELECT 1");
        String b = DatabaseMigrator.checksum("SELECT 1");
        String c = DatabaseMigrator.checksum("SELECT 2");
        assertThat(a).isEqualTo(b);
        assertThat(a).isNotEqualTo(c);
        assertThat(a).hasSize(16); // first 16 hex chars of SHA-256
    }

    @Test
    void fromSqlText_stripsExtensionAndComputesChecksum() {
        MigrationScript s = DatabaseMigrator.fromSqlText("V001__foo.sql", "SELECT 1");
        assertThat(s.version()).isEqualTo("V001__foo");
        assertThat(s.checksum()).isEqualTo(DatabaseMigrator.checksum("SELECT 1"));
        assertThat(s.sql()).isEqualTo("SELECT 1");
    }

    // ── Tracking table management ─────────────────────────────────────────────

    @Test
    void ensureTrackingTable_createsTableWhenAbsent() {
        DatabaseMigrator migrator = new DatabaseMigrator(jdbc, TRACKING);
        assertThat(tableExists(TRACKING)).isFalse();

        migrator.ensureTrackingTable();

        assertThat(tableExists(TRACKING)).isTrue();
        assertThat(columnExists(TRACKING, "version")).isTrue();
        assertThat(columnExists(TRACKING, "applied_at")).isTrue();
        assertThat(columnExists(TRACKING, "checksum")).isTrue();
    }

    @Test
    void ensureTrackingTable_isIdempotent() {
        DatabaseMigrator migrator = new DatabaseMigrator(jdbc, TRACKING);
        // Calling twice must not throw
        migrator.ensureTrackingTable();
        migrator.ensureTrackingTable();
        assertThat(tableExists(TRACKING)).isTrue();
    }

    @Test
    void ensureTrackingTable_addsChecksumColumnToLegacyTable() {
        // Simulate a tracking table created by the old bash migrate.sh (no checksum column)
        jdbc.execute("CREATE TABLE " + TRACKING + " (version VARCHAR(100) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
        assertThat(columnExists(TRACKING, "checksum")).isFalse();

        new DatabaseMigrator(jdbc, TRACKING).ensureTrackingTable();

        assertThat(columnExists(TRACKING, "checksum")).isTrue();
    }

    // ── Core migration behavior ───────────────────────────────────────────────

    @Test
    void migrate_appliesPendingScriptsAndRecordsThem() {
        DatabaseMigrator migrator = new DatabaseMigrator(jdbc, TRACKING);
        List<MigrationScript> scripts = List.of(
            script("V001__create_alpha", "CREATE TABLE " + TBL_ALPHA + " (id SERIAL PRIMARY KEY)"),
            script("V002__create_bravo", "CREATE TABLE " + TBL_BRAVO + " (id SERIAL PRIMARY KEY)")
        );

        MigrationResult result = migrator.migrate(scripts);

        assertThat(result.applied()).isEqualTo(2);
        assertThat(result.skipped()).isEqualTo(0);
        assertThat(tableExists(TBL_ALPHA)).isTrue();
        assertThat(tableExists(TBL_BRAVO)).isTrue();
        assertThat(migrator.appliedVersions()).containsExactlyInAnyOrder("V001__create_alpha", "V002__create_bravo");
    }

    @Test
    void migrate_skipsAlreadyAppliedVersions() {
        DatabaseMigrator migrator = new DatabaseMigrator(jdbc, TRACKING);
        migrator.ensureTrackingTable();
        // Pre-record V001 as applied without running its SQL
        jdbc.update("INSERT INTO " + TRACKING + " (version) VALUES (?)", "V001__create_alpha");

        MigrationScript skip = script("V001__create_alpha", "CREATE TABLE " + TBL_ALPHA + " (id SERIAL PRIMARY KEY)");
        MigrationScript apply = script("V002__create_bravo", "CREATE TABLE " + TBL_BRAVO + " (id SERIAL PRIMARY KEY)");

        MigrationResult result = migrator.migrate(List.of(skip, apply));

        assertThat(result.applied()).isEqualTo(1);
        assertThat(result.skipped()).isEqualTo(1);
        // TBL_ALPHA was skipped (SQL never ran), TBL_BRAVO was applied
        assertThat(tableExists(TBL_ALPHA)).isFalse();
        assertThat(tableExists(TBL_BRAVO)).isTrue();
    }

    @Test
    void migrate_appliesScriptsInVersionOrderRegardlessOfInputOrder() {
        DatabaseMigrator migrator = new DatabaseMigrator(jdbc, TRACKING);
        // Input is deliberately out of order
        List<MigrationScript> scripts = List.of(
            script("V002__create_bravo", "CREATE TABLE " + TBL_BRAVO + " (id SERIAL PRIMARY KEY, alpha_id INT)"),
            script("V001__create_alpha", "CREATE TABLE " + TBL_ALPHA + " (id SERIAL PRIMARY KEY)")
        );

        // If V002 ran before V001 and referenced TBL_ALPHA, it would fail.
        // Correct ordering must run V001 first.
        MigrationResult result = migrator.migrate(scripts);
        assertThat(result.applied()).isEqualTo(2);

        // Verify they were recorded in order
        List<String> versions = jdbc.queryForList(
            "SELECT version FROM " + TRACKING + " ORDER BY applied_at, version", String.class);
        assertThat(versions.get(0)).isEqualTo("V001__create_alpha");
        assertThat(versions.get(1)).isEqualTo("V002__create_bravo");
    }

    @Test
    void migrate_doesNotRecordVersionOnSqlFailure() {
        DatabaseMigrator migrator = new DatabaseMigrator(jdbc, TRACKING);
        MigrationScript bad = script("V001__broken", "THIS IS NOT VALID SQL !!!");

        assertThatThrownBy(() -> migrator.migrate(List.of(bad)))
            .isInstanceOf(Exception.class);

        // Tracking table exists but has no rows — the failed migration was NOT recorded
        migrator.ensureTrackingTable(); // needed because migrate() created it before trying
        assertThat(migrator.appliedVersions()).doesNotContain("V001__broken");
    }

    @Test
    void migrate_stopsAtFirstFailure_doesNotAttemptSubsequentScripts() {
        DatabaseMigrator migrator = new DatabaseMigrator(jdbc, TRACKING);
        List<MigrationScript> scripts = List.of(
            script("V001__create_alpha", "CREATE TABLE " + TBL_ALPHA + " (id SERIAL PRIMARY KEY)"),
            script("V002__broken",       "THIS IS NOT VALID SQL !!!"),
            script("V003__create_charlie", "CREATE TABLE " + TBL_CHARLIE + " (id SERIAL PRIMARY KEY)")
        );

        assertThatThrownBy(() -> migrator.migrate(scripts)).isInstanceOf(Exception.class);

        // V001 was applied before the failure
        assertThat(tableExists(TBL_ALPHA)).isTrue();
        assertThat(migrator.appliedVersions()).contains("V001__create_alpha");
        // V003 was never attempted
        assertThat(tableExists(TBL_CHARLIE)).isFalse();
        assertThat(migrator.appliedVersions()).doesNotContain("V003__create_charlie");
    }

    @Test
    void migrate_isIdempotent_runningTwiceIsHarmless() {
        DatabaseMigrator migrator = new DatabaseMigrator(jdbc, TRACKING);
        MigrationScript s = script("V001__create_alpha", "CREATE TABLE IF NOT EXISTS " + TBL_ALPHA + " (id SERIAL PRIMARY KEY)");

        MigrationResult first  = migrator.migrate(List.of(s));
        MigrationResult second = migrator.migrate(List.of(s));

        assertThat(first.applied()).isEqualTo(1);
        assertThat(first.skipped()).isEqualTo(0);
        assertThat(second.applied()).isEqualTo(0);
        assertThat(second.skipped()).isEqualTo(1);
    }

    @Test
    void migrate_handlesEmptyScriptList() {
        DatabaseMigrator migrator = new DatabaseMigrator(jdbc, TRACKING);
        MigrationResult result = migrator.migrate(List.of());
        assertThat(result.applied()).isEqualTo(0);
        assertThat(result.skipped()).isEqualTo(0);
        assertThat(result.failures()).isEmpty();
    }

    @Test
    void migrate_handlesVersionGaps_V1andV3withNoV2() {
        DatabaseMigrator migrator = new DatabaseMigrator(jdbc, TRACKING);
        List<MigrationScript> scripts = List.of(
            script("V001__create_alpha",   "CREATE TABLE " + TBL_ALPHA   + " (id SERIAL PRIMARY KEY)"),
            script("V003__create_charlie", "CREATE TABLE " + TBL_CHARLIE + " (id SERIAL PRIMARY KEY)")
        );

        MigrationResult result = migrator.migrate(scripts);

        assertThat(result.applied()).isEqualTo(2);
        assertThat(tableExists(TBL_ALPHA)).isTrue();
        assertThat(tableExists(TBL_CHARLIE)).isTrue();
        assertThat(migrator.appliedVersions())
            .containsExactlyInAnyOrder("V001__create_alpha", "V003__create_charlie");
    }

    // ── Checksum mismatch detection ───────────────────────────────────────────

    @Test
    void detectChecksumMismatches_returnsEmptyWhenAllMatch() {
        DatabaseMigrator migrator = new DatabaseMigrator(jdbc, TRACKING);
        MigrationScript s = script("V001__create_alpha", "CREATE TABLE " + TBL_ALPHA + " (id SERIAL PRIMARY KEY)");
        migrator.migrate(List.of(s));

        List<String> mismatches = migrator.detectChecksumMismatches(List.of(s));
        assertThat(mismatches).isEmpty();
    }

    @Test
    void detectChecksumMismatches_flagsModifiedMigrationFile() {
        DatabaseMigrator migrator = new DatabaseMigrator(jdbc, TRACKING);
        MigrationScript original = script("V001__create_alpha",
            "CREATE TABLE " + TBL_ALPHA + " (id SERIAL PRIMARY KEY)");
        migrator.migrate(List.of(original));

        // Simulate developer editing the migration file after it was applied
        MigrationScript modified = script("V001__create_alpha",
            "CREATE TABLE " + TBL_ALPHA + " (id SERIAL PRIMARY KEY, extra_col TEXT)");

        List<String> mismatches = migrator.detectChecksumMismatches(List.of(modified));
        assertThat(mismatches).containsExactly("V001__create_alpha");
    }

    @Test
    void detectChecksumMismatches_ignoresUnappliedScripts() {
        DatabaseMigrator migrator = new DatabaseMigrator(jdbc, TRACKING);
        migrator.ensureTrackingTable();
        // V001 was never applied, so there's no stored checksum to mismatch against
        MigrationScript s = script("V001__create_alpha", "CREATE TABLE " + TBL_ALPHA + " (id SERIAL PRIMARY KEY)");

        List<String> mismatches = migrator.detectChecksumMismatches(List.of(s));
        assertThat(mismatches).isEmpty();
    }

    // ── Pending script detection ──────────────────────────────────────────────

    @Test
    void pendingScripts_returnsOnlyUnappliedInVersionOrder() {
        DatabaseMigrator migrator = new DatabaseMigrator(jdbc, TRACKING);
        migrator.ensureTrackingTable();
        jdbc.update("INSERT INTO " + TRACKING + " (version) VALUES (?)", "V001__create_alpha");

        List<MigrationScript> all = List.of(
            script("V001__create_alpha", "-- already applied"),
            script("V003__create_charlie", "-- pending"),
            script("V002__create_bravo", "-- pending")
        );

        List<MigrationScript> pending = migrator.pendingScripts(all);
        assertThat(pending).extracting(MigrationScript::version)
            .containsExactly("V002__create_bravo", "V003__create_charlie");
    }

    @Test
    void pendingScripts_returnsAllWhenNoneApplied() {
        DatabaseMigrator migrator = new DatabaseMigrator(jdbc, TRACKING);
        migrator.ensureTrackingTable();
        List<MigrationScript> all = List.of(
            script("V001__alpha", "-- a"),
            script("V002__bravo", "-- b")
        );
        assertThat(migrator.pendingScripts(all)).hasSize(2);
    }

    @Test
    void pendingScripts_returnsEmptyWhenAllApplied() {
        DatabaseMigrator migrator = new DatabaseMigrator(jdbc, TRACKING);
        migrator.ensureTrackingTable();
        jdbc.update("INSERT INTO " + TRACKING + " (version) VALUES (?)", "V001__alpha");
        jdbc.update("INSERT INTO " + TRACKING + " (version) VALUES (?)", "V002__bravo");

        List<MigrationScript> all = List.of(
            script("V001__alpha", "-- a"),
            script("V002__bravo", "-- b")
        );
        assertThat(migrator.pendingScripts(all)).isEmpty();
    }

    // ── Multi-statement scripts (BEGIN/COMMIT blocks) ─────────────────────────

    @Test
    void migrate_handlesMultiStatementScriptWithBeginCommit() {
        DatabaseMigrator migrator = new DatabaseMigrator(jdbc, TRACKING);
        String multiSql = """
            BEGIN;
            CREATE TABLE %s (id SERIAL PRIMARY KEY);
            CREATE TABLE %s (id SERIAL PRIMARY KEY);
            COMMIT;
            """.formatted(TBL_ALPHA, TBL_BRAVO);

        MigrationResult result = migrator.migrate(List.of(script("V001__multi", multiSql)));

        assertThat(result.applied()).isEqualTo(1);
        assertThat(tableExists(TBL_ALPHA)).isTrue();
        assertThat(tableExists(TBL_BRAVO)).isTrue();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private MigrationScript script(String version, String sql) {
        return new MigrationScript(version, DatabaseMigrator.checksum(sql), sql);
    }

    private void dropIfExists(String... tables) {
        for (String table : tables) {
            try { jdbc.execute("DROP TABLE IF EXISTS " + table + " CASCADE"); }
            catch (DataAccessException ignored) {}
        }
    }

    private boolean tableExists(String table) {
        Integer count = jdbc.queryForObject(
            "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name=?",
            Integer.class, table);
        return count != null && count > 0;
    }

    private boolean columnExists(String table, String column) {
        Integer count = jdbc.queryForObject(
            "SELECT COUNT(*) FROM information_schema.columns WHERE table_name=? AND column_name=?",
            Integer.class, table, column);
        return count != null && count > 0;
    }
}
