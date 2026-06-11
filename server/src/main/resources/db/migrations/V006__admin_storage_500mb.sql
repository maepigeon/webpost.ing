-- =============================================================
-- V006 — Set admin storage quota to 500 MB (was unlimited/-1)
-- =============================================================

BEGIN;

UPDATE role_limits SET max_storage_bytes = 524288000 WHERE role = 'admin';

COMMIT;
