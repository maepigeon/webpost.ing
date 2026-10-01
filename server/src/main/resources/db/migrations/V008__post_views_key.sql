-- V008: recording a signed-in post view failed every time
--
-- post_views' primary key was DEFERRABLE, and PostgreSQL cannot use a
-- deferrable constraint to settle ON CONFLICT, so
-- "INSERT INTO post_views ... ON CONFLICT DO NOTHING" raised an error on each
-- signed-in view and no view was ever recorded. The key becomes an ordinary
-- one. The user foreign key said ON DELETE SET NULL, which can never work on a
-- column that is part of the primary key: deleting a user who had viewed a
-- post would fail. Their views now go with them.
BEGIN;

ALTER TABLE post_views DROP CONSTRAINT IF EXISTS post_views_pkey;
ALTER TABLE post_views ADD CONSTRAINT post_views_pkey PRIMARY KEY (post_id, user_id);

ALTER TABLE post_views DROP CONSTRAINT IF EXISTS post_views_user_id_fkey;
ALTER TABLE post_views ADD CONSTRAINT post_views_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

COMMIT;
