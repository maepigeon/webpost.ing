-- =============================================================
-- webpost.ing — PostgreSQL schema (fresh install)
-- Run with: psql -U <user> -d <dbname> -f config/database.sql
--
-- Creates all tables, seeds role_limits, and prints a reminder
-- to create the first admin user.
-- =============================================================


-- -------------------------------------------------------------
-- USERS
-- -------------------------------------------------------------
CREATE TABLE users (
    id                SERIAL PRIMARY KEY,
    username          VARCHAR(32)              NOT NULL UNIQUE,
    password          TEXT                     NOT NULL,          -- BCrypt hash (60 chars)
    registration_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_visited      TIMESTAMPTZ DEFAULT NULL,
    background_pattern VARCHAR(2000)           DEFAULT NULL,
    is_admin          BOOLEAN                  NOT NULL DEFAULT FALSE,
    role              VARCHAR(20)              NOT NULL DEFAULT 'user',
    bio               TEXT                     DEFAULT NULL,
    pattern_presets   TEXT                     NOT NULL DEFAULT '{}'
);


-- -------------------------------------------------------------
-- ROLE_LIMITS
-- Default storage and post-rate limits per user role.
-- -------------------------------------------------------------
CREATE TABLE role_limits (
    role               VARCHAR(20) PRIMARY KEY,
    max_storage_bytes  BIGINT  NOT NULL DEFAULT 52428800,   -- 50 MB
    max_posts_per_day  INTEGER NOT NULL DEFAULT 20
);

INSERT INTO role_limits (role, max_storage_bytes, max_posts_per_day) VALUES
    ('user',       52428800,   20),
    ('trusted',    524288000, 100),
    ('restricted', 5242880,     2),
    ('admin',      -1,         -1);   -- -1 = unlimited


-- -------------------------------------------------------------
-- POSTS
-- description stores the full Lexical editor JSON state.
-- -------------------------------------------------------------
CREATE TABLE posts (
    id               SERIAL PRIMARY KEY,
    title            VARCHAR(255)             NOT NULL,
    description      TEXT                     NOT NULL,
    published        BOOLEAN                  NOT NULL,
    date             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    edited_at        TIMESTAMPTZ DEFAULT NULL,
    background_pattern VARCHAR(2000)          DEFAULT NULL
);


-- -------------------------------------------------------------
-- USERS_POSTS_JUNCTIONS
-- Tracks which user authored which post (one author per post
-- in practice, but the schema permits reassignment).
-- -------------------------------------------------------------
CREATE TABLE users_posts_junctions (
    id      SERIAL  PRIMARY KEY,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    UNIQUE (post_id, user_id),
    CONSTRAINT upj_post_fk FOREIGN KEY (post_id) REFERENCES posts  (id),
    CONSTRAINT upj_user_fk FOREIGN KEY (user_id) REFERENCES users  (id)
);


-- -------------------------------------------------------------
-- UPLOADS
-- Tracks every file uploaded to disk.
-- filename is the UUID-based name under the uploads/ directory.
-- -------------------------------------------------------------
CREATE TABLE uploads (
    id            SERIAL PRIMARY KEY,
    filename      VARCHAR(255)             NOT NULL UNIQUE,
    user_id       INTEGER                  NOT NULL,
    original_name VARCHAR(255)             DEFAULT NULL,
    size_bytes    BIGINT                   NOT NULL DEFAULT 0,
    uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uploads_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);


-- -------------------------------------------------------------
-- POST_REACTIONS
-- Multiple reactions per user per post are allowed.
-- PK includes reaction so each (user, emoji) pair is unique.
-- -------------------------------------------------------------
CREATE TABLE post_reactions (
    post_id  INTEGER     NOT NULL,
    user_id  INTEGER     NOT NULL,
    reaction VARCHAR(20) NOT NULL,
    PRIMARY KEY (post_id, user_id, reaction),
    CONSTRAINT post_reactions_post_fk FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
    CONSTRAINT post_reactions_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);


