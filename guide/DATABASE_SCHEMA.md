# Database Schema Reference

Database: PostgreSQL. The connection comes from `deploy.env` (see [CONFIGURATION.md](CONFIGURATION.md)); `application.properties` only wires the variables.
Migrations V001 to V014 are described in [MIGRATIONS.md](MIGRATIONS.md); the exact schema is `V001__schema.sql` plus the later files.
All tables are in the `public` schema.

---

## Fresh install (new system)

**1. Install PostgreSQL and create a database**
```bash
# Ubuntu/Debian
sudo apt install postgresql

sudo -u postgres psql <<EOF
CREATE USER yourname WITH PASSWORD 'yourpassword';
CREATE DATABASE your_database OWNER yourname;
EOF
```

**2. Start the server** — it creates every table, index and seed row on first
start, from `server/src/main/resources/db/migrations/V001__schema.sql`.

**3. Point the server at it** with `DB_NAME`, `DB_USER` and `DB_SOCKET` (or
`DB_PASSWORD`) in `deploy.env`; see [CONFIGURATION.md](CONFIGURATION.md). The
`.properties` files hold no credentials.

**4. Create the first admin user** — there is no public registration endpoint, so insert one manually:
```bash
# Generate a BCrypt hash of your password (cost factor 10)
python3 -c "import bcrypt; print(bcrypt.hashpw(b'yourpassword', bcrypt.gensalt(10)).decode())"

# Insert the admin user (replace hash with output above)
psql -U yourname -d your_database -c \
  "INSERT INTO users (username, password, is_admin, role) VALUES ('yourusername', '\$2b\$10\$...', TRUE, 'admin');"
```

After that, all other users can be created through the admin panel in the UI.

**5. (Production only)** Set `APP_PROFILE=prod` in `deploy.env`.
The prod profile sets `Secure` + `SameSite=Strict` on cookies and requires an absolute `UPLOAD_DIR`.

---

## How tests use the database

183 of 184 tests are pure unit tests using Mockito mocks — they never touch any database. `RestServicePostApplicationTests` boots the Spring context and requires a live connection. `DatabaseSchemaTest` connects to the real database and validates every table, column, and seed row — run it after any migration to confirm the live schema is correct.

See [MIGRATIONS.md](MIGRATIONS.md) for the full migration system documentation.

---

---

## users

The central user table. One row per registered account.

```sql
CREATE TABLE users (
  id                 SERIAL PRIMARY KEY,
  username           VARCHAR(32)   NOT NULL UNIQUE,
  password           TEXT          NOT NULL,   -- BCrypt hash (60 chars)
  registration_date  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  background_pattern VARCHAR(2000),            -- wallpaper pattern string (see PatternValidator)
  is_admin           BOOLEAN       NOT NULL DEFAULT false,
  role               VARCHAR(20)   NOT NULL DEFAULT 'user',
  last_visited       TIMESTAMPTZ,
  bio                VARCHAR(500),             -- max 500 chars, HTML-stripped on write
  bio_links          TEXT,                     -- JSON array of {url, label} objects (max 3)
  pattern_presets    TEXT          DEFAULT '{}',  -- JSON map of saved wallpaper presets
  pinned_post_id     INTEGER       DEFAULT NULL,  -- post pinned to top of profile
  banner_grid        TEXT                         -- the owner's rows of the profile banner, a grid (V011)
);
```

**Common queries:**
```sql
-- Get a user
SELECT * FROM users WHERE username = 'alice';

-- List all users by last activity
SELECT username, last_visited FROM users ORDER BY last_visited DESC NULLS LAST;

-- Update role
UPDATE users SET role = 'admin' WHERE username = 'alice';

-- Manually reset password (plain text until BCrypt migration)
UPDATE users SET password = 'newpassword' WHERE username = 'alice';
```

---

## posts

Stores post content (title + Lexical editor JSON in `description`).

