-- =============================================================
-- webpost.ing — migration from commit 00953d6 to current
--
-- Starting state: only users, posts, users_posts_junctions exist
-- (the old scratch schema). Applies all changes needed to reach
-- the current schema.
--
-- Run with: psql -U <user> -d <dbname> -f config/db-migrate-from-v1.sql
-- Always back up first:
--   pg_dump -Fc <dbname> > backup_before_migrate.dump
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- 1. users — widen password column for BCrypt (60-char hashes)
--    and add all new columns
-- -------------------------------------------------------------
ALTER TABLE users ALTER COLUMN password TYPE TEXT;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS background_pattern VARCHAR(2000) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS is_admin          BOOLEAN       NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS role              VARCHAR(20)   NOT NULL DEFAULT 'user',
    ADD COLUMN IF NOT EXISTS last_visited      TIMESTAMPTZ   DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS bio               TEXT          DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS pattern_presets   TEXT          NOT NULL DEFAULT '{}';


-- -------------------------------------------------------------
-- 2. posts — widen description to TEXT, add new columns
-- -------------------------------------------------------------
ALTER TABLE posts ALTER COLUMN description TYPE TEXT;

ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS edited_at         TIMESTAMPTZ   DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS background_pattern VARCHAR(2000) DEFAULT NULL;


-- -------------------------------------------------------------
-- 3. role_limits table + seed data
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS role_limits (
    role               VARCHAR(20) PRIMARY KEY,
    max_storage_bytes  BIGINT  NOT NULL DEFAULT 52428800,
    max_posts_per_day  INTEGER NOT NULL DEFAULT 20
);

INSERT INTO role_limits (role, max_storage_bytes, max_posts_per_day) VALUES
    ('user',       52428800,   20),
    ('trusted',    524288000, 100),
    ('restricted', 5242880,     2),
    ('admin',      -1,         -1)
ON CONFLICT (role) DO NOTHING;


-- -------------------------------------------------------------
-- 4. uploads
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS uploads (
    id            SERIAL PRIMARY KEY,
    filename      VARCHAR(255) NOT NULL UNIQUE,
    user_id       INTEGER      NOT NULL,
    original_name VARCHAR(255) DEFAULT NULL,
    size_bytes    BIGINT       NOT NULL DEFAULT 0,
    uploaded_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uploads_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);


-- -------------------------------------------------------------
-- 5. post_reactions — recreate PK to allow multiple per user
-- -------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'post_reactions') THEN
        CREATE TABLE post_reactions (
            post_id  INTEGER     NOT NULL,
            user_id  INTEGER     NOT NULL,
            reaction VARCHAR(20) NOT NULL,
            PRIMARY KEY (post_id, user_id, reaction),
            CONSTRAINT post_reactions_post_fk FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
            CONSTRAINT post_reactions_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        );
    ELSE
        -- Drop old single-reaction PK if it exists, add triple-column PK
        ALTER TABLE post_reactions DROP CONSTRAINT IF EXISTS post_reactions_pkey;
        ALTER TABLE post_reactions ADD PRIMARY KEY (post_id, user_id, reaction);
    END IF;
END $$;


