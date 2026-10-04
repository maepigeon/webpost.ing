# webpost.ing

An invite-only blogging platform: rich-text posts, profiles, discussions,
direct messages and image uploads.

**React (Vite)** · **Spring Boot 3 / Java 21** · **PostgreSQL 14+**

---

## Requirements

| Needed | Check with | Note |
|---|---|---|
| Java **JDK** 21 | `javac -version` | The JDK, not just a JRE — Maven compiles with `javac`. If `javac` and `java` disagree, set `JAVA_HOME` to the JDK. |
| Node.js 20.19+ | `node -v` | Vite needs it; `tools/release.sh` checks the same. |
| PostgreSQL 14+ | `psql --version` | Must be running before the backend starts. |

---

## Run it locally

Local development needs **no configuration** — every setting has a development
default that matches the database created in step 1.

**1. Create the database**

```bash
createdb testdb          # as your own login; the app connects as you, no password
```

If your PostgreSQL does not let your login create databases, create one with
a user of your own and set `DB_USER` (and `DB_PASSWORD`) in a `deploy.env`.
On PostgreSQL 15+ that user also needs `GRANT ALL ON SCHEMA public` on the
database, or every table creation fails with a permissions error.

Tests use a separate database: `createdb webposting_test`
(see [guide/MIGRATIONS.md](guide/MIGRATIONS.md#the-test-database)).

**2. Start the backend**

```bash
cd server && ./mvnw spring-boot:run
```

Serves `http://localhost:8080`. It builds the whole schema on first start —
look for `Database migration complete` in the log.

**3. Start the frontend**

```bash
cd client && npm install && npm run dev
```

Serves `http://localhost:5173`, calling the API on `:8080`.

**Tests**

```bash
cd client && npm test      # Vitest
cd server && ./mvnw test   # JUnit 5
```

> Sessions are held in memory. Restarting the backend signs everyone out.

---

## Configuration

**`deploy.env` in the repo root is the only file you edit**, and the only file
that ever holds a secret. It is gitignored and never leaves the host.

```bash
cp config/deploy.env.example deploy.env
chmod 600 deploy.env
$EDITOR deploy.env
```

`server-start.sh` and `tools/backup.sh` source it
automatically. The `application*.properties` files are committed, secret-free,
and read `${VAR:default}` from the environment — **do not edit them to
configure a deployment**; add a variable instead.

What a production host must set:

| Variable | Example |
|---|---|
| `APP_PROFILE` | `prod` — HTTPS-only cookies, absolute upload path, no stack traces |
| `DB_NAME` / `DB_USER` / `DB_SOCKET` | your production database, its user, and the PostgreSQL socket directory (no password; or `DB_PASSWORD` for TCP) |
| `ALLOWED_ORIGINS` | `https://webpost.ing` — exact origins, comma-separated; `*` is rejected |
| `UPLOAD_DIR` | `/srv/webposting/uploads` — absolute, writable by the server user |
| `APP_BASE_URL` | `https://webpost.ing` — used for links inside emails |
| `WEB_ROOT` | `/srv/webposting/html` — where nginx serves the frontend |
| `APP_HOME` | `/srv/webposting/app` — runtime tree; the JAR lands in `$APP_HOME/server/target/` |
| `SERVICE_NAME` | `webposting.service` — the systemd unit to restart |

Under `APP_PROFILE=prod` the server **refuses to start** if there is neither
`DB_SOCKET` nor a real `DB_PASSWORD`, `DB_NAME` is still `testdb`,
`ALLOWED_ORIGINS` points at localhost, or `UPLOAD_DIR` is relative. The error
names the variable to fix.

Email (verification, notifications, password reset) is off until
`MAIL_ENABLED=true`. Every variable: [guide/CONFIGURATION.md](guide/CONFIGURATION.md).

---

## Deploy to production

### First time on a new host

The server only runs releases; it never builds. Install Java 21 (a JRE is
enough), PostgreSQL and nginx. Do not install Node or Maven, and do not clone
the repository there (it is private, and the server holds no GitHub credential).

**1. Create the production database** with your real name and user, as in
[guide/MIGRATIONS.md](guide/MIGRATIONS.md#a-fresh-database). The server builds
the schema the first time it starts.

**2. Write `deploy.env`** on the server (`config/deploy.env.example` is the
template; `chmod 600`, readable by the service's user only).

**3. Create the uploads directory** from `UPLOAD_DIR`, owned by the user the
service runs as:

```bash
sudo mkdir -p /srv/webposting/uploads
```

**4. Configure nginx.** The SPA owns routing, so paths that are not files must
fall back to `index.html` — without it every `/{username}` profile link 404s.

```nginx
server {
    listen 443 ssl;
    server_name webpost.ing;

    ssl_certificate     /etc/letsencrypt/live/webpost.ing/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/webpost.ing/privkey.pem;

    root /srv/webposting/html;          # WEB_ROOT

    location / {
        try_files $uri $uri/ /index.html;
    }

    # The trailing slash on proxy_pass strips the /api prefix.
    location /api/ {
        proxy_pass http://127.0.0.1:8080/;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50m;            # keep >= UPLOAD_MAX_SIZE (avatars 25 MB, audio 20 MB)
    }

    # Audio seeking needs range requests; nginx serves them for static files.
    location /uploads/ {
        alias /srv/webposting/uploads/;  # UPLOAD_DIR
    }
}

server {
    listen 80;
    server_name webpost.ing;
    return 301 https://$host$request_uri;
}
```

```bash
sudo nginx -t && sudo nginx -s reload
```

**5. Install the systemd unit** at `/etc/systemd/system/webposting.service`,
matching `SERVICE_NAME`. Run it as its own unprivileged user, not root, and
send the log to the journal (`journalctl -u webposting.service`):

```ini
[Unit]
Description=webpost.ing backend
After=network.target postgresql.service

[Service]
User=webposting
WorkingDirectory=/srv/webposting/app
ExecStart=/srv/webposting/app/server-start.sh
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
```

Put `server-start.sh` and `deploy.env` into `APP_HOME`, and the first JAR in
`$APP_HOME/server/target/server-0.0.1-SNAPSHOT.jar` (the install script needs
one to exist), then:

```bash
sudo systemctl daemon-reload && sudo systemctl enable webposting.service
```

**6. Release.** On your own computer, never on the server:

```bash
./tools/release.sh
```

### Every release after that

The same command. It tests, builds, uploads, backs up the database, JAR and
website, swaps the new version in, restarts, checks `/api/health`, and rolls
back if the new version doesn't come up. See
[guide/DEPLOYMENT.md](guide/DEPLOYMENT.md).

| Flag | Effect |
|---|---|
| `--build-only` | Test and build the archive; upload nothing |
| `--no-install` | Also upload it; install later on the server |
| `--skip-tests` | Skip the test suites (emergencies only) |

Before the first real release: [Before you release](guide/DEPLOYMENT.md#before-you-release)
and the post-deploy smoke test, both in DEPLOYMENT.md.

**After deploying:** hard-refresh the browser. Vite content-hashes filenames,
but a cached `index.html` keeps pointing at the old bundle — the usual reason a
fix "isn't live".

Host-specific details and the mistakes that have cost time:
[guide/DEPLOYMENT.md](guide/DEPLOYMENT.md).

---

## Operations

**Back up** — database *and* uploads, in one pair:

```bash
./tools/backup.sh                # into ./backups
./tools/backup.sh /mnt/backups   # or elsewhere
```

`pg_dump` alone is not a backup of this application: images, avatars, header
images and audio live on disk, so a database-only restore brings back every post with broken
images. The script takes both, reads them back, and prints the restore commands.

**Migrations** — add `server/src/main/resources/db/migrations/V0NN__name.sql`
and restart. The runner applies pending scripts in version order and records
them in `schema_migrations`; Hibernate never touches the schema.
See [guide/MIGRATIONS.md](guide/MIGRATIONS.md).

**Service**

```bash
sudo systemctl restart webposting.service   # never kill the JVM by port
sudo journalctl -u webposting.service -f
```

---

## Ports

| Service | Port |
|---|---|
| PostgreSQL | 5432 |
| Spring Boot | 8080 |
| Vite dev server | 5173 |

---

## Documentation

| Guide | Covers |
|---|---|
| [CONFIGURATION.md](guide/CONFIGURATION.md) | Every environment variable and the code that reads it |
| [DEPLOYMENT.md](guide/DEPLOYMENT.md) | Production host facts, runbook, known gotchas |
| [DATABASE_SCHEMA.md](guide/DATABASE_SCHEMA.md) | Full schema, table by table |
| [MIGRATIONS.md](guide/MIGRATIONS.md) | Writing and applying migrations |
| [SECURITY.md](guide/SECURITY.md) | Auth, sessions, upload handling |
| [EMAIL.md](guide/EMAIL.md) | SMTP setup and the email features |
| [project-structure.md](guide/project-structure.md) | Where things live in the codebase |
