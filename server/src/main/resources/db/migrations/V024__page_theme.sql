-- V024: Per-user page theme
--
-- The look of a user's profile and posts: fonts, colours, page texture, card
-- style and effects, as JSON validated by ThemeValidator (known keys, hex
-- colours and clamped numbers only). NULL means the site default, Newspaper
-- Life.
BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS page_theme VARCHAR(4000) DEFAULT NULL;

COMMIT;
