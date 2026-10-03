-- Two accounts whose names differ only in capitals ("mae" and "Mae") look the
-- same to a reader, so one can pass for the other. Sign-up now refuses such a
-- name; this index makes the database refuse it too.
--
-- If the table already holds such a pair, the index is not created (it would
-- fail, and a failed migration stops the server): the pair is logged instead,
-- sign-up still refuses new ones, and running this again after renaming one
-- of them adds the index.
BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM users GROUP BY LOWER(username) HAVING COUNT(*) > 1) THEN
        RAISE NOTICE 'usernames differing only by case exist; users_username_lower_key was not created';
    ELSE
        CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_key ON users (LOWER(username));
    END IF;
END $$;

COMMIT;
