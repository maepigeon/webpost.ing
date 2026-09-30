-- V003: every post gets a stored, unique slug
--
-- Posts are addressed as /author/slug. New and edited posts now always store
-- one (from the title when the author has not chosen one); this fills in the
-- rest the same way, so two posts with the same title get "title" and
-- "title-2" instead of sharing an address only the older one answers.
--
-- Mirrors slugify(): lower case, anything outside a–z/0–9 becomes one hyphen,
-- trimmed, at most 60 characters. Placeholder titles keep no slug and stay
-- addressed by id.
BEGIN;

WITH derived AS (
    SELECT p.id,
           j.user_id,
           left(trim(both '-' from regexp_replace(lower(p.title), '[^a-z0-9]+', '-', 'g')), 60) AS base
      FROM posts p
      JOIN users_posts_junctions j ON j.post_id = p.id
     WHERE (p.slug IS NULL OR p.slug = '')
),
usable AS (
    SELECT id, user_id, trim(trailing '-' from base) AS base
      FROM derived
     WHERE base <> '' AND base NOT IN ('untitled', 'undefined', 'null', 'new-post', 'post')
),
taken AS (
    SELECT lower(p.slug) AS slug, j.user_id
      FROM posts p JOIN users_posts_junctions j ON j.post_id = p.id
     WHERE p.slug IS NOT NULL AND p.slug <> ''
),
numbered AS (
    SELECT u.id, u.base,
           row_number() OVER (PARTITION BY u.user_id, u.base ORDER BY u.id)
             + CASE WHEN EXISTS (SELECT 1 FROM taken t WHERE t.user_id = u.user_id AND t.slug = u.base) THEN 1 ELSE 0 END AS n
      FROM usable u
)
UPDATE posts p
   SET slug = CASE WHEN n.n = 1 THEN n.base ELSE n.base || '-' || n.n END
  FROM numbered n
 WHERE p.id = n.id;

COMMIT;
