-- V019: Per-user site-wide background
--
-- Separate from background_pattern, which is the wallpaper shown on a user's
-- own profile to everyone who visits it. This one is a personal preference
-- applied only for its owner, across the parts of the site that are not
-- somebody's profile or post — those keep showing their author's wallpaper.
BEGIN;

-- Stores the same JSON v2 wallpaper format as background_pattern. NULL means
-- "no site background", which is the default and matches current behaviour.
ALTER TABLE users ADD COLUMN IF NOT EXISTS site_background VARCHAR(2000) DEFAULT NULL;

COMMIT;
