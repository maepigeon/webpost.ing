-- V014: Responsive image variants
--
-- Each upload can have several downscaled renditions so the browser can pick
-- one that suits its viewport, pixel density and connection instead of always
-- pulling the full-size original.
--
-- Variants are rows here rather than columns on `uploads` because the set of
-- widths is expected to change, and because a variant can fail to generate
-- independently of the others (an unsupported format, a write error) without
-- leaving a half-populated row.
BEGIN;

CREATE TABLE IF NOT EXISTS upload_variants (
    id          SERIAL       PRIMARY KEY,
    upload_id   INTEGER      NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
    filename    VARCHAR(255) NOT NULL UNIQUE,
    width       INTEGER      NOT NULL,
    size_bytes  BIGINT       NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT upload_variants_width_positive CHECK (width > 0)
);

-- Lookups are always "every variant for this upload, narrowest first".
CREATE INDEX IF NOT EXISTS idx_upload_variants_upload ON upload_variants(upload_id, width);

-- Intrinsic dimensions of the original, so the client can reserve the right
-- amount of space before the image loads and avoid layout shift.
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS width  INTEGER DEFAULT NULL;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS height INTEGER DEFAULT NULL;

COMMIT;
