-- V012: stickers, and stickies placed on pages
--
-- A sticker is a small tile grid (at most 16 × 16 tiles) in its maker's
-- collection, drawn with the grid editor and checked by GridValidator. A
-- sticky is one of the owner's stickers placed on their own profile (post_id
-- NULL) or on one of their posts: x is the centre's place across the page
-- column (0–1), y its distance from the column's top in CSS pixels, size the
-- CSS pixels per grid pixel. Comment reactions name a sticker as "sticker:<id>".
BEGIN;

CREATE TABLE IF NOT EXISTS stickers (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       VARCHAR(40) NOT NULL,
    grid       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stickers_user ON stickers(user_id, id);

CREATE TABLE IF NOT EXISTS stickies (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sticker_id INTEGER NOT NULL REFERENCES stickers(id) ON DELETE CASCADE,
    post_id    INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    x          REAL NOT NULL,
    y          REAL NOT NULL,
    size       SMALLINT NOT NULL DEFAULT 2,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT stickies_x_range CHECK (x >= 0 AND x <= 1),
    CONSTRAINT stickies_y_range CHECK (y >= 0 AND y <= 100000),
    CONSTRAINT stickies_size_range CHECK (size BETWEEN 1 AND 6)
);
CREATE INDEX IF NOT EXISTS idx_stickies_page ON stickies(user_id, post_id);

COMMIT;
