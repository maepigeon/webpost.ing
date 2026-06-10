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
    username          VARCHAR(32)              NOT NULL,
    password          VARCHAR(60)              NOT NULL,
    registration_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    background_pattern VARCHAR(2000)           DEFAULT NULL,
    is_admin          BOOLEAN                  NOT NULL DEFAULT FALSE,
    role              VARCHAR(20)              NOT NULL DEFAULT 'user',
    pattern_presets   TEXT                              DEFAULT '{}',
    last_visited      TIMESTAMP WITH TIME ZONE          DEFAULT NULL,
    bio               VARCHAR(500)                      DEFAULT NULL,
    bio_links         TEXT                              DEFAULT NULL,
    pinned_post_id    INTEGER                           DEFAULT NULL,
    UNIQUE (username)
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
    ('admin',      -1,         -1),   -- -1 = unlimited
    ('frozen',     0,           0),   -- frozen: blocked at auth layer, no API access
    ('audited',    52428800,   20);   -- audited: normal limits but content hidden from non-admins


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
    background_pattern VARCHAR(2000)          DEFAULT NULL,
    folder           VARCHAR(100)            DEFAULT NULL
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
    recipient_id   INTEGER     NOT NULL,
    type           VARCHAR(32) NOT NULL,
    actor_username VARCHAR(32) NOT NULL,
    post_id        INTEGER     DEFAULT NULL,
    comment_id     INTEGER     DEFAULT NULL,
    is_read        BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    message        TEXT        DEFAULT NULL,
    CONSTRAINT notifications_recipient_fk FOREIGN KEY (recipient_id) REFERENCES users (id) ON DELETE CASCADE
);


-- -------------------------------------------------------------
-- DM_BLOCKS
-- Tracks which users have blocked direct messages from whom.
-- blocker_id has blocked incoming messages from blocked_id.
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


-- =============================================================
-- MIGRATIONS
-- For EXISTING databases only — fresh installs get all columns above.
-- Always take a backup first: pg_dump -Fc mydb > backup.dump
-- =============================================================

-- Migration 001 — description type change
--   ALTER TABLE posts ALTER COLUMN description TYPE TEXT;

-- Migration 002 — add background_pattern columns
--   ALTER TABLE posts ADD COLUMN background_pattern VARCHAR(2000) DEFAULT NULL;
--   ALTER TABLE users ADD COLUMN background_pattern VARCHAR(2000) DEFAULT NULL;

-- Migration 003 — add is_admin to users
--   ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Migration 004 — add edited_at to posts
--   ALTER TABLE posts ADD COLUMN edited_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Migration 005 — create uploads tracking table
--   CREATE TABLE uploads (
--       id            SERIAL PRIMARY KEY,
--       filename      VARCHAR(255) NOT NULL UNIQUE,
--       user_id       INTEGER      NOT NULL,
--       original_name VARCHAR(255) DEFAULT NULL,
--       size_bytes    BIGINT       NOT NULL DEFAULT 0,
--       uploaded_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
--       CONSTRAINT uploads_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
--   );

-- Migration 006 — add style column to discussions
--   ALTER TABLE discussions ADD COLUMN style VARCHAR(20) NOT NULL DEFAULT 'threaded';

-- Migration 007 — allow multiple reactions per user per post
--   ALTER TABLE post_reactions DROP CONSTRAINT post_reactions_pkey;
--   ALTER TABLE post_reactions ADD PRIMARY KEY (post_id, user_id, reaction);

-- Migration 008 — allow multiple reactions per user per comment
--   -- Only if comment_reactions was already created with old schema:
--   ALTER TABLE comment_reactions DROP CONSTRAINT comment_reactions_pkey;
--   ALTER TABLE comment_reactions ADD PRIMARY KEY (comment_id, user_id, reaction);

-- Migration 009 — add role column and role_limits table
--   ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user';
--   CREATE TABLE role_limits (...); -- see current CREATE TABLE above for full definition
--   INSERT INTO role_limits(role, max_storage_bytes, max_posts_per_day) VALUES
--       ('user',       52428800,   20),
--       ('trusted',    524288000, 100),
--       ('restricted', 5242880,     2),
--       ('admin',      -1,         -1);

-- Migration 010 — post_uploads junction table
--   CREATE TABLE post_uploads (...); -- see current CREATE TABLE above for full definition