-- -------------------------------------------------------------
-- 6. follows
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS follows (
    follower_id INTEGER NOT NULL,
    followed_id INTEGER NOT NULL,
    PRIMARY KEY (follower_id, followed_id),
    CONSTRAINT follows_follower_fk FOREIGN KEY (follower_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT follows_followed_fk FOREIGN KEY (followed_id) REFERENCES users (id) ON DELETE CASCADE
);


-- -------------------------------------------------------------
-- 7. discussions
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS discussions (
    id                SERIAL PRIMARY KEY,
    post_id           INTEGER NOT NULL UNIQUE,
    enabled           BOOLEAN NOT NULL DEFAULT TRUE,
    reactions_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    style             VARCHAR(20) NOT NULL DEFAULT 'threaded',
    CONSTRAINT discussions_post_fk FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
);


-- -------------------------------------------------------------
-- 8. comments
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comments (
    id            SERIAL PRIMARY KEY,
    discussion_id INTEGER NOT NULL,
    parent_id     INTEGER DEFAULT NULL,
    user_id       INTEGER NOT NULL,
    content       TEXT    NOT NULL,
    score         INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    edited_at     TIMESTAMPTZ DEFAULT NULL,
    CONSTRAINT comments_discussion_fk FOREIGN KEY (discussion_id) REFERENCES discussions (id) ON DELETE CASCADE,
    CONSTRAINT comments_parent_fk     FOREIGN KEY (parent_id)     REFERENCES comments   (id) ON DELETE CASCADE,
    CONSTRAINT comments_user_fk       FOREIGN KEY (user_id)       REFERENCES users       (id) ON DELETE CASCADE
);


-- -------------------------------------------------------------
-- 9. comment_votes
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comment_votes (
    comment_id INTEGER  NOT NULL,
    user_id    INTEGER  NOT NULL,
    vote       SMALLINT NOT NULL CHECK (vote IN (-1, 1)),
    PRIMARY KEY (comment_id, user_id),
    CONSTRAINT comment_votes_comment_fk FOREIGN KEY (comment_id) REFERENCES comments (id) ON DELETE CASCADE,
    CONSTRAINT comment_votes_user_fk    FOREIGN KEY (user_id)    REFERENCES users    (id) ON DELETE CASCADE
);


-- -------------------------------------------------------------
-- 10. comment_reactions
-- -------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'comment_reactions') THEN
        CREATE TABLE comment_reactions (
            comment_id INTEGER     NOT NULL,
            user_id    INTEGER     NOT NULL,
            reaction   VARCHAR(20) NOT NULL,
            PRIMARY KEY (comment_id, user_id, reaction),
            CONSTRAINT comment_reactions_comment_fk FOREIGN KEY (comment_id) REFERENCES comments (id) ON DELETE CASCADE,
            CONSTRAINT comment_reactions_user_fk    FOREIGN KEY (user_id)    REFERENCES users    (id) ON DELETE CASCADE
        );
    ELSE
        ALTER TABLE comment_reactions DROP CONSTRAINT IF EXISTS comment_reactions_pkey;
        ALTER TABLE comment_reactions ADD PRIMARY KEY (comment_id, user_id, reaction);
    END IF;
END $$;


-- -------------------------------------------------------------
-- 11. post_uploads
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS post_uploads (
    post_id   INTEGER NOT NULL,
    upload_id INTEGER NOT NULL,
    PRIMARY KEY (post_id, upload_id),
    CONSTRAINT post_uploads_post_fk   FOREIGN KEY (post_id)   REFERENCES posts   (id) ON DELETE CASCADE,
    CONSTRAINT post_uploads_upload_fk FOREIGN KEY (upload_id) REFERENCES uploads (id) ON DELETE CASCADE
);


-- -------------------------------------------------------------
-- 12. notifications (with message column)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id             SERIAL PRIMARY KEY,
    recipient_id   INTEGER     NOT NULL,
    type           VARCHAR(32) NOT NULL,
    actor_username VARCHAR(32) NOT NULL,
    post_id        INTEGER     DEFAULT NULL,
    comment_id     INTEGER     DEFAULT NULL,
    message        TEXT        DEFAULT NULL,
    is_read        BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT notifications_recipient_fk FOREIGN KEY (recipient_id) REFERENCES users (id) ON DELETE CASCADE
);

-- In case the table was already created without the message column:
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message TEXT DEFAULT NULL;


-- -------------------------------------------------------------
-- 13. dm_blocks
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dm_blocks (
    blocker_id INTEGER NOT NULL,
    blocked_id INTEGER NOT NULL,
    PRIMARY KEY (blocker_id, blocked_id),
    CONSTRAINT dm_blocks_blocker_fk FOREIGN KEY (blocker_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT dm_blocks_blocked_fk FOREIGN KEY (blocked_id) REFERENCES users (id) ON DELETE CASCADE
);

-- -------------------------------------------------------------
-- 14. activity_deletions
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_deletions (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER      NOT NULL,
    item_type   VARCHAR(32)  NOT NULL,
    summary     TEXT         DEFAULT NULL,
    post_id     INTEGER      DEFAULT NULL,
    post_title  VARCHAR(255) DEFAULT NULL,
    post_owner  VARCHAR(32)  DEFAULT NULL,
    deleted_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT activity_deletions_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

COMMIT;

-- Done. Verify with:
--   \dt                          -- list all tables
--   \d users                     -- inspect users columns
--   SELECT * FROM role_limits;   -- confirm seed data