```sql
CREATE TABLE posts (
  id                 SERIAL PRIMARY KEY,
  title              VARCHAR(255) NOT NULL,
  description        TEXT         NOT NULL,   -- Lexical editor state JSON
  published          BOOLEAN      NOT NULL,   -- false = draft
  date               TIMESTAMPTZ  NOT NULL DEFAULT now(),
  background_pattern TEXT,                    -- post-level wallpaper (optional)
  edited_at          TIMESTAMPTZ,            -- set on PUT /api/posts/:id
  folder             VARCHAR,                 -- profile folder (optional)
  sort_order         INTEGER,                 -- position on the profile
  slug               VARCHAR,                 -- /{username}/{slug}
  votes_enabled      BOOLEAN      NOT NULL DEFAULT false, -- up/down votes and score (V007)
  page_theme         TEXT,                    -- the post's own theme, copied from the author's at creation (V009)
  card_grid          BOOLEAN      NOT NULL DEFAULT true   -- profile card previews the first grid (V010)
);
```

**Common queries:**
```sql
-- All published posts
SELECT id, title, date FROM posts WHERE published = true ORDER BY date DESC;

-- All posts by a user
SELECT p.* FROM posts p
JOIN users_posts_junctions j ON j.post_id = p.id
JOIN users u ON u.id = j.user_id
WHERE u.username = 'alice' ORDER BY p.date DESC;

-- Find drafts
SELECT p.id, p.title FROM posts p
JOIN users_posts_junctions j ON j.post_id = p.id
JOIN users u ON u.id = j.user_id
WHERE u.username = 'alice' AND p.published = false;
```

---

## users_posts_junctions

Maps posts to their owners. One row per post (a post has exactly one owner).

```sql
CREATE TABLE users_posts_junctions (
  id      SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id)  ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  UNIQUE (post_id, user_id)
);
```

**Note:** Both FKs now have ON DELETE CASCADE, so deleting a user or post cleans up the junction automatically. The Java `deleteUser()` method still manually cleans junctions first for safety.

**Common queries:**
```sql
-- Who owns post 42?
SELECT u.username FROM users u
JOIN users_posts_junctions j ON j.user_id = u.id
WHERE j.post_id = 42;

-- Manually reassign post ownership (use with caution)
UPDATE users_posts_junctions SET user_id = (SELECT id FROM users WHERE username = 'bob')
WHERE post_id = 42;
```

---

## discussions

One row per post that has discussion enabled. Created when a post's discussion is toggled on.

```sql
CREATE TABLE discussions (
  id                 SERIAL PRIMARY KEY,
  post_id            INTEGER NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
  enabled            BOOLEAN      DEFAULT true,
  created_at         TIMESTAMP    DEFAULT now(),
  reactions_enabled  BOOLEAN      DEFAULT false,
  style              VARCHAR(20)  NOT NULL DEFAULT 'threaded'  -- 'threaded' | 'flat'
);
```

**Common queries:**
```sql
-- Get discussion for a post
SELECT * FROM discussions WHERE post_id = 42;

-- Enable reactions on a discussion
UPDATE discussions SET reactions_enabled = true WHERE post_id = 42;
```

---

## comments

Threaded comments on discussions. `parent_id` NULL = top-level; non-null = reply.

```sql
CREATE TABLE comments (
  id            SERIAL PRIMARY KEY,
  discussion_id INTEGER   NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
  parent_id     INTEGER            REFERENCES comments(id)    ON DELETE CASCADE,
  user_id       INTEGER   NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  content       TEXT      NOT NULL,
  score         INTEGER   DEFAULT 0,
  created_at    TIMESTAMP DEFAULT now(),
  edited_at     TIMESTAMP
);
```

**Common queries:**
```sql
-- All top-level comments for post 42
SELECT c.*, u.username FROM comments c
JOIN users u ON u.id = c.user_id
JOIN discussions d ON d.id = c.discussion_id
WHERE d.post_id = 42 AND c.parent_id IS NULL
ORDER BY c.score DESC, c.created_at;

-- Delete a comment (cascades to replies, votes, reactions)
DELETE FROM comments WHERE id = 7;
```

