-- =============================================================
-- V003 — Add pinned_post_id to users
--
-- Allows each user to pin one post to the top of their profile.
-- Nullable; NULL = no pinned post.
-- =============================================================

BEGIN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS pinned_post_id INTEGER DEFAULT NULL;

COMMIT;
