-- V014: who has saved each shared pack
--
-- Saving a pack copies it into the reader's collection once; this row is what
-- makes a second press (after a reload, say) a no-op instead of a second copy.
BEGIN;

CREATE TABLE IF NOT EXISTS shared_pack_saves (
    pack_id  UUID NOT NULL REFERENCES shared_packs(id) ON DELETE CASCADE,
    user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (pack_id, user_id)
);

COMMIT;
