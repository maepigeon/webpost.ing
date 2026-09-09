-- V020: Profile header image
--
-- An image shown behind the header card on a user's profile — the block holding
-- their avatar, name, bio and links. Replaces the plain glass panel.
BEGIN;

-- A path under /uploads, or NULL for the default glass panel. Stored as a path
-- rather than a foreign key to `uploads` because avatars already work this way
-- and the two should behave alike.
ALTER TABLE users ADD COLUMN IF NOT EXISTS header_path VARCHAR(500) DEFAULT NULL;

-- How the text over it should be coloured: 'auto' measures the image, or the
-- user can force 'light' or 'dark' when the automatic choice reads badly over a
-- busy photo.
ALTER TABLE users ADD COLUMN IF NOT EXISTS header_ink VARCHAR(8) NOT NULL DEFAULT 'auto';

ALTER TABLE users ADD CONSTRAINT users_header_ink_known
    CHECK (header_ink IN ('auto', 'light', 'dark')) NOT VALID;

COMMIT;
