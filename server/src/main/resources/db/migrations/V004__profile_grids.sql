-- V004: tile grids posted straight onto a profile
--
-- Each grid is its own row, so editing one saves only that one. The grid is
-- JSON validated by GridValidator (known fields, PNG paint, own uploads).
BEGIN;

CREATE TABLE IF NOT EXISTS profile_grids (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    grid       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profile_grids_user ON profile_grids(user_id, sort_order);

COMMIT;
