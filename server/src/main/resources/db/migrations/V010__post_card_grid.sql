-- V010: whether a post's card on the profile shows the post's first grid
--
-- On by default, for posts old and new; the author can turn it off from the
-- editor's Page menu when the grid isn't the part worth previewing.
BEGIN;

ALTER TABLE posts ADD COLUMN IF NOT EXISTS card_grid boolean NOT NULL DEFAULT true;

COMMIT;