---

## comment_votes

Records upvote/downvote per user per comment. Vote is 1 or -1.

```sql
CREATE TABLE comment_votes (
  comment_id INTEGER  NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id    INTEGER  NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  vote       SMALLINT NOT NULL CHECK (vote IN (1, -1)),
  PRIMARY KEY (comment_id, user_id)
);
```

---

## comment_reactions

Emoji reactions on comments. Multiple reactions per user allowed.

```sql
CREATE TABLE comment_reactions (
  comment_id INTEGER      NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id    INTEGER      NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  reaction   VARCHAR(20)  NOT NULL,
  PRIMARY KEY (comment_id, user_id, reaction)
);
```

Allowed emoji values are enforced server-side by `EmojiValidator.ALLOWED`.

---

## post_reactions

Emoji reactions directly on posts (shown via `ReactionBar`).

```sql
CREATE TABLE post_reactions (
  post_id  INTEGER      NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id  INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction VARCHAR(20)  NOT NULL,
  PRIMARY KEY (post_id, user_id, reaction)
);
```

---

## follows

Records follower → followed relationships.

```sql
CREATE TABLE follows (
  follower_id INTEGER   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followed_id INTEGER   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT now(),
  PRIMARY KEY (follower_id, followed_id)
);
```

**Common queries:**
```sql
-- List followers of alice
SELECT u.username FROM follows f
JOIN users u ON u.id = f.follower_id
WHERE f.followed_id = (SELECT id FROM users WHERE username = 'alice');

-- Is bob following alice?
SELECT EXISTS (
  SELECT 1 FROM follows
  WHERE follower_id = (SELECT id FROM users WHERE username = 'bob')
    AND followed_id = (SELECT id FROM users WHERE username = 'alice')
);
```

---

## notifications

Inbox entries. Types: `comment`, `reply`, `follow`, `reaction`, `new_post`, `message`.

```sql
CREATE TABLE notifications (
  id            SERIAL PRIMARY KEY,
  recipient_id  INTEGER      NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  type          VARCHAR(40)  NOT NULL,
  actor_username VARCHAR(255),
  post_id       INTEGER               REFERENCES posts(id)     ON DELETE CASCADE,
  comment_id    INTEGER               REFERENCES comments(id)  ON DELETE CASCADE,
  is_read       BOOLEAN      DEFAULT false,
  created_at    TIMESTAMP    DEFAULT now(),
  message       TEXT                  -- used by 'message' type (DMs)
);
```

**Common queries:**
```sql
-- Unread notifications for alice
SELECT * FROM notifications
WHERE recipient_id = (SELECT id FROM users WHERE username = 'alice')
  AND is_read = false
ORDER BY created_at DESC;

-- Clear alice's inbox
DELETE FROM notifications WHERE recipient_id = (SELECT id FROM users WHERE username = 'alice');
```

---

## uploads

Tracks file uploads per user: post images, and from the audio and header work
also MP3s and header images. Avatars, headers and audio are told apart by
filename prefix (`avatar/`, `header/`, `audio/`); everything else is a post
image. Every row counts towards the user's storage quota.

```sql
CREATE TABLE uploads (
  id            SERIAL PRIMARY KEY,
  filename      VARCHAR(255) NOT NULL UNIQUE,   -- stored filename (UUID-based)
  user_id       INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_name VARCHAR(255),
  size_bytes    BIGINT       NOT NULL DEFAULT 0,
  uploaded_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
```

---

## post_uploads

Links uploads to posts (many-to-many, though typically one upload per post image reference).

```sql
CREATE TABLE post_uploads (
  post_id   INTEGER NOT NULL REFERENCES posts(id)    ON DELETE CASCADE,
  upload_id INTEGER NOT NULL REFERENCES uploads(id)  ON DELETE CASCADE,
  PRIMARY KEY (post_id, upload_id)
);
```

---

## role_limits

Per-role storage and rate limits. Checked on upload and post creation.

