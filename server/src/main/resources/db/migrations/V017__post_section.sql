-- V017: which part of the author's space a post belongs to
--
-- `profile` (the default, as every post was), `notes` (a quieter, public place
-- for published notes) or `subscribers` (private to the author until
-- subscriptions exist). Drafts are not a section: they are the unpublished
-- posts, whatever their section.
BEGIN;

ALTER TABLE posts ADD COLUMN IF NOT EXISTS section VARCHAR(16) NOT NULL DEFAULT 'profile';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'posts_section_check') THEN
        ALTER TABLE posts ADD CONSTRAINT posts_section_check
            CHECK (section IN ('profile', 'notes', 'subscribers'));
    END IF;
END $$;

COMMIT;
