-- V005: pixel font libraries
--
-- A user's own sets of custom characters — a "wingdings" of their making —
-- drawn with the grid editor's character designer and reusable in any grid.
-- glyphs is a JSON object of character → bitmap hex, checked by
-- GridValidator.cleanGlyphs.
BEGIN;

CREATE TABLE IF NOT EXISTS pixel_fonts (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       VARCHAR(40) NOT NULL,
    glyphs     TEXT NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pixel_fonts_user ON pixel_fonts(user_id, name);

COMMIT;
