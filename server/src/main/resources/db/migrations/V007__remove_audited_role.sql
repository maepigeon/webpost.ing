-- =============================================================
-- V007 — Remove the audited role; convert existing audited users to 'user'
-- =============================================================

BEGIN;

UPDATE users SET role = 'user' WHERE role = 'audited';
DELETE FROM role_limits WHERE role = 'audited';

COMMIT;
