-- =============================================================
-- V004 — Add folder to posts
--
-- Optional group/folder label for post organisation on the
-- user's profile page. Nullable; NULL = ungrouped.
-- =============================================================

BEGIN;

ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS folder VARCHAR(100) DEFAULT NULL;

COMMIT;
