-- V017: Admin-managed custom fonts
--
-- An admin uploads a font file; it becomes selectable by every user in the post
-- editor. Files live on disk next to uploads; this table is the catalogue.
BEGIN;

CREATE TABLE IF NOT EXISTS custom_fonts (
    id           SERIAL       PRIMARY KEY,
    -- What the user sees in the picker.
    display_name VARCHAR(64)  NOT NULL,
    -- The CSS font-family name. Constrained to a safe character set on the way
    -- in, because it is interpolated into a stylesheet.
    family       VARCHAR(64)  NOT NULL UNIQUE,
    -- UUID-based filename under the fonts directory, never the uploaded name.
    filename     VARCHAR(255) NOT NULL UNIQUE,
    format       VARCHAR(16)  NOT NULL,
    size_bytes   BIGINT       NOT NULL DEFAULT 0,
    uploaded_by  VARCHAR(32)  DEFAULT NULL,
    -- Lets an admin retire a font without breaking posts that already use it.
    enabled      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT custom_fonts_format_known CHECK (format IN ('woff2', 'woff', 'ttf', 'otf'))
);

CREATE INDEX IF NOT EXISTS idx_custom_fonts_enabled ON custom_fonts(enabled, display_name);

COMMIT;