-- Migration 011 — add last_visited to users (now in base schema)
--   ALTER TABLE users ADD COLUMN IF NOT EXISTS last_visited TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Migration 012 — add message to notifications (now in base schema)
--   ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message TEXT;

-- Migration 013 — add pattern_presets to users (now in base schema)
--   ALTER TABLE users ADD COLUMN IF NOT EXISTS pattern_presets TEXT DEFAULT '{}';

-- Migration 014 — add bio to users (now in base schema)
--   ALTER TABLE users ADD COLUMN IF NOT EXISTS bio VARCHAR(500) DEFAULT NULL;

-- Migration 015 — create dm_blocks table (now in base schema)
--   CREATE TABLE IF NOT EXISTS dm_blocks (
--       blocker_id INTEGER NOT NULL,
--       blocked_id INTEGER NOT NULL,
--       PRIMARY KEY (blocker_id, blocked_id),
--       CONSTRAINT dm_blocks_blocker_fk FOREIGN KEY (blocker_id) REFERENCES users (id) ON DELETE CASCADE,
--       CONSTRAINT dm_blocks_blocked_fk FOREIGN KEY (blocked_id) REFERENCES users (id) ON DELETE CASCADE
--   );

-- Migration 016 — create activity_deletions table (now in base schema)
--   CREATE TABLE IF NOT EXISTS activity_deletions (
--       id          SERIAL PRIMARY KEY,
--       user_id     INTEGER      NOT NULL,
--       item_type   VARCHAR(32)  NOT NULL,
--       summary     TEXT         DEFAULT NULL,
--       post_id     INTEGER      DEFAULT NULL,
--       post_title  VARCHAR(255) DEFAULT NULL,
--       post_owner  VARCHAR(32)  DEFAULT NULL,
--       deleted_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
--       CONSTRAINT activity_deletions_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
--   );

-- Migration 017 — add bio_links to users (now in base schema)
--   ALTER TABLE users ADD COLUMN IF NOT EXISTS bio_links TEXT DEFAULT NULL;

-- Migration 020 — add folder to posts
--   ALTER TABLE posts ADD COLUMN IF NOT EXISTS folder VARCHAR(100) DEFAULT NULL;

-- Migration 019 — add pinned_post_id to users
--   ALTER TABLE users ADD COLUMN IF NOT EXISTS pinned_post_id INTEGER DEFAULT NULL;

-- Migration 018 — add frozen/audited roles to role_limits
--   INSERT INTO role_limits (role, max_storage_bytes, max_posts_per_day)
--       VALUES ('frozen', 0, 0), ('audited', 52428800, 20)
--       ON CONFLICT (role) DO NOTHING;

-- =============================================================
-- SCALABILITY INDEXES
-- Run once on existing databases to improve query performance.
-- All are CREATE INDEX IF NOT EXISTS — safe to re-run.
-- =============================================================

-- Post lookups by owner (most common read path)
CREATE INDEX IF NOT EXISTS idx_upj_user_id  ON users_posts_junctions (user_id);
CREATE INDEX IF NOT EXISTS idx_upj_post_id  ON users_posts_junctions (post_id);

-- Post listing sorted by date (user profile page pagination)
CREATE INDEX IF NOT EXISTS idx_posts_date   ON posts (date DESC);
CREATE INDEX IF NOT EXISTS idx_posts_published ON posts (published);

-- Notification inbox (recipient feed, sorted newest first)
CREATE INDEX IF NOT EXISTS idx_notif_recipient ON notifications (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_read      ON notifications (recipient_id, is_read);

-- Follow graph lookups
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows (follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_followed ON follows (followed_id);

-- Reaction counts per post
CREATE INDEX IF NOT EXISTS idx_reactions_post ON post_reactions (post_id);

-- Upload tracking per user
CREATE INDEX IF NOT EXISTS idx_uploads_user ON uploads (user_id);

-- Comment thread traversal
CREATE INDEX IF NOT EXISTS idx_comments_discussion ON comments (discussion_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent     ON comments (parent_id);

-- DM block lookups
CREATE INDEX IF NOT EXISTS idx_dm_blocks_blocker ON dm_blocks (blocker_id);
CREATE INDEX IF NOT EXISTS idx_dm_blocks_blocked ON dm_blocks (blocked_id);

-- User search by username (case-insensitive prefix scan)
CREATE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username));

-- Activity deletions feed
CREATE INDEX IF NOT EXISTS idx_activity_del_user ON activity_deletions (user_id, deleted_at DESC);
