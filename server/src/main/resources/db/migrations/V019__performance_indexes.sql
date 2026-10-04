-- V019: indexes the hot paths were missing (performance review 2026-10-03)
--
-- Every statement is IF NOT EXISTS (or guarded), so running it twice is
-- harmless. The tables are small enough that a plain, blocking CREATE INDEX
-- takes well under a second. Nothing here changes any data or any column.
BEGIN;

-- Following, Discover, sitemap, search and hashtag pages all order published
-- posts by (date DESC, id DESC); a partial index skips drafts and serves the
-- order without a sort.
CREATE INDEX IF NOT EXISTS idx_posts_pub_date ON posts (date DESC, id DESC) WHERE published;

-- Unread-count poll (every 30 s per tab): count only the unread rows of one user.
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (recipient_id) WHERE NOT is_read;

-- PostController.alreadyAnnounced: COUNT(*) FROM notifications WHERE type = 'new_post'
-- AND post_id = ? had no index on post_id (a sequential scan on every publish).
CREATE INDEX IF NOT EXISTS idx_notifications_new_post ON notifications (post_id) WHERE type = 'new_post';

-- "user1_id = ? OR user2_id = ?" could only use the unique (user1_id, user2_id)
-- index for one side.
CREATE INDEX IF NOT EXISTS idx_conversations_user2 ON conversations (user2_id);

-- Profile page and post lookups join the junction by user; including post_id
-- lets the planner read the junction from the index alone.
CREATE INDEX IF NOT EXISTS idx_upj_user_post ON users_posts_junctions (user_id, post_id);

-- StorageAccountService.usage() (runs on every post save) and the activity
-- page: per-user counts over these tables had no user index.
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments (user_id);
CREATE INDEX IF NOT EXISTS idx_post_reactions_user ON post_reactions (user_id);
CREATE INDEX IF NOT EXISTS idx_comment_reactions_user ON comment_reactions (user_id);
CREATE INDEX IF NOT EXISTS idx_post_votes_user ON post_votes (user_id);
CREATE INDEX IF NOT EXISTS idx_post_views_user ON post_views (user_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_sender ON direct_messages (sender_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_group_messages_sender ON group_messages (sender_id) WHERE deleted_at IS NULL;

-- Orphan cleanup (AdminController) and deleting a post look up by upload_id;
-- the primary key starts with post_id.
CREATE INDEX IF NOT EXISTS idx_post_uploads_upload ON post_uploads (upload_id);

-- Hashtag suggest is LIKE 'q%': a plain btree cannot serve that under a
-- non-C collation without text_pattern_ops.
CREATE INDEX IF NOT EXISTS idx_hashtags_tag_prefix ON hashtags (tag text_pattern_ops);

-- User search is ILIKE '%q%', which needs a trigram index. pg_trgm is already
-- created by V001, but if the database role may not create extensions and it
-- is somehow missing, say so and go on: a failed migration stops the server.
DO $$
DECLARE
    trgm_schema text;
BEGIN
    BEGIN
        CREATE EXTENSION IF NOT EXISTS pg_trgm;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'V019: could not create pg_trgm (%), skipping the username trigram index', SQLERRM;
    END;

    SELECT n.nspname INTO trgm_schema
      FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
     WHERE e.extname = 'pg_trgm';

    IF trgm_schema IS NULL THEN
        RAISE NOTICE 'V019: pg_trgm is not installed, idx_users_username_trgm not created';
    ELSE
        BEGIN
            EXECUTE format(
                'CREATE INDEX IF NOT EXISTS idx_users_username_trgm ON users USING gin (username %I.gin_trgm_ops)',
                trgm_schema);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'V019: idx_users_username_trgm not created (%)', SQLERRM;
        END;
    END IF;
END
$$;

-- Redundant copies that only slow every insert (a new_post fan-out inserts one
-- notification per follower). Each is dropped only while the index that makes
-- it redundant exists: idx_notif_recipient has the same columns, and the
-- follows primary key (follower_id, followed_id) starts with follower_id.
DO $$
BEGIN
    IF to_regclass('idx_notif_recipient') IS NOT NULL THEN
        DROP INDEX IF EXISTS idx_notifications_recipient;
    END IF;
    IF to_regclass('follows_pkey') IS NOT NULL THEN
        DROP INDEX IF EXISTS idx_follows_follower;
    END IF;
END
$$;

COMMIT;
