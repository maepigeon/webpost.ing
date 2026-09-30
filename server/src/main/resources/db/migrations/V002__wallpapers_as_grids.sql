-- V002: wallpapers and page themes are tile grids
--
-- Wallpapers were CSS patterns in a 2000-character column; they are now tile
-- grids (see WallpaperValidator), which carry their pixels as PNGs, and page
-- themes embed them. The columns become TEXT, and the old values are cleared:
-- a CSS pattern has no meaning in the new format, and backward compatibility
-- was dropped on purpose.
BEGIN;

ALTER TABLE users ALTER COLUMN background_pattern TYPE text;
ALTER TABLE users ALTER COLUMN site_background    TYPE text;
ALTER TABLE users ALTER COLUMN page_theme         TYPE text;
ALTER TABLE posts ALTER COLUMN background_pattern TYPE text;

UPDATE users SET background_pattern = NULL, site_background = NULL, page_theme = NULL, pattern_presets = '{}';
UPDATE posts SET background_pattern = NULL;

COMMIT;
