-- V022: Per-user code block display preferences
--
-- Applies to how *this user* sees code in every post they read, not to how
-- their own posts appear to others — reading comfort is personal, and a font
-- size that suits one reader should not be imposed on the rest.
BEGIN;

-- A key from the client's font list rather than a free CSS family: the value
-- reaches a stylesheet, and an allowlist keeps it from carrying anything else.
ALTER TABLE users ADD COLUMN IF NOT EXISTS code_font      VARCHAR(32) NOT NULL DEFAULT 'default';
ALTER TABLE users ADD COLUMN IF NOT EXISTS code_font_size SMALLINT    NOT NULL DEFAULT 13;

ALTER TABLE users ADD CONSTRAINT users_code_font_size_sane
    CHECK (code_font_size BETWEEN 10 AND 24) NOT VALID;

COMMIT;
