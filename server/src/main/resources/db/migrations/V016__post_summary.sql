-- V016: a short description of a post
--
-- Plain text of up to 300 characters, shown under the post's title on the
-- profile. Not the post's body (that is `description`, the editor's JSON); empty
-- means none.
BEGIN;

ALTER TABLE posts ADD COLUMN IF NOT EXISTS summary VARCHAR(300);

COMMIT;
