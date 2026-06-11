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
                // core
                "users", "posts", "users_posts_junctions",
                "role_limits", "uploads", "post_uploads",
                "post_reactions", "follows",
                // discussions
                "discussions", "comments", "comment_votes", "comment_reactions",
                // notifications & moderation
                "notifications", "dm_blocks", "activity_deletions",
                // messaging (V008)
                "conversations", "direct_messages",
                // post views (V008)
                "post_views", "post_view_totals",
                // invite codes (V008)
                "invite_codes",
                // hashtags (V008)
                "hashtags", "post_hashtags",
                // migration tracking
                "schema_migrations"
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
        // Added by V008
        assertColumnExists("users", "avatar_path");
        assertColumnExists("users", "last_active_at");
        assertColumnExists("users", "email");
    }

    // ── conversations columns ─────────────────────────────────────────────────

    @Test
    void conversationsTable_hasAllRequiredColumns() {
        assertColumnExists("conversations", "id");
        assertColumnExists("conversations", "user1_id");
        assertColumnExists("conversations", "user2_id");
        assertColumnExists("conversations", "created_at");
    }

    // ── direct_messages columns ───────────────────────────────────────────────

    @Test
    void directMessagesTable_hasAllRequiredColumns() {
        assertColumnExists("direct_messages", "id");
        assertColumnExists("direct_messages", "conversation_id");
        assertColumnExists("direct_messages", "sender_id");
        assertColumnExists("direct_messages", "content");
        assertColumnExists("direct_messages", "is_read");
        assertColumnExists("direct_messages", "created_at");
    }

    // ── invite_codes columns ──────────────────────────────────────────────────

    @Test
    void inviteCodesTable_hasAllRequiredColumns() {
        assertColumnExists("invite_codes", "code");
        assertColumnExists("invite_codes", "created_by");
        assertColumnExists("invite_codes", "created_at");
        assertColumnExists("invite_codes", "expires_at");
        assertColumnExists("invite_codes", "used_by");
        assertColumnExists("invite_codes", "used_at");
    }

    // ── hashtags columns ──────────────────────────────────────────────────────

    @Test
    void hashtagsTable_hasAllRequiredColumns() {
        assertColumnExists("hashtags", "id");
        assertColumnExists("hashtags", "tag");
    }

    @Test
    void postHashtagsTable_hasAllRequiredColumns() {
        assertColumnExists("post_hashtags", "post_id");
        assertColumnExists("post_hashtags", "hashtag_id");
    }

    // ── post_views columns ────────────────────────────────────────────────────

    @Test
    void postViewsTable_hasAllRequiredColumns() {
        assertColumnExists("post_views", "post_id");
        assertColumnExists("post_views", "user_id");
        assertColumnExists("post_views", "ip_hash");
        assertColumnExists("post_views", "viewed_at");
    }

    // ── schema_migrations columns ─────────────────────────────────────────────

    @Test
    void schemaMigrationsTable_hasAllRequiredColumns() {
        assertColumnExists("schema_migrations", "version");
        assertColumnExists("schema_migrations", "applied_at");
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
