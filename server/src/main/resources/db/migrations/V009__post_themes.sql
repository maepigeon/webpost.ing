-- V009: each post has its own theme
--
-- A post was drawn in its author's profile theme, so changing the profile
-- theme restyled every post they had ever written. Each post now keeps a
-- theme of its own. Existing posts start with a copy of their author's
-- current theme, so nothing looks different the moment this runs; a new post
-- gets a copy when it is created. NULL means the site default.
BEGIN;

ALTER TABLE posts ADD COLUMN IF NOT EXISTS page_theme text;

UPDATE posts p
   SET page_theme = u.page_theme
  FROM users_posts_junctions j
  JOIN users u ON u.id = j.user_id
 WHERE j.post_id = p.id
   AND p.page_theme IS NULL
   AND u.page_theme IS NOT NULL;

COMMIT;
