-- V018: Author-chosen post slugs
--
-- A post URL is /{author}/{id}-{slug}. The slug defaults to a slugified title;
-- this column lets the author choose their own instead.
--
-- Deliberately NOT unique: the id in front of it is what identifies the post,
-- so two posts may share a slug harmlessly. Making it unique would mean
-- collision handling and a failure mode when someone picks a taken name, for no
-- benefit — the slug is decoration on an already-unique URL.
BEGIN;

ALTER TABLE posts ADD COLUMN IF NOT EXISTS slug VARCHAR(80) DEFAULT NULL;

COMMIT;
