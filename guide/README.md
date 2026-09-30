# webpost.ing — Architecture & Operations Guide

A reference for anyone setting up, building, or deploying the platform from scratch.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Network Architecture](#2-network-architecture)
3. [Build Instructions](#3-build-instructions)
4. [Running Tests](#4-running-tests)
5. [Production Deployment](#5-production-deployment)
6. [Database Architecture](#6-database-architecture)
7. [Feature Reference](#7-feature-reference)

---

## 1. Overview

webpost.ing is a personal blogging platform. Users register, write rich-text posts (powered by the Lexical editor), and optionally enable social features — reactions, a threaded discussion page, and follows. The app is split into two independently deployable pieces:

| Layer        | Technology               | Role                       |
|--------------|--------------------------|----------------------------|
| **Frontend** | React 18 + Vite          | SPA served as static files |
| **Backend**  | Spring Boot 3 (Java 21)  | REST API + file uploads    |
| **Database** | PostgreSQL 14+           | All persistent state       |

---

## 2. Network Architecture

### How it fits together

```
Browser
  │
  ├── GET /*, /users/*, /inbox (static files)  ──► Nginx / static host
  │       serves index.html (Vite production build)
  │
  └── /api/*          ──► Nginx proxy_pass  ──► Spring Boot (port 8080)
       /uploads/*     ──► Nginx or Spring Boot static handler
```

In production, Nginx (or any reverse proxy) serves the Vite build output and forwards `/api/**` and `/uploads/**` to the Spring Boot process. The browser never contacts the backend port directly.

In local development, Vite's dev server runs on port 5173 and calls the Spring Boot API directly at `http://localhost:8080`. There is no reverse proxy in dev.

### Authentication

Authentication uses two HTTP-only cookies set by the server on login:
- `username` — the account username the client believes it is
- `authToken` — a 192-bit `SecureRandom` session token; **the actual credential**

Sessions are held in memory keyed by token, so one account can be signed in on
several devices at once and a restart ends all of them. Each login mints a new
token. A session has an absolute lifetime (`SESSION_LIFETIME_MINUTES`, 24h) and
an idle timeout (`SESSION_IDLE_MINUTES`, 12h) refreshed on each authorized call.

Every mutating API call reads these cookies server-side. Spring Security permits
all requests at the filter layer; authorization is enforced per-endpoint in the
controllers via `loginRepository.authorize(username, token)`, which also checks
that the token's session really belongs to the username presented.

Cookies are issued `HttpOnly; SameSite=Lax; Secure` (the `Secure` flag only in
the `prod` profile, since plain HTTP would otherwise drop them). CSRF tokens are
not used — `SameSite=Lax` is what prevents a third-party page from making a
credentialed state-changing request. **If cookies ever need to go cross-site
again, real CSRF tokens must come back with them**; see the comment in
`SecurityConfig.java` and finding 4 in [SECURITY.md](SECURITY.md).

**CORS allowed origins** come from the `ALLOWED_ORIGINS` environment variable
(comma-separated), not from source — add your domain to `deploy.env`. A `*`
entry is filtered out rather than honoured: the API authenticates with cookies,
and a wildcard origin on a credentialed endpoint would let any site read a
logged-in user's data.

### Image uploads

Uploaded images are stored on disk (not in the database). The upload directory is set by the `UPLOAD_DIR` environment variable (see [CONFIGURATION.md](CONFIGURATION.md)). Spring Boot serves them at `/uploads/<uuid>.<ext>`. In production, this can alternatively be handled by Nginx for better performance by pointing the Nginx location block at the same directory.

---

## 3. Build Instructions

### Prerequisites

- **Java 21 JDK** — the full JDK, not just the JRE (`javac` must be present and at version 21; check with `javac -version`, not `java -version`)
- **Node.js 18+** and npm (check with `node -v`)
- **PostgreSQL 14+** running locally
- **Maven wrapper** (`./mvnw`) is included in the repo — no separate Maven install needed

### Step 1 — Set up the database

On Ubuntu/Debian, PostgreSQL admin commands must run as the `postgres` system user:

```bash
sudo -u postgres psql -c "CREATE DATABASE testdb;"
sudo -u postgres psql -c "CREATE USER mae WITH PASSWORD 'password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE testdb TO mae;"
sudo -u postgres psql -d testdb -c "GRANT ALL ON SCHEMA public TO mae;"
```

> **Note:** The database name, user, and password above are the development defaults. Change them to match your environment — update `application.properties` to match whatever you use here.

The init script creates all tables and seeds the `role_limits` table. It does **not** create any users — see [Creating the first admin user](#creating-the-first-admin-user) below.

#### Migrating an existing database

**Nothing to run.** The server applies every pending migration from
`server/src/main/resources/db/migrations/V*.sql` at startup and records it in
the `schema_migrations` table. Start the app and watch for:

```
Database migration complete — applied: N, skipped (already applied): M
```

See [MIGRATIONS.md](MIGRATIONS.md) for how to add one. Back up first regardless:

```bash
pg_dump -Fc testdb > backup_before_migrate.dump
```

> The shell scripts `tools/migrate.sh` and `config/migrate.sh` are earlier
> generations of the same idea and are **not** what production uses — see
> item 1 in [code-smells.txt](code-smells.txt).

#### Creating the first admin user

There is no public registration endpoint. All users are created by an existing admin via the admin panel. To bootstrap the first admin, insert a row directly using a BCrypt-hashed password:

```bash
# Generate a BCrypt hash (cost 10):
python3 -c "import bcrypt; print(bcrypt.hashpw(b'yourpassword', bcrypt.gensalt(10)).decode())"
```

```sql
INSERT INTO users (username, password, is_admin, role)
VALUES ('yourname', '$2b$10$...hash...', TRUE, 'admin');
```

After that, log in via the UI and use the admin panel to create additional users.

### Step 2 — Configure the backend

**Nothing to create.** `application.properties` is committed and contains no
secrets — every value reads from an environment variable with a
local-development default, so a fresh clone runs against `localhost:5432/testdb`
as user `mae` with no configuration at all.

To point it somewhere else, copy the template and edit that instead:

```bash
cp config/deploy.env.example deploy.env
chmod 600 deploy.env
$EDITOR deploy.env
```

`deploy.env` is gitignored and is the only file that ever holds a password. The
dev profile (the default) sets cookies without the `Secure` flag, as plain HTTP
requires, and stores uploads in `server/uploads/`. Full variable reference:
[CONFIGURATION.md](CONFIGURATION.md).

### Step 3 — Build the backend

If your system has multiple Java versions, `javac` may default to the wrong one even when `java` is correct. Set `JAVA_HOME` explicitly:

```bash
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64   # adjust path if needed
cd server
./mvnw clean package -DskipTests
```

Verify the correct JDK path with `update-alternatives --list java`.

This produces `server/target/server-0.0.1-SNAPSHOT.jar`.

### Step 4 — Configure and build the frontend

The frontend reads two environment variables at build time:

| Variable               | Dev value               | Prod value         |
|------------------------|-------------------------|--------------------|
| `VITE_API_BASE_URL`    | `http://localhost:8080` | *(empty string)*   |
| `VITE_IMAGES_BASE_URL` | `http://localhost:8080` | *(empty string)*   |

Both are already set correctly in `client/.env.development` and `client/.env.production`. In production, both are empty — meaning the browser uses the same origin as the page, which is correct when Nginx proxies `/api` and `/uploads` to Spring Boot.

```bash
cd client
npm install
npm run build          # outputs to client/dist/
```

### Step 5 — Run locally (development)

Start the backend (set `JAVA_HOME` if needed, same as Step 3):
```bash
cd server
JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 ./mvnw spring-boot:run
```

Start the frontend dev server (in a separate terminal):
```bash
cd client
npm run dev
```

Then open `http://localhost:5173` in a browser. API calls will go to `http://localhost:8080`.

---

## 4. Running Tests

### Frontend unit tests

The frontend uses [Vitest](https://vitest.dev/) with [@testing-library/react](https://testing-library.com/). Tests live in `client/src/test/`.

```bash
cd client
npm test              # run once and exit
npm run test:watch    # watch mode (re-runs on file changes)
```

Current test coverage:
- **`patterns.test.js`** — `isValidPattern` and `patternToStyle` from the pattern picker. Verifies that the security allowlist/blocklist behaves correctly (rejects `url()`, `expression()`, `javascript:`, oversized strings, etc.) and that all preset keys resolve to valid styles.
- **`ImageNode.test.js`** — The Lexical custom image node. Verifies serialization, deserialization, and rendering of the image block.

### Backend tests

```bash
cd server
./mvnw test
```

Spring Boot's test suite is minimal by default. The main value is that the application context loads cleanly — if a bean is misconfigured or a dependency is missing, the test run will fail during startup.

### Manual API smoke test

With both servers running, you can sanity-check the API directly:

```bash
# All posts
curl http://localhost:8080/api/posts

# Social features toggle for a post
curl http://localhost:8080/api/posts/22/features

# Reactions for a post
curl http://localhost:8080/api/posts/22/reactions

# Discussion status for a post
curl http://localhost:8080/api/posts/22/discussion
```

---

## 5. Production Deployment

**See [DEPLOYMENT.md](DEPLOYMENT.md) and [CONFIGURATION.md](CONFIGURATION.md).**

This section previously described paths, a database name and a restart procedure
that did not match the live server, which cost real time during a deploy. Rather
than keep two accounts of the same thing, the details now live in one place:

- **[DEPLOYMENT.md](DEPLOYMENT.md)** — the production host layout, the deploy
  sequence, and the mistakes that have actually bitten (systemd owns the JVM,
  building is not publishing, usernames are case-sensitive).
- **[CONFIGURATION.md](CONFIGURATION.md)** — every environment variable, and why
  `deploy.env` is the only file that holds a secret.
- **[MIGRATIONS.md](MIGRATIONS.md)** — schema changes.
- **[SECURITY.md](SECURITY.md)** — the security posture and what must happen
  before this repository is made public.

The short version:

```bash
cp config/deploy.env.example deploy.env && chmod 600 deploy.env && $EDITOR deploy.env
./deploy.sh --dry-run     # check what it will do
./deploy.sh               # build, publish, restart, verify
```

## 6. Database Architecture

The schema has two conceptual halves: the original blogging core, and the social layer added later.

### Core tables

**`users`** — Accounts. Columns: `username` (unique, max 32 chars), `password` (BCrypt hash, `VARCHAR(60)`), `email` (`VARCHAR(255)`, optional, stored at registration), `registration_date`, `last_visited`, `last_active_at` (updated by heartbeat), `is_admin` (boolean), `role` (varchar — `user`, `trusted`, `restricted`, or `admin`), `bio` (`VARCHAR(500)`, optional profile text with clickable URL rendering on the frontend), `bio_links` (`TEXT`, JSON array of up to 3 `{label, url}` objects), `background_pattern`, `pattern_presets` (JSON object of saved wallpaper presets, default `'{}'`), `avatar_path` (`VARCHAR(500)`, relative path under `/uploads/avatars/`, null if no avatar set), `pinned_post_id` (foreign key to `posts`, null if no pinned post).

Passwords are stored as BCrypt hashes. New users created via the admin panel are hashed immediately. Any legacy plain-text password in the database is automatically migrated to BCrypt the first time that user logs in.

The `background_pattern` column stores a **JSON v2 wallpaper**:

```json
{"v":2,"pattern":"paw-print","scale":1.2,"bgColor":"#ece9e2","colors":["#6c63ff"]}
```

`pattern` is a preset key (`none`, `hexagons`, `grid`, `chevron`, `checkerboard`,
`topographic`, `paw-print`, `stars`) or `custom`, in which case a `css` field
holds a validated CSS gradient. `bgColor` is applied to the page background and
`colors` tints the pattern.

The **legacy pipe format** — a preset key or gradient with an optional
`|#RRGGBB` suffix, e.g. `"dots|#1a1a2e"` — is still parsed for rows written
before the change, and is migrated to JSON on the next save. `parseWallpaper()`
in `client/src/components/PatternPicker/patterns.js` handles both, and tolerates
an already-decoded object (an HTTP client that JSON-parses a `text/plain` body
used to crash the profile page here).


**`posts`** — Blog posts. The `description` column holds the full Lexical editor JSON state as a text blob. The `background_pattern` column works the same way as on users. Posts have a `published` flag — unpublished posts are hidden from all views except the author's editor.

**`users_posts_junctions`** — Ownership. The many-to-many join table between users and posts. In practice each post has exactly one author, but the schema allows reassignment. The backend always writes one row here when a post is created.

### Social tables

**`follows`** — Who follows whom. A composite primary key on `(follower_id, followed_id)` enforces uniqueness. Cascade-deletes when either user is removed.

**`discussions`** — One row per post that has ever had discussion or reactions touched. Created lazily the first time the author enables either feature. The `enabled` column controls whether the discussion section is accessible; `reactions_enabled` controls the reaction bar independently.

**`comments`** — Threaded comments. `parent_id` is null for top-level comments and points to the parent comment for replies. Score is maintained as a running integer (incremented/decremented by votes). `edited_at` is set when a comment body is changed.

**`comment_votes`** — One row per `(comment_id, user_id)` pair. `vote` is `+1` or `-1`, enforced by a check constraint. Replacing an existing row (upserting) handles vote changes.

**`post_reactions`** — Emoji reactions on posts. Multiple reactions per user per post are allowed — the primary key is `(post_id, user_id, reaction)`. Stored as a short string (e.g. `"👍"`).

**`notifications`** — Inbox entries. `type` is one of: `comment`, `reply`, `follow`, `reaction`, `new_post`, `message`. `actor_username` is denormalized for display without a join. `post_id` and `comment_id` are nullable links. `message` (TEXT, nullable) holds the body of direct user-to-user messages. Storage for this column is tracked per-user and included in the storage summary API.

**`uploads`** — Tracks every file written to disk. `filename` is the UUID-based name under the uploads directory. `size_bytes` is used for per-user storage accounting.

**`post_uploads`** — Junction table linking posts to the uploads embedded in their content. Synced on every post save by scanning the Lexical JSON for `/uploads/` paths. Enables orphan detection.

**`role_limits`** — Per-role storage and post-rate limits. Roles: `user` (50 MB, 20 posts/day), `trusted` (500 MB, 100/day), `restricted` (5 MB, 2/day), `admin` (unlimited).

**`dm_blocks`** — Per-user DM blocking. `blocker_id` has blocked incoming direct messages from `blocked_id`. Cascade-deletes when either user is removed.

**`schema_migrations`** — Created automatically by the in-server migration
runner. Tracks which migration versions have been applied, when, and a checksum
of each so a file edited after the fact is reported at startup.

(A `_migrations` table may also exist on older databases; it belongs to the
superseded `tools/migrate.sh` and is unused.)

### Entity-relationship summary

```
users ──< users_posts_junctions >── posts
users ──< follows >── users (self-join)
users ──< dm_blocks >── users (self-join)
posts ──── discussions ──< comments ──< comment_votes
                                   └──< comment_reactions
posts ──< post_reactions
posts ──< post_uploads >── uploads
posts ──< notifications >── users (recipient)
comments ──< notifications
uploads ──< post_uploads >── posts
```

---

## 7. Feature Reference

### Bio links
User bios support plain text up to 500 characters. Any `http://` or `https://` URL in the bio is automatically rendered as a clickable link in the profile view. The bio editor itself is plain text — no HTML is accepted (the backend strips it).

### Editor leave confirmation
When a user has unsaved changes in the post editor, navigating away (via React Router links or browser tab close) shows a confirmation dialog. The guard is cleared after a successful save.

### Editor preferences section
The post editor toolbar has a collapsible **Preferences** section containing:
- Wallpaper picker (sets the post's background pattern)
- Toggle buttons for enabling/disabling comments and reactions

### Activity page tabs
The activity page (`/users/:username/activity`) shows four tabs:
- **Posts** — all posts the user has authored, with created/edited timestamps and draft badge
- **Comments** — comments the user has made, each linking to the post discussion with anchor `#comment-{id}`; shows edit timestamp if the comment was edited
- **Reactions** — emoji reactions the user has placed on posts
- **Uploads** — files the user has uploaded, showing file size and a link to the post that contains the file; if the upload is not referenced by any post it is shown with a "not in any post" badge

Only the account owner and admins can view the activity page.

### Data export and restore

**User self-export:** Profile page shows a "Download my data" button (visible only to the owner). Clicking it downloads `{username}_data.json` containing:
- Profile (bio, background, presets, role, dates — no password)
- All posts (full Lexical JSON content)
- All comments (with post context)
- Post reactions
- Upload metadata
- Inbox/notifications

**Admin export:** The admin panel Users tab has an **Export** button per user that downloads the same JSON.

**Admin restore:** The admin panel Stats tab has a "Restore from file…" section. Enter the target username, then pick the exported JSON file. This restores:
- Profile fields (bio, background_pattern, pattern_presets)
- All posts from the export (posts with the same title + date are skipped to avoid duplicates)

The restore is non-destructive — it does not delete existing data.

**API endpoints:**
- `GET /api/users/{username}/export` — user can export their own; admins can export any user
- `GET /api/admin/users/{username}/export` — admin-only export
- `POST /api/admin/users/{username}/import` — admin-only restore (JSON body = the export file)