-- -------------------------------------------------------------
-- FOLLOWS
-- -------------------------------------------------------------
CREATE TABLE follows (
    follower_id INTEGER NOT NULL,
    followed_id INTEGER NOT NULL,
    PRIMARY KEY (follower_id, followed_id),
    CONSTRAINT follows_follower_fk FOREIGN KEY (follower_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT follows_followed_fk FOREIGN KEY (followed_id) REFERENCES users (id) ON DELETE CASCADE
);


-- -------------------------------------------------------------
-- DISCUSSIONS
-- One row per post that has ever had discussion or reactions
-- touched. Created lazily on first interaction.
-- style: 'threaded' (default) or 'flat'
-- -------------------------------------------------------------
CREATE TABLE discussions (
    id                SERIAL PRIMARY KEY,
    post_id           INTEGER NOT NULL UNIQUE,
    enabled           BOOLEAN NOT NULL DEFAULT TRUE,
    reactions_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    style             VARCHAR(20) NOT NULL DEFAULT 'threaded',
    CONSTRAINT discussions_post_fk FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
);


-- -------------------------------------------------------------
-- COMMENTS
-- -------------------------------------------------------------
CREATE TABLE comments (
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
-- COMMENT_VOTES
-- -------------------------------------------------------------
CREATE TABLE comment_votes (
    comment_id INTEGER  NOT NULL,
    user_id    INTEGER  NOT NULL,
    vote       SMALLINT NOT NULL CHECK (vote IN (-1, 1)),
    PRIMARY KEY (comment_id, user_id),
    CONSTRAINT comment_votes_comment_fk FOREIGN KEY (comment_id) REFERENCES comments (id) ON DELETE CASCADE,
    CONSTRAINT comment_votes_user_fk    FOREIGN KEY (user_id)    REFERENCES users    (id) ON DELETE CASCADE
);


-- -------------------------------------------------------------
-- COMMENT_REACTIONS
-- Multiple reactions per user per comment are allowed.
-- -------------------------------------------------------------
CREATE TABLE comment_reactions (
    comment_id INTEGER     NOT NULL,
    user_id    INTEGER     NOT NULL,
    reaction   VARCHAR(20) NOT NULL,
    PRIMARY KEY (comment_id, user_id, reaction),
    CONSTRAINT comment_reactions_comment_fk FOREIGN KEY (comment_id) REFERENCES comments (id) ON DELETE CASCADE,
    CONSTRAINT comment_reactions_user_fk    FOREIGN KEY (user_id)    REFERENCES users    (id) ON DELETE CASCADE
);


-- -------------------------------------------------------------
-- POST_UPLOADS
-- Junction table: which uploads are currently referenced in
-- each post's content. Synced on every post save by scanning
-- the Lexical JSON for /uploads/ paths.
-- Enables orphan detection (uploads not in any post).
-- -------------------------------------------------------------
CREATE TABLE post_uploads (
    post_id   INTEGER NOT NULL,
    upload_id INTEGER NOT NULL,
    PRIMARY KEY (post_id, upload_id),
    CONSTRAINT post_uploads_post_fk   FOREIGN KEY (post_id)   REFERENCES posts   (id) ON DELETE CASCADE,
    CONSTRAINT post_uploads_upload_fk FOREIGN KEY (upload_id) REFERENCES uploads (id) ON DELETE CASCADE
);


-- -------------------------------------------------------------
-- NOTIFICATIONS
-- Covers: comment, reply, follow, reaction, new_post, message
-- -------------------------------------------------------------
CREATE TABLE notifications (
    id             SERIAL PRIMARY KEY,
    recipient_id   INTEGER      NOT NULL,
    type           VARCHAR(32)  NOT NULL,
    actor_username VARCHAR(32)  NOT NULL,
    post_id        INTEGER      DEFAULT NULL,
    comment_id     INTEGER      DEFAULT NULL,
    message        TEXT         DEFAULT NULL,
    is_read        BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT notifications_recipient_fk FOREIGN KEY (recipient_id) REFERENCES users (id) ON DELETE CASCADE
);


-- -------------------------------------------------------------
-- DM_BLOCKS
-- recipient blocks DMs from a specific sender
-- -------------------------------------------------------------
CREATE TABLE dm_blocks (
    blocker_id INTEGER NOT NULL,
    blocked_id INTEGER NOT NULL,
    PRIMARY KEY (blocker_id, blocked_id),
    CONSTRAINT dm_blocks_blocker_fk FOREIGN KEY (blocker_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT dm_blocks_blocked_fk FOREIGN KEY (blocked_id) REFERENCES users (id) ON DELETE CASCADE
);


-- -------------------------------------------------------------
-- ACTIVITY_DELETIONS
-- Audit log for things users delete (currently: comments).
-- Content is captured before deletion so the user can see what
-- they removed and which post it belonged to.
-- -------------------------------------------------------------
CREATE TABLE activity_deletions (
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


-- =============================================================
-- FIRST ADMIN USER
-- There is no public registration endpoint. Create your first
-- admin user via the admin panel after bootstrapping, or insert
-- one here (BCrypt-hash the password first):
--
--   INSERT INTO users (username, password, is_admin, role)
--   VALUES ('yourname', '<bcrypt-hash>', TRUE, 'admin');
--
-- Generate a hash: htpasswd -bnBC 10 "" yourpassword | tr -d ':\n'
-- or use: python3 -c "import bcrypt; print(bcrypt.hashpw(b'pw', bcrypt.gensalt(10)).decode())"
-- =============================================================
