-- V007: voting on a post is the author's choice, off for new posts
--
-- Posts that already exist keep voting, as their readers have had it; the
-- column's default then changes so a post made from now on starts without it.
BEGIN;

ALTER TABLE posts ADD COLUMN votes_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE posts ALTER COLUMN votes_enabled SET DEFAULT false;

COMMIT;