```sql
CREATE TABLE role_limits (
  role               VARCHAR(20) PRIMARY KEY,
  max_storage_bytes  BIGINT  NOT NULL DEFAULT 52428800,  -- 50 MB
  max_posts_per_day  INTEGER NOT NULL DEFAULT 20
);
```

**Common queries:**
```sql
-- View all role limits
SELECT * FROM role_limits;

-- Update storage limit for 'user' role to 100 MB
UPDATE role_limits SET max_storage_bytes = 104857600 WHERE role = 'user';

-- Add a new role
INSERT INTO role_limits (role, max_storage_bytes, max_posts_per_day)
VALUES ('premium', 524288000, 100);
```

---

## conversations

One row per DM thread between two users. Ordered such that `user1_id < user2_id` always.

```sql
CREATE TABLE conversations (
  id        SERIAL PRIMARY KEY,
  user1_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user2_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user1_id, user2_id)
);
```

---

## direct_messages

Messages within a DM conversation.

```sql
CREATE TABLE direct_messages (
  id              SERIAL PRIMARY KEY,
  conversation_id INTEGER     NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content         TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## dm_reactions

Emoji reactions on direct messages. One row per (message, user, emoji).

```sql
CREATE TABLE dm_reactions (
  message_id  INTEGER     NOT NULL REFERENCES direct_messages(id) ON DELETE CASCADE,
  user_id     INTEGER     NOT NULL REFERENCES users(id)           ON DELETE CASCADE,
  reaction    VARCHAR(32) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id, reaction)
);
```

---

## group_conversations

A named group chat. `created_by` is the original owner's user id.

```sql
CREATE TABLE group_conversations (
  id          SERIAL       PRIMARY KEY,
  name        VARCHAR(100) NOT NULL DEFAULT 'Group',
  created_by  INTEGER      NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

---

## group_conversation_members

Membership table for group chats. `is_admin = TRUE` marks the current owner (exactly one per group at all times after an ownership transfer).

```sql
CREATE TABLE group_conversation_members (
  group_id    INTEGER NOT NULL REFERENCES group_conversations(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id)               ON DELETE CASCADE,
  is_admin    BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);
```

**Ownership transfer:** `transferGroupOwnership(groupId, newOwnerUserId)` sets all rows `is_admin=FALSE` then sets the target row `is_admin=TRUE`. The previous owner remains a member.

---

## group_messages

Messages sent in a group conversation.

```sql
CREATE TABLE group_messages (
  id          SERIAL      PRIMARY KEY,
  group_id    INTEGER     NOT NULL REFERENCES group_conversations(id) ON DELETE CASCADE,
  sender_id   INTEGER     NOT NULL REFERENCES users(id)               ON DELETE CASCADE,
  content     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Note:** `getGroupMessages` also joins `users.avatar_path` for rendering sender avatars in the UI.

---

## group_message_read

Tracks the last-read timestamp per user per group for unread-count calculation.

```sql
CREATE TABLE group_message_read (
  group_id     INTEGER NOT NULL REFERENCES group_conversations(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id)               ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);
```

---

## group_message_reactions

Emoji reactions on group messages. Same toggle logic as `dm_reactions`.

```sql
CREATE TABLE group_message_reactions (
  message_id  INTEGER     NOT NULL REFERENCES group_messages(id) ON DELETE CASCADE,
  user_id     INTEGER     NOT NULL REFERENCES users(id)          ON DELETE CASCADE,
  reaction    VARCHAR(32) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id, reaction)
);
```

---

## tutorials

Internal table (not exposed via API). Purpose unclear from current codebase — likely used for onboarding content.

```sql
-- Check contents:
SELECT * FROM tutorials LIMIT 10;
```

---

## Tables added by V004 to V014

### stickers, stickies (V012)

```sql
CREATE TABLE stickers (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       VARCHAR(40) NOT NULL,
  grid       TEXT NOT NULL,                -- a tile grid, at most 16 x 16, checked by GridValidator
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE stickies (                    -- a sticker placed on a page
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sticker_id INTEGER NOT NULL REFERENCES stickers(id) ON DELETE CASCADE,
  post_id    INTEGER REFERENCES posts(id) ON DELETE CASCADE,  -- NULL: on the profile
  x          REAL NOT NULL,                -- 0..1 across the page column
  y          REAL NOT NULL,                -- CSS pixels from the column top, 0..100000
  size       SMALLINT NOT NULL DEFAULT 2,  -- 1..6
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### shared_packs, shared_pack_saves (V013, V014)

```sql
CREATE TABLE shared_packs (                -- snapshot of a pack shared in a message ("[[pack:<id>]]")
  id         UUID PRIMARY KEY,
  sender_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       VARCHAR(16) NOT NULL CHECK (kind IN ('stickers', 'symbols')),
  name       VARCHAR(40) NOT NULL,
  body       TEXT NOT NULL,                -- stickers: [{name, grid}]; symbols: {char: hex}
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE shared_pack_saves (           -- one copy per reader
  pack_id  UUID NOT NULL REFERENCES shared_packs(id) ON DELETE CASCADE,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (pack_id, user_id)
);
```

### pixel_fonts (V005)

`id`, `user_id` (cascade), `name` (40), `glyphs` (TEXT, JSON of character to
bitmap hex), `created_at`, `updated_at`. A user's own symbol sets.

### Other columns added since V001

`users.banner_grid` (V011), `posts.page_theme` (V009), `posts.card_grid`
(V010) and `posts.votes_enabled` (V007) are shown in the tables above.
`post_views` has primary key `(post_id, user_id)` and cascades with the user (V008).

### Tables without a section here

`post_views`, `post_view_totals`, `post_votes`, `hashtags`, `post_hashtags`,
`post_reports`, `invite_codes`, `dm_blocks`, `activity_deletions`,
`custom_fonts`, `upload_variants`, `system_settings`, `email_*` and
`schema_migrations` exist and are defined in `V001__schema.sql`.

---

## Cascade delete summary

When you DELETE a user, these cascade automatically:
- `uploads`
- `stickers`, `stickies`, `pixel_fonts`, `shared_packs`, `shared_pack_saves`, `post_views`
- `follows` (both follower and followed rows)
- `notifications`
- `comment_votes`
- `comment_reactions`
- `comments`
- `users_posts_junctions`
- `post_reactions`
- `dm_reactions`, `direct_messages`, `conversations`
- `group_conversation_members`, `group_message_reactions`, `group_messages` (sender rows only)

When you DELETE a post, these cascade:
- `users_posts_junctions`
- `discussions` → `comments` → `comment_votes`, `comment_reactions`, `notifications`
- `post_reactions`
- `post_uploads`
- `stickies` placed on it

When you DELETE a group conversation:
- `group_conversation_members`, `group_messages`, `group_message_read`, `group_message_reactions`

---

## Useful admin queries

```sql
-- Storage usage per user
SELECT u.username,
       COALESCE(SUM(up.size_bytes), 0) AS upload_bytes,
       COUNT(up.id) AS upload_count
FROM users u
LEFT JOIN uploads up ON up.user_id = u.id
GROUP BY u.username
ORDER BY upload_bytes DESC;

-- Top posts by reaction count
SELECT p.id, p.title, COUNT(*) AS reactions
FROM posts p
JOIN post_reactions pr ON pr.post_id = p.id
GROUP BY p.id, p.title
ORDER BY reactions DESC
LIMIT 20;

-- Most active commenters
SELECT u.username, COUNT(*) AS comment_count
FROM comments c
JOIN users u ON u.id = c.user_id
GROUP BY u.username
ORDER BY comment_count DESC
LIMIT 20;

-- Posts with most comments
SELECT p.id, p.title, COUNT(c.id) AS comment_count
FROM posts p
JOIN discussions d ON d.post_id = p.id
JOIN comments c ON c.discussion_id = d.id
GROUP BY p.id, p.title
ORDER BY comment_count DESC
LIMIT 20;
```
