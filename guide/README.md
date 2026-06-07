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
- `authToken` — a session token stored in the database

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

- **Java 21+** (check with `java -version`)
- **Node.js 18+** and npm (check with `node -v`)
- **PostgreSQL 14+** running locally with a database and user created
- **Maven wrapper** (`./mvnw`) is included in the repo — no separate Maven install needed

### Step 1 — Set up the database

Create a database and user in PostgreSQL, then run the schema:

```bash
psql -U postgres -c "CREATE DATABASE testdb;"
psql -U postgres -c "CREATE USER mae WITH PASSWORD 'password';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE testdb TO mae;"
psql -U mae -d testdb -f config/database.sql
```

> **Note:** The database name, user, and password in the schema file and `application.properties` are the defaults used in development. Change them to match your environment — there is no hardcoded assumption about the values.

### Step 2 — Configure the backend

Edit `server/src/main/resources/application.properties` and update the database credentials:

```properties
spring.datasource.url=jdbc:postgresql://localhost:5432/testdb
spring.datasource.username=mae
spring.datasource.password=password
```

Leave `spring.profiles.active=dev` for local development. The dev profile sets cookies without the `Secure` flag (required for HTTP) and stores uploads in a relative `uploads/` directory next to the JAR.

### Step 3 — Build the backend

```bash
cd server
./mvnw clean package -DskipTests
```

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

Start the backend:
```bash
cd server
./mvnw spring-boot:run
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

The schema file (`config/database.sql`) only creates the base tables. Migrations for features added after the initial release are listed at the bottom of that file as commented-out `ALTER TABLE` statements. Before deploying a version that requires a migration, take a backup first:

```bash
pg_dump -U mae testdb > backup_$(date +%Y%m%d).sql
```

Then run the migration statements manually in `psql`.

---

## 6. Database Architecture

The schema has two conceptual halves: the original blogging core, and the social layer added later.

### Core tables

**`users`** — Accounts. Each user has a username (unique, max 32 chars), a password (plain text — no hashing is implemented yet), and an optional `background_pattern` column that stores either a preset key (e.g. `"dots"`) or a validated CSS gradient string.

> **Security note:** Passwords are stored in plain text. This is a known limitation. Do not use this platform with passwords you use elsewhere.

**`posts`** — Blog posts. The `description` column holds the full Lexical editor JSON state as a text blob. The `background_pattern` column works the same way as on users. Posts have a `published` flag — unpublished posts are hidden from all views except the author's editor.

**`users_posts_junctions`** — Ownership. The many-to-many join table between users and posts. In practice each post has exactly one author, but the schema allows reassignment. The backend always writes one row here when a post is created.

### Social tables

**`follows`** — Who follows whom. A composite primary key on `(follower_id, followed_id)` enforces uniqueness. Cascade-deletes when either user is removed.

**`discussions`** — One row per post that has ever had discussion or reactions touched. Created lazily the first time the author enables either feature. The `enabled` column controls whether the discussion section is accessible; `reactions_enabled` controls the reaction bar independently.

**`comments`** — Threaded comments. `parent_id` is null for top-level comments and points to the parent comment for replies. Score is maintained as a running integer (incremented/decremented by votes). `edited_at` is set when a comment body is changed.

**`comment_votes`** — One row per `(comment_id, user_id)` pair. `vote` is `+1` or `-1`, enforced by a check constraint. Replacing an existing row (upserting) handles vote changes.

**`post_reactions`** — One emoji reaction per user per post (`(post_id, user_id)` primary key). Stored as a short string (e.g. `"👍"`).

**`notifications`** — Inbox entries. The `type` column is one of: `comment`, `reply`, `follow`, `reaction`. `actor_username` is denormalized for display without a join. `post_id` and `comment_id` are nullable links used to navigate to the source when a notification is clicked.

### Entity-relationship summary

```
users ──< users_posts_junctions >── posts
users ──< follows >── users (self-join)
posts ──── discussions ──< comments ──< comment_votes
                      │
posts ──< post_reactions
posts ──< notifications >── users (recipient)
comments ──< notifications
```
