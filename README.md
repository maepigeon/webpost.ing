## webpost.ing

A blog/post creation platform built with React (Vite) + Spring Boot + PostgreSQL.

---

## Prerequisites

- **Java 21 JDK** (not just JRE — `javac` must be available; check with `javac -version`)
- **Node.js 18+** and npm
- **PostgreSQL 14+**

---

## Database Setup

PostgreSQL must be running before starting the server.

**1. Create the database and user**

On Ubuntu/Debian, the PostgreSQL superuser commands must run as the `postgres` system user:

```bash
sudo -u postgres psql -c "CREATE DATABASE testdb;"
sudo -u postgres psql -c "CREATE USER mae WITH PASSWORD 'password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE testdb TO mae;"
sudo -u postgres psql -d testdb -c "GRANT ALL ON SCHEMA public TO mae;"
```

Change `testdb`, `mae`, and `password` to whatever credentials you want — just keep them consistent with `application.properties`.

**2. Load the schema**

```bash
PGPASSWORD=password psql -U mae -d testdb -h localhost -f config/database.sql
```

(`-h localhost` forces password auth instead of peer auth. `PGPASSWORD` avoids an interactive prompt.)

**3. Apply required migrations**

These columns are required by the current codebase but are not in the base schema file:

```bash
PGPASSWORD=password psql -U mae -d testdb -h localhost -c "
  ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS pattern_presets TEXT DEFAULT '{}';
  ALTER TABLE users ADD COLUMN IF NOT EXISTS last_visited TIMESTAMP WITH TIME ZONE DEFAULT NULL;
"
```

Key tables (see `config/database.sql` for the full schema):
- `users` — accounts, background patterns, bio, roles, last-visited timestamp
- `posts` — rich-text Lexical JSON, published flag, per-post background pattern
- `users_posts_junctions` — authorship link (posts don't have a direct user FK)
- `uploads` — uploaded image metadata (filename, size, user)
- `post_uploads` — junction linking uploads to posts (for orphan cleanup)
- `discussions` / `comments` / `comment_votes` / `comment_reactions` — discussion threads
- `follows` / `notifications` / `post_reactions` — social features
- `role_limits` — per-role storage and post-rate limits

**4. Configure the connection**

Create `server/src/main/resources/application.properties` (this file is not in the repo — you must create it):

```properties
spring.profiles.active=dev

spring.datasource.url=jdbc:postgresql://localhost:5432/testdb
spring.datasource.username=mae
spring.datasource.password=password
spring.datasource.driver-class-name=org.postgresql.Driver

spring.jpa.hibernate.ddl-auto=none
```

> **Decision required:** These credentials are not managed by the environment toggle and must be set manually for each environment.

**Uploaded images** are stored on disk (path configured per environment — see Environment Toggle below). No schema changes are needed for image support; image paths are embedded in the post's Lexical JSON.

---

## Environment Toggle

One line in `application.properties` controls the environment:

```properties
# dev  → plain HTTP cookies, uploads in server/uploads/
# prod → HTTPS-only cookies, uploads in /var/www/webposting/uploads
spring.profiles.active=dev
```

Change `dev` → `prod` before deploying. The active profile loads the matching file automatically:

| Profile | File |
|---------|------|
| `dev` | `server/src/main/resources/application-dev.properties` |
| `prod` | `server/src/main/resources/application-prod.properties` |

**What the toggle sets automatically:**

| Setting | dev | prod |
|---------|-----|------|
| `app.dev-mode` | `true` (HTTP cookies) | `false` (HTTPS-only cookies) |
| `app.upload-dir` | `uploads` (relative, inside `server/`) | `/var/www/webposting/uploads` |

**What you must still change manually (owner decisions):**

| What | Where | Why |
|------|-------|-----|
| Database credentials | `application.properties` → `spring.datasource.*` | Different per deployment; should not be shared |
| Production domain | `SecurityConfig.java` → `setAllowedOrigins(...)` | Your domain name — only you know what it is |
| Prod upload path | `application-prod.properties` → `app.upload-dir` | Depends on your server layout; the default is a placeholder |

**Frontend environment** is automatic — Vite uses `client/.env.development` for `npm run dev` and `client/.env.production` for `npm run build`. No manual toggle needed on the frontend.

---

## Running Locally (Development)

**Backend:**
```bash
cd server
JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 ./mvnw spring-boot:run
```

> **Note:** If `javac -version` shows a different version than `java -version`, set `JAVA_HOME` to the Java 21 JDK path (find it with `update-alternatives --list java`). Maven uses `javac`, not `java`.
Runs on `http://localhost:8080`. Stop with `Ctrl+C` in the terminal, or:
```bash
kill $(lsof -ti:8080)
```

**Frontend:**
```bash
cd client
npm install   # first time only
npm run dev
```
Runs on `http://localhost:5173`. API calls go to `http://localhost:8080` via `VITE_API_BASE_URL` in `client/.env.development`. Stop with `Ctrl+C`, or:
```bash
kill $(lsof -ti:5173)
```

**Tests:**
```bash
# Frontend (Vitest)
cd client && npm test

# Backend (JUnit 5)
cd server && ./mvnw test
```

> **Tip:** Sessions are stored in memory on the server. Restarting the backend clears all sessions — users will need to log in again.

---

## Building for Production

**Frontend:**
```bash
cd client
npm run build
```
Output is in `client/dist/`. Uses `VITE_API_BASE_URL=/api` so API calls are relative to the same origin.

**Backend:**
```bash
cd server
./mvnw package -DskipTests
```
Produces `server/target/server-0.0.1-SNAPSHOT.jar`. The production `server-start.sh` script runs this JAR — rebuild after any backend changes.

---

## Deploying to Production

1. Set `spring.profiles.active=prod` in `application.properties`
2. Update database credentials in `application.properties`
3. Update `app.upload-dir` in `application-prod.properties` to your actual uploads path
4. Update `setAllowedOrigins` in `SecurityConfig.java` to include your production domain
5. Build the frontend (`npm run build`) and backend (`./mvnw package`)
6. Configure nginx to:
   - Serve `client/dist/` for all non-API routes
   - Proxy `/api/` → `http://localhost:8080/` (nginx strips the `/api` prefix)
   - Serve the uploads directory at `/uploads/`

---

## Default Ports

Service         | Port 
PostgreSQL      | 5432 
Spring Boot     | 8080 
Vite dev server | 5173 

---

## Database Migrations

No migration framework is configured. Schema changes must be applied manually.

1. Back up the database first (see below)
2. Run the `ALTER TABLE` statement:
   ```bash
   psql -U <user> -d <db> -c "ALTER TABLE posts ALTER COLUMN description TYPE TEXT;"
   ```

See `config/database.sql` for the current schema and documented migrations.

---

## PostgreSQL Backup & Restore

**Full backup:**
```bash
pg_dump -U <user> -d <db> -F c -f backup_$(date +%Y%m%d_%H%M%S).dump
```

**Restore:**
```bash
pg_restore -U <user> -d <db> -c backup_<timestamp>.dump
```
`-c` drops existing objects before recreating. Omit it for an empty database.

**Schema only:**
```bash
pg_dump -U <user> -d <db> --schema-only -f schema_$(date +%Y%m%d).sql
```

**Data only:**
```bash
pg_dump -U <user> -d <db> --data-only -F c -f data_$(date +%Y%m%d_%H%M%S).dump
```

**Daily cron backup:**
```cron
0 2 * * * pg_dump -U <user> -d <db> -F c -f /backups/webposting_$(date +\%Y\%m\%d).dump
```
