-- V020: what a post's card and search need, kept beside the body
--
-- card_preview: the post's first tile grid (the grid object of GRID-FORMAT.md),
--   or NULL when the post has none or its JSON is over PostPreview.PREVIEW_MAX_CHARS.
-- search_text: the post's plain text (PostTextExtractor blocks joined by
--   newlines, no markers), at most 20 000 characters; '' when none.
-- preview_version: 0 = not computed yet (the sweep fills it);
--   PostPreview.VERSION = computed by the current rule. Raising the constant
--   makes the sweep recompute every row.
-- Neither derived column counts toward the author's quota.
--
-- The columns are catalogue-only changes (no table rewrite) and the index is
-- built over all-NULL values, so this takes milliseconds. Every statement is
-- IF NOT EXISTS: running it twice is harmless.
BEGIN;

ALTER TABLE posts ADD COLUMN IF NOT EXISTS card_preview text;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS search_text text;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS preview_version smallint NOT NULL DEFAULT 0;

-- Search is ILIKE '%q%' over search_text, which needs a trigram index.
-- Published posts only: drafts are never searched. pg_trgm is created by V001;
-- as in V019, if it is somehow missing, say so and go on (search then scans,
-- which is slower but right): a failed migration stops the server.
DO $$
DECLARE
    trgm_schema text;
BEGIN
    SELECT n.nspname INTO trgm_schema
      FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
     WHERE e.extname = 'pg_trgm';

    IF trgm_schema IS NULL THEN
        RAISE NOTICE 'V020: pg_trgm is not installed, idx_posts_search_trgm not created';
    ELSE
        BEGIN
            EXECUTE format(
                'CREATE INDEX IF NOT EXISTS idx_posts_search_trgm ON posts USING gin (search_text %I.gin_trgm_ops) WHERE published',
                trgm_schema);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'V020: idx_posts_search_trgm not created (%)', SQLERRM;
        END;
    END IF;
END
$$;

COMMIT;
