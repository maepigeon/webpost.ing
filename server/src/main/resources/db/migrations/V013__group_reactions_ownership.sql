-- V013: Group message reactions, group ownership transfer
BEGIN;

CREATE TABLE IF NOT EXISTS group_message_reactions (
    message_id  INTEGER     NOT NULL REFERENCES group_messages(id) ON DELETE CASCADE,
    user_id     INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reaction    VARCHAR(32) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (message_id, user_id, reaction)
);

CREATE INDEX IF NOT EXISTS idx_group_msg_reactions_msg ON group_message_reactions(message_id);

COMMIT;
