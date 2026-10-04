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
 * These tests connect to the test database (webposting_test, see
 * src/test/resources/config/application.properties) and verify that all
 * expected tables, columns, and seed data exist, as created by the migration
 * runner from db/migrations.
 *
 * Run with: ./mvnw test -Dtest=DatabaseSchemaTest
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
                // pixel fonts (V005), stickers and stickies (V012), shared packs (V013, V014)
                "pixel_fonts", "stickers", "stickies", "shared_packs", "shared_pack_saves",
                // security log (V018)
                "security_events",
                // linked sign-in providers (V021)
                "user_identities",
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

    // ── Columns added after V001 ──────────────────────────────────────────────

    @Test
    void laterMigrations_addedTheirColumns() {
        assertColumnExists("posts", "page_theme");      // V009
        assertColumnExists("posts", "card_grid");       // V010
        assertColumnExists("users", "banner_grid");     // V011
        assertColumnExists("stickies", "post_id");      // V012
        assertColumnExists("stickies", "sticker_id");
        assertColumnExists("shared_packs", "body");     // V013
        assertColumnExists("posts", "summary");         // V016
        assertColumnExists("posts", "section");         // V017
        for (String c : List.of("user_id", "kind", "detail", "ip_prefix", "user_agent", "created_at"))
            assertColumnExists("security_events", c);       // V018
        for (String c : List.of("card_preview", "search_text", "preview_version"))
            assertColumnExists("posts", c);                 // V020
        for (String c : List.of("user_id", "provider", "subject", "email", "email_verified", "created_at", "last_used_at"))
            assertColumnExists("user_identities", c);       // V021
    }

    // ── V021: linked sign-in providers ────────────────────────────────────────

    /** One member per provider account, one account per provider for a member, and the rows leave with the member. */
    @Test
    void userIdentities_areUniqueBothWaysAndGoWithTheAccount() {
        assertIndexExists("user_identities_provider_subject", true);
        assertIndexExists("user_identities_user_provider", true);
        jdbc.update("DELETE FROM users WHERE username IN ('v021_one_junit', 'v021_two_junit')");
        int one = jdbc.queryForObject("INSERT INTO users (username, password) VALUES ('v021_one_junit', 'x') RETURNING id", Integer.class);
        int two = jdbc.queryForObject("INSERT INTO users (username, password) VALUES ('v021_two_junit', 'x') RETURNING id", Integer.class);
        try {
            jdbc.update("INSERT INTO user_identities (user_id, provider, subject) VALUES (?, 'google', 'v021-sub-a')", one);
            org.assertj.core.api.Assertions.assertThatThrownBy(() ->
                    jdbc.update("INSERT INTO user_identities (user_id, provider, subject) VALUES (?, 'google', 'v021-sub-a')", two))
                    .as("the same provider account on a second member")
                    .isInstanceOf(org.springframework.dao.DuplicateKeyException.class);
            org.assertj.core.api.Assertions.assertThatThrownBy(() ->
                    jdbc.update("INSERT INTO user_identities (user_id, provider, subject) VALUES (?, 'google', 'v021-sub-b')", one))
                    .as("a second account of the same provider on one member")
                    .isInstanceOf(org.springframework.dao.DuplicateKeyException.class);
            // The same subject at another provider is somebody else.
            jdbc.update("INSERT INTO user_identities (user_id, provider, subject) VALUES (?, 'microsoft', 'v021-sub-a')", two);

            jdbc.update("DELETE FROM users WHERE id = ?", one);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM user_identities WHERE user_id = ?", Integer.class, one)).isZero();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM user_identities WHERE user_id = ?", Integer.class, two)).isEqualTo(1);
        } finally {
            jdbc.update("DELETE FROM users WHERE username IN ('v021_one_junit', 'v021_two_junit')");
        }
    }

    /** V021 is safe to run twice: a second run changes nothing and keeps the rows. */
    @Test
    void userIdentities_migrationCanRunAgainWithoutLosingAnything() throws Exception {
        String tracking = "test_v021_again_junit";
        String sql = new String(getClass().getResourceAsStream("/db/migrations/V021__user_identities.sql").readAllBytes(),
                java.nio.charset.StandardCharsets.UTF_8);
        jdbc.update("DELETE FROM users WHERE username = 'v021_again_junit'");
        int id = jdbc.queryForObject("INSERT INTO users (username, password) VALUES ('v021_again_junit', 'x') RETURNING id", Integer.class);
        jdbc.update("INSERT INTO user_identities (user_id, provider, subject) VALUES (?, 'google', 'v021-again')", id);
        try {
            new com.springbootprojects.webpostingserver.migration.DatabaseMigrator(jdbc, tracking).migrate(List.of(
                    new com.springbootprojects.webpostingserver.migration.DatabaseMigrator.MigrationScript("V021__user_identities", "again", sql)));

            assertThat(jdbc.queryForObject("SELECT subject FROM user_identities WHERE user_id = ?", String.class, id))
                    .isEqualTo("v021-again");
            assertIndexExists("user_identities_provider_subject", true);
            assertIndexExists("user_identities_user_provider", true);
        } finally {
            jdbc.update("DELETE FROM users WHERE id = ?", id);
            jdbc.execute("DROP TABLE IF EXISTS " + tracking);
        }
    }

    // ── V020: card previews and search text ───────────────────────────────────

    @Test
    void postPreviews_startUncomputedAndSearchIsIndexed() {
        // Rows that existed before V020, and rows an import inserts, are at 0: "the sweep has this to do".
        String versionDefault = jdbc.queryForObject("""
                SELECT column_default FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'posts' AND column_name = 'preview_version'""", String.class);
        assertThat(versionDefault).isEqualTo("0");
        assertIndexExists("idx_posts_search_trgm", true);
        String definition = jdbc.queryForObject(
                "SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_posts_search_trgm'", String.class);
        assertThat(definition).contains("gin").contains("search_text").contains("gin_trgm_ops").contains("WHERE published");
    }

    /** A migration half-applied before a crash is retried whole: V020 must pass over what is there and keep what was computed. */
    @Test
    void postPreviews_migrationCanRunAgainWithoutLosingAnything() throws Exception {
        String tracking = "test_v020_again_junit";
        String sql = new String(getClass().getResourceAsStream("/db/migrations/V020__post_previews.sql").readAllBytes(),
                java.nio.charset.StandardCharsets.UTF_8);
        int id = jdbc.queryForObject("""
                INSERT INTO posts (title, description, published, card_preview, search_text, preview_version)
                VALUES ('v020 again', 'body', false, '{"cols":1}', 'body', 1) RETURNING id""", Integer.class);
        try {
            new com.springbootprojects.webpostingserver.migration.DatabaseMigrator(jdbc, tracking).migrate(List.of(
                    new com.springbootprojects.webpostingserver.migration.DatabaseMigrator.MigrationScript("V020__post_previews", "again", sql)));

            assertThat(jdbc.queryForObject("SELECT card_preview || '|' || search_text || '|' || preview_version FROM posts WHERE id = ?",
                    String.class, id)).isEqualTo("{\"cols\":1}|body|1");
            assertIndexExists("idx_posts_search_trgm", true);
        } finally {
            jdbc.update("DELETE FROM posts WHERE id = ?", id);
            jdbc.execute("DROP TABLE IF EXISTS " + tracking);
        }
    }

    // ── Indexes added by V019 ─────────────────────────────────────────────────

    @Test
    void performanceIndexes_exist() {
        for (String index : List.of("idx_posts_pub_date", "idx_notifications_unread",
                "idx_notifications_new_post", "idx_conversations_user2", "idx_comments_user",
                "idx_post_uploads_upload", "idx_hashtags_tag_prefix", "idx_users_username_trgm")) {
            assertIndexExists(index, true);
        }
    }

    @Test
    void duplicateIndexes_areGone() {
        assertIndexExists("idx_notifications_recipient", false);
        assertIndexExists("idx_follows_follower", false);
        // the copies they duplicated stay
        assertIndexExists("idx_notif_recipient", true);
        assertIndexExists("follows_pkey", true);
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

    private void assertIndexExists(String index, boolean expected) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = ?",
                Integer.class, index);
        assertThat(count).as("Index '%s' existence", index).isEqualTo(expected ? 1 : 0);
    }

    private void assertColumnExists(String table, String column) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM information_schema.columns " +
                "WHERE table_name = ? AND column_name = ?",
                Integer.class, table, column);
        assertThat(count).as("Column '%s.%s' should exist", table, column).isEqualTo(1);
    }
}
