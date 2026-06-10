-- =============================================================
-- V005 — Scalability indexes
--
-- All are CREATE INDEX IF NOT EXISTS — safe to re-run.
-- =============================================================

CREATE INDEX IF NOT EXISTS idx_upj_user_id       ON users_posts_junctions (user_id);
CREATE INDEX IF NOT EXISTS idx_upj_post_id        ON users_posts_junctions (post_id);

CREATE INDEX IF NOT EXISTS idx_posts_date         ON posts (date DESC);
CREATE INDEX IF NOT EXISTS idx_posts_published    ON posts (published);

CREATE INDEX IF NOT EXISTS idx_notif_recipient    ON notifications (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_read         ON notifications (recipient_id, is_read);

CREATE INDEX IF NOT EXISTS idx_follows_follower   ON follows (follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_followed   ON follows (followed_id);

CREATE INDEX IF NOT EXISTS idx_reactions_post     ON post_reactions (post_id);

CREATE INDEX IF NOT EXISTS idx_uploads_user       ON uploads (user_id);

CREATE INDEX IF NOT EXISTS idx_comments_discussion ON comments (discussion_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent     ON comments (parent_id);

CREATE INDEX IF NOT EXISTS idx_dm_blocks_blocker  ON dm_blocks (blocker_id);
CREATE INDEX IF NOT EXISTS idx_dm_blocks_blocked  ON dm_blocks (blocked_id);

CREATE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username));

CREATE INDEX IF NOT EXISTS idx_activity_del_user  ON activity_deletions (user_id, deleted_at DESC);
