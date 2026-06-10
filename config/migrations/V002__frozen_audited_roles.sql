-- =============================================================
-- V002 — Add frozen and audited roles to role_limits
--
-- frozen:  blocked at the auth layer; no API access
-- audited: normal limits but content hidden from non-admins
-- =============================================================

BEGIN;

INSERT INTO role_limits (role, max_storage_bytes, max_posts_per_day)
VALUES
    ('frozen',  0,        0),
    ('audited', 52428800, 20)
ON CONFLICT (role) DO NOTHING;

COMMIT;
