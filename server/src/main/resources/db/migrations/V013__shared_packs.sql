-- V013: packs shared in direct messages
--
-- Sharing a pack of stickers or a pixel font (a symbols pack) in a message
-- takes a snapshot of it here. The message carries the line "[[pack:<id>]]";
-- anyone holding the id can see the pack and save a copy into their own
-- collection, and later edits or deletion of the original change nothing.
-- kind is 'stickers' (body: [{name, grid}]) or 'symbols' (body: {char: hex}).
BEGIN;

CREATE TABLE IF NOT EXISTS shared_packs (
    id         UUID PRIMARY KEY,
    sender_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       VARCHAR(16) NOT NULL,
    name       VARCHAR(40) NOT NULL,
    body       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT shared_packs_kind CHECK (kind IN ('stickers', 'symbols'))
);
CREATE INDEX IF NOT EXISTS idx_shared_packs_sender ON shared_packs(sender_id, created_at);

COMMIT;
