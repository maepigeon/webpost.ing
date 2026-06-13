-- V012: Security, scalability, and privacy hardening
BEGIN;

-- ── pg_trgm extension (must come first — trgm index depends on it) ───────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Performance indexes ───────────────────────────────────────────────────────

-- Fast lookup: notifications by recipient
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, created_at DESC);

-- Fast unread count on DMs
CREATE INDEX IF NOT EXISTS idx_dm_conv_unread
  ON direct_messages(conversation_id, sender_id, is_read)
  WHERE is_read = FALSE;

-- Fast user search (case-insensitive prefix)
CREATE INDEX IF NOT EXISTS idx_users_username_lower ON users(lower(username));

-- Fast post lookup by published status
CREATE INDEX IF NOT EXISTS idx_posts_published ON posts(published);

-- Fast hashtag lookup
CREATE INDEX IF NOT EXISTS idx_post_hashtags_hashtag ON post_hashtags(hashtag_id);

-- Full-text index for post title search
CREATE INDEX IF NOT EXISTS idx_posts_title_trgm ON posts USING gin(title gin_trgm_ops)
  WHERE published = TRUE;

-- Fast group membership check
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_conversation_members(user_id);

-- ── Privacy: soft-delete support for DMs ─────────────────────────────────────
ALTER TABLE direct_messages  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE group_messages    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- ── Invite code validation index ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_invite_codes_valid
  ON invite_codes(code, expires_at)
  WHERE used_by IS NULL;

COMMIT;
