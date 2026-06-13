-- V011: DM reactions, group conversations, post sort order
BEGIN;

-- ── DM reactions ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dm_reactions (
    message_id  INTEGER     NOT NULL REFERENCES direct_messages(id) ON DELETE CASCADE,
    user_id     INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reaction    VARCHAR(32) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (message_id, user_id, reaction)
);

CREATE INDEX IF NOT EXISTS idx_dm_reactions_msg ON dm_reactions(message_id);

-- ── Group conversations ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS group_conversations (
    id          SERIAL      PRIMARY KEY,
    name        VARCHAR(100) NOT NULL DEFAULT 'Group',
    created_by  INTEGER     NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_conversation_members (
    group_id    INTEGER NOT NULL REFERENCES group_conversations(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_admin    BOOLEAN NOT NULL DEFAULT FALSE,
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_messages (
    id          SERIAL      PRIMARY KEY,
    group_id    INTEGER     NOT NULL REFERENCES group_conversations(id) ON DELETE CASCADE,
    sender_id   INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content     TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_messages_group ON group_messages(group_id, created_at);

CREATE TABLE IF NOT EXISTS group_message_read (
    group_id    INTEGER NOT NULL REFERENCES group_conversations(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id)
);

-- ── Post sort order ──────────────────────────────────────────────────────────

ALTER TABLE posts ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_posts_sort_order ON posts(sort_order);

COMMIT;
