# webpost.ing

An invite-only blogging platform: rich-text posts, profiles, discussions,
direct messages and image uploads.

**React (Vite)** · **Spring Boot 3 / Java 21** · **PostgreSQL 14+**

---

## Requirements

| Needed | Check with | Note |
|---|---|---|
| Java **JDK** 21 | `javac -version` | The JDK, not just a JRE — Maven compiles with `javac`. If `javac` and `java` disagree, set `JAVA_HOME` to the JDK. |
| Node.js 18+ | `node -v` | |
| PostgreSQL 14+ | `psql --version` | Must be running before the backend starts. |

---

## Run it locally

Local development needs **no configuration** — every setting has a development
default that matches the database created in step 1.

**1. Create the database**

```bash
sudo -u postgres psql -c "CREATE DATABASE testdb;"
sudo -u postgres psql -c "CREATE USER mae WITH PASSWORD 'password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE testdb TO mae;"
sudo -u postgres psql -d testdb -c "GRANT ALL ON SCHEMA public TO mae;"
```

The last line is not optional on PostgreSQL 15+, where `public` is no longer
world-writable — without it every table creation fails with a permissions error.

**2. Load the schema**

```bash
PGPASSWORD=password psql -h localhost -U mae -d testdb -f config/database.sql
```

**3. Start the backend**

```bash
cd server && ./mvnw spring-boot:run
```

Serves `http://localhost:8080`. Pending migrations apply automatically at
startup — look for `Database migration complete` in the log.

**4. Start the frontend**

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

`deploy.sh`, `server-start.sh` and `tools/backup.sh` all source it
automatically. The `application*.properties` files are committed, secret-free,
and read `${VAR:default}` from the environment — **do not edit them to
configure a deployment**; add a variable instead.

What a production host must set:

| Variable | Example |
|---|---|
| `APP_PROFILE` | `prod` — HTTPS-only cookies, absolute upload path, no stack traces |
| `DB_NAME` / `DB_USER` / `DB_PASSWORD` | your production database and its password |
| `ALLOWED_ORIGINS` | `https://webpost.ing` — exact origins, comma-separated; `*` is rejected |
| `UPLOAD_DIR` | `/var/www/webposting/uploads` — absolute, writable by the server user |
| `APP_BASE_URL` | `https://webpost.ing` — used for links inside emails |
| `WEB_ROOT` | `/var/www/webpost.ing/html` — where nginx serves the frontend |
| `APP_HOME` | `/home/webpost.ing` — runtime tree; the JAR lands in `$APP_HOME/server/target/` |
| `SERVICE_NAME` | `start-servers.service` — the systemd unit to restart |

Under `APP_PROFILE=prod` the server **refuses to start** if the database
password is still the development default, `DB_NAME` is still `testdb`,
`ALLOWED_ORIGINS` points at localhost, or `UPLOAD_DIR` is relative. The error
names the variable to fix.

Email (verification, notifications, password reset) is off until
`MAIL_ENABLED=true`. Every variable: [guide/CONFIGURATION.md](guide/CONFIGURATION.md).

---

## Deploy to production

### First time on a new host

**1. Install** Java 21 JDK, Node 18+, PostgreSQL, nginx and git.

**2. Create the production database** — same four commands as local step 1, with
your real database name, user and password. Then load the schema:

```bash
PGPASSWORD='<password>' psql -h localhost -U <user> -d <dbname> -f config/database.sql
```

**3. Clone and configure**

```bash
git clone https://github.com/maepigeon/webpost.ing.git && cd webpost.ing
cp config/deploy.env.example deploy.env && chmod 600 deploy.env && $EDITOR deploy.env
```

**4. Create the uploads directory** from `UPLOAD_DIR`, owned by the user the
service runs as:

```bash
sudo mkdir -p /var/www/webposting/uploads
```

**5. Configure nginx.** The SPA owns routing, so paths that are not files must
fall back to `index.html` — without it every `/{username}` profile link 404s.

```nginx
server {
    listen 443 ssl;
    server_name webpost.ing;

    ssl_certificate     /etc/letsencrypt/live/webpost.ing/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/webpost.ing/privkey.pem;

    root /var/www/webpost.ing/html;          # WEB_ROOT

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
        client_max_body_size 50m;            # keep >= UPLOAD_MAX_SIZE
    }

    location /uploads/ {
        alias /var/www/webposting/uploads/;  # UPLOAD_DIR
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

**6. Install the systemd unit** at `/etc/systemd/system/start-servers.service`,
matching `SERVICE_NAME`:

```ini
[Unit]
Description=webpost.ing backend
After=network.target postgresql.service

[Service]
WorkingDirectory=/home/webpost.ing
ExecStart=/home/webpost.ing/server-start.sh
Restart=on-failure
StandardOutput=append:/tmp/webposting.log
StandardError=append:/tmp/webposting.log

[Install]
WantedBy=multi-user.target
```

Copy `server-start.sh` and `deploy.env` into `APP_HOME`, then:

```bash
sudo systemctl daemon-reload && sudo systemctl enable start-servers.service
```

**7. Deploy.**

```bash
./deploy.sh
```

### Every deploy after that

```bash
git pull && ./deploy.sh
```

`deploy.sh` builds both halves, publishes `client/dist/` to `WEB_ROOT` and the
JAR to `APP_HOME`, restarts the service, and waits for the API to answer before
reporting success.

| Flag | Effect |
|---|---|
| `--dry-run` | Print every step, change nothing |
| `--no-build` | Publish existing artifacts and restart |

Building is not deploying: the build tree and the runtime tree are different
directories, which is why the publish step exists.

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

`pg_dump` alone is not a backup of this application: images, avatars and fonts
live on disk, so a database-only restore brings back every post with broken
images. The script takes both, reads them back, and prints the restore commands.

**Migrations** — add `server/src/main/resources/db/migrations/V0NN__name.sql`
and restart. The runner applies pending scripts in version order and records
them in `schema_migrations`; Hibernate never touches the schema.
See [guide/MIGRATIONS.md](guide/MIGRATIONS.md).

**Service**

```bash
sudo systemctl restart start-servers.service   # never kill the JVM by port
tail -f /tmp/webposting.log
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
