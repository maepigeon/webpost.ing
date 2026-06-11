-- V008: Messages, post views, invite codes, user avatars, online tracking
BEGIN;

-- ── Direct message conversations ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conversations (
    id         SERIAL PRIMARY KEY,
    user1_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT conversations_ordered CHECK (user1_id < user2_id),
    UNIQUE (user1_id, user2_id)
);

CREATE TABLE IF NOT EXISTS direct_messages (
    id              SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content         TEXT    NOT NULL,
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_direct_messages_conv ON direct_messages(conversation_id, created_at);

-- ── Post views ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS post_views (
    post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ip_hash    VARCHAR(64),
    viewed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (post_id, user_id) DEFERRABLE
);

-- Allow multiple anonymous views tracked by ip_hash
CREATE TABLE IF NOT EXISTS post_view_totals (
    post_id        INTEGER PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
    total_views    BIGINT NOT NULL DEFAULT 0,
    unique_views   BIGINT NOT NULL DEFAULT 0
);

-- ── Invite codes ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invite_codes (
    code        VARCHAR(128) PRIMARY KEY,
    created_by  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    used_by     VARCHAR(100) DEFAULT NULL,
    used_at     TIMESTAMPTZ DEFAULT NULL
);

-- ── User avatars ──────────────────────────────────────────────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_path VARCHAR(500) DEFAULT NULL;

-- ── Online tracking (reuse last_visited) ─────────────────────────────────────
-- last_visited column already exists; add last_active_at for real-time online
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NULL;

-- ── Hashtags ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hashtags (
    id   SERIAL PRIMARY KEY,
    tag  VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS post_hashtags (
    post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    hashtag_id INTEGER NOT NULL REFERENCES hashtags(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, hashtag_id)
);

-- ── Registration: add email column ───────────────────────────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) DEFAULT NULL;

COMMIT;
