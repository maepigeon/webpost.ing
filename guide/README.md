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
- `username` — the account username
- `authToken` — a randomly generated session token (stored in-memory on the server; all sessions are lost on server restart)

Every mutating API call reads these cookies server-side. Spring Security is configured to allow all requests (authentication is enforced per-endpoint in the controllers, not at the framework layer). CSRF is disabled because the app relies on cookie-based auth over CORS with `withCredentials`.

**CORS allowed origins** are configured in `SecurityConfig.java`:
- `https://webpost.ing` (production)
- `http://localhost:5173` (local dev)

If you deploy to a different domain, add it to the `setAllowedOrigins` list in `server/src/main/java/.../config/SecurityConfig.java`.

### Image uploads

Uploaded images are stored on disk (not in the database). The upload directory is configured by `app.upload-dir` in `application-*.properties`. Spring Boot serves them at `/uploads/<uuid>.<ext>`. In production, this can alternatively be handled by Nginx for better performance by pointing the Nginx location block at the same directory.

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

If you have an existing database, use the migration tool at `tools/migrate.sh`:

```bash
# Preview what would run without changing anything
PGPASSWORD=password ./tools/migrate.sh --dry-run

# Apply any pending migrations (backs up first)
PGPASSWORD=password ./tools/migrate.sh
```

Alternatively, run `config/db-migrate-from-v1.sql` directly for a one-shot upgrade:

```bash
pg_dump -Fc testdb > backup_before_migrate.dump   # always back up first
psql -U mae -d testdb -f config/db-migrate-from-v1.sql
```

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

`server/src/main/resources/application.properties` is **not in the repo** — you must create it. Use these development defaults:

```properties
spring.profiles.active=dev

spring.datasource.url=jdbc:postgresql://localhost:5432/testdb
spring.datasource.username=mae
spring.datasource.password=password
spring.datasource.driver-class-name=org.postgresql.Driver

spring.jpa.hibernate.ddl-auto=none
```

Leave `spring.profiles.active=dev` for local development. The dev profile sets cookies without the `Secure` flag (required for HTTP) and stores uploads in a relative `uploads/` directory next to the JAR.

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

### What needs to change

There are a handful of things that differ from the development setup. None of them are handled automatically — you need to make these changes manually before a production deployment.

**1. Switch the Spring profile to `prod`**

In `server/src/main/resources/application.properties`, change:
```properties
spring.profiles.active=prod
```

The prod profile sets cookies with `Secure=true; SameSite=None`, which is required for cookies to work over HTTPS. It also changes the upload directory to an absolute path.

**2. Set the upload directory**

The prod profile (`application-prod.properties`) defaults to `/var/www/webposting/uploads`. Change this to a path that:
- Exists on the server
- Is writable by the process user
- Persists across deployments (i.e., not a temp directory)

Create it before starting the server:
```bash
mkdir -p /var/www/webposting/uploads
chown <app-user> /var/www/webposting/uploads
```

**3. Set real database credentials**

Edit `application.properties` (or set environment variables) with your production database host, name, username, and password.

**4. Configure Nginx**

A minimal Nginx config serving the Vite build and proxying the API:

```nginx
server {
    listen 443 ssl;
    server_name webpost.ing;

    # SSL config here (cert, key, etc.)

    root /var/www/webposting/client;
    index index.html;

    # SPA — all unknown paths serve index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API to Spring Boot
    location /api/ {
        proxy_pass http://127.0.0.1:8080/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Serve uploaded images (or proxy to Spring Boot)
    location /uploads/ {
        alias /var/www/webposting/uploads/;
    }
}
```

**5. CORS — add your domain**

If your production domain is different from `webpost.ing`, add it to `SecurityConfig.java` before building:

```java
config.setAllowedOrigins(List.of("https://your-domain.com", "http://localhost:5173"));
```

### Deploying

1. Build the frontend: `cd client && npm run build`
2. Copy `client/dist/` to the web root Nginx points at (e.g., `/var/www/webposting/client/`)
3. Build the backend: `cd server && ./mvnw clean package -DskipTests`
4. Stop the running server (if any), copy `server/target/server-0.0.1-SNAPSHOT.jar` to the server
5. Start it: `java -jar server-0.0.1-SNAPSHOT.jar`

The included `server-start.sh` is a minimal shell script that runs the JAR in the background from `/home/webpost.ing/server/target/`. The path is hardcoded, so update it to match your deployment directory before using it in production. Consider running it under a process manager (systemd, supervisor) so it restarts automatically on crash or reboot.

### Database migrations

The project includes a migration tool at `tools/migrate.sh`. It tracks which migrations have been applied, backs up the database before making changes, and restores on failure.

**Basic usage:**

```bash
# Apply any pending migrations (backs up first)
PGPASSWORD=password ./tools/migrate.sh

# Preview what would run without changing anything
PGPASSWORD=password ./tools/migrate.sh --dry-run

# Custom connection
./tools/migrate.sh -d mydb -U myuser -W mypass -h dbhost
```

Migration SQL files live in `tools/migrations/` as numbered `.sql` files (e.g. `014_add_bio_to_users.sql`). Each file is idempotent (`IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`) so they can be re-run safely. Applied migrations are tracked in a `_migrations` table in the database.

`config/database.sql` is the authoritative fresh-install schema. `config/db-migrate-from-v1.sql` is an alternative one-shot upgrade script for older databases.

**Before deploying:** always run `./tools/migrate.sh --dry-run` first to see what will change, then run without `--dry-run` to apply. Backups are saved to `tools/backups/`.

---

## 6. Database Architecture

The schema has two conceptual halves: the original blogging core, and the social layer added later.

### Core tables

**`users`** — Accounts. Columns: `username` (unique, max 32 chars), `password` (BCrypt hash, `VARCHAR(60)`), `registration_date`, `last_visited`, `is_admin` (boolean), `role` (varchar — `user`, `trusted`, `restricted`, or `admin`), `bio` (`VARCHAR(500)`, optional profile text with clickable URL rendering on the frontend), `bio_links` (`TEXT`, JSON array of up to 3 `{label, url}` objects), `background_pattern`, `pattern_presets` (JSON object of saved wallpaper presets, default `'{}'`).

Passwords are stored as BCrypt hashes. New users created via the admin panel are hashed immediately. Any legacy plain-text password in the database is automatically migrated to BCrypt the first time that user logs in.

The `background_pattern` column stores either a preset key (e.g. `"dots"`), a validated CSS gradient string, or either with an optional `|#RRGGBB` suffix for the page background color (e.g. `"dots|#1a1a2e"`). Both frontend and backend strip the suffix before validating the pattern key.


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

**`dm_blocks`** — Records when a user blocks direct messages from another user. `blocker_id` has blocked messages from `blocked_id`.

**`dm_blocks`** — Per-user DM blocking. `blocker_id` has blocked incoming direct messages from `blocked_id`. Cascade-deletes when either user is removed.

**`_migrations`** — Created automatically by `tools/migrate.sh`. Tracks which migration files have been applied (by filename) and when.

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
