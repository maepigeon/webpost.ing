package com.springbootprojects.webpostingserver;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Integration tests that validate the live database schema.
 *
 * These tests connect to the database configured in application.properties
 * and verify that all expected tables, columns, and seed data exist —
 * regardless of whether the database was created via a fresh install
 * (database.sql) or via migrations (migrate.sh).
 *
 * Run with: ./mvnw test -pl server -Dtest=DatabaseSchemaTest
 */
@SpringBootTest
class DatabaseSchemaTest {

    @Autowired
    JdbcTemplate jdbc;

    // ── Tables ────────────────────────────────────────────────────────────────

    @Test
    void allExpectedTablesExist() {
        List<String> expected = List.of(
                "users", "posts", "users_posts_junctions",
                "role_limits", "uploads", "post_uploads",
                "post_reactions", "follows",
                "discussions", "comments", "comment_votes", "comment_reactions",
                "notifications", "dm_blocks", "activity_deletions"
        );
        for (String table : expected) {
            assertTableExists(table);
        }
    }

    // ── users columns ─────────────────────────────────────────────────────────

    @Test
    void usersTable_hasAllRequiredColumns() {
        assertColumnExists("users", "id");
        assertColumnExists("users", "username");
        assertColumnExists("users", "password");
        assertColumnExists("users", "registration_date");
        assertColumnExists("users", "background_pattern");
        assertColumnExists("users", "is_admin");
        assertColumnExists("users", "role");
        assertColumnExists("users", "pattern_presets");
        assertColumnExists("users", "last_visited");
        assertColumnExists("users", "bio");
        assertColumnExists("users", "bio_links");
        assertColumnExists("users", "pinned_post_id");
    }

    // ── posts columns ─────────────────────────────────────────────────────────

    @Test
    void postsTable_hasAllRequiredColumns() {
        assertColumnExists("posts", "id");
        assertColumnExists("posts", "title");
        assertColumnExists("posts", "description");
        assertColumnExists("posts", "published");
        assertColumnExists("posts", "date");
        assertColumnExists("posts", "edited_at");
        assertColumnExists("posts", "background_pattern");
        assertColumnExists("posts", "folder");
    }

    // ── role_limits ───────────────────────────────────────────────────────────

    @Test
    void roleLimits_hasFiveRoles() {
        List<String> roles = jdbc.queryForList(
                "SELECT role FROM role_limits ORDER BY role", String.class);
        assertThat(roles).containsExactlyInAnyOrder(
                "user", "trusted", "restricted", "admin", "frozen");
    }

    @Test
    void roleLimits_frozenRoleHasZeroLimits() {
        Integer maxPosts = jdbc.queryForObject(
                "SELECT max_posts_per_day FROM role_limits WHERE role = 'frozen'",
                Integer.class);
        Long maxStorage = jdbc.queryForObject(
                "SELECT max_storage_bytes FROM role_limits WHERE role = 'frozen'",
                Long.class);
        assertThat(maxPosts).isZero();
        assertThat(maxStorage).isZero();
    }

    @Test
    void roleLimits_adminRoleHas500MbStorage() {
        Integer maxPosts = jdbc.queryForObject(
                "SELECT max_posts_per_day FROM role_limits WHERE role = 'admin'",
                Integer.class);
        Long maxStorage = jdbc.queryForObject(
                "SELECT max_storage_bytes FROM role_limits WHERE role = 'admin'",
                Long.class);
        assertThat(maxPosts).isEqualTo(-1);
        assertThat(maxStorage).isEqualTo(524288000L);
    }

    // ── discussions columns ───────────────────────────────────────────────────

    @Test
    void discussionsTable_hasStyleColumn() {
        assertColumnExists("discussions", "style");
        assertColumnExists("discussions", "enabled");
        assertColumnExists("discussions", "reactions_enabled");
    }

    // ── notifications columns ─────────────────────────────────────────────────

    @Test
    void notificationsTable_hasMessageColumn() {
        assertColumnExists("notifications", "message");
        assertColumnExists("notifications", "is_read");
        assertColumnExists("notifications", "type");
        assertColumnExists("notifications", "actor_username");
    }

    // ── uploads columns ───────────────────────────────────────────────────────

    @Test
    void uploadsTable_hasSizeBytesColumn() {
        assertColumnExists("uploads", "size_bytes");
        assertColumnExists("uploads", "original_name");
        assertColumnExists("uploads", "uploaded_at");
    }

    // ── activity_deletions ────────────────────────────────────────────────────

    @Test
    void activityDeletionsTable_hasAllColumns() {
        assertColumnExists("activity_deletions", "item_type");
        assertColumnExists("activity_deletions", "summary");
        assertColumnExists("activity_deletions", "post_title");
        assertColumnExists("activity_deletions", "post_owner");
        assertColumnExists("activity_deletions", "deleted_at");
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private void assertTableExists(String table) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM information_schema.tables " +
                "WHERE table_schema = 'public' AND table_name = ?",
                Integer.class, table);
        assertThat(count).as("Table '%s' should exist", table).isEqualTo(1);
    }

    private void assertColumnExists(String table, String column) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM information_schema.columns " +
                "WHERE table_name = ? AND column_name = ?",
                Integer.class, table, column);
        assertThat(count).as("Column '%s.%s' should exist", table, column).isEqualTo(1);
    }
}
