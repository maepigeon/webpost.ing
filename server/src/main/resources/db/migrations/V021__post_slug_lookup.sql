-- V021: Look posts up by slug
--
-- Posts are now reachable by slug alone (/mae/my-post), not only by id, so the
-- slug has to be looked up rather than just displayed.
--
-- Uniqueness is enforced in PostController rather than by a constraint: a
-- post's author lives in users_posts_junctions, and Postgres will not accept a
-- subquery inside an index expression, so "unique per author" cannot be
-- expressed here without denormalising the author onto `posts`. The controller
-- de-duplicates on save, and resolution is ordered by id so that even a race
-- between two saves resolves to the same post every time.
BEGIN;

CREATE INDEX IF NOT EXISTS idx_posts_slug_lower ON posts (lower(slug)) WHERE slug IS NOT NULL;

COMMIT;
