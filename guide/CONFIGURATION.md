# Configuration Reference

Every environment-specific value in webpost.ing comes from an environment
variable. There are **three** places configuration lives, and no others:

| File | Committed? | Holds | Edit when |
|---|---|---|---|
| `deploy.env` | **no** (gitignored) | real values, including the DB password | setting up or changing an environment |
| `config/deploy.env.example` | yes | the documented template | adding a new setting |
| `server/src/main/resources/application*.properties` | yes | `${VAR:default}` wiring, **no secrets** | adding a new setting |

Plus two build-time files for the frontend, `client/.env.development` and
`client/.env.production`, which contain only API base URLs.

The rule: **`deploy.env` is the only file that ever holds a secret, and it never
leaves the host.** If you find yourself editing a `.properties` file to deploy,
something has been wired wrong — add a variable instead.

---

## Setting up an environment

```bash
cp config/deploy.env.example deploy.env
chmod 600 deploy.env
$EDITOR deploy.env
```

`server-start.sh` sources it automatically. To run the JAR by
hand with the same settings:

```bash
set -a; . ./deploy.env; set +a
java -jar server/target/server-0.0.1-SNAPSHOT.jar
```

No `-Dspring.profiles.active` flag is needed — `APP_PROFILE` selects the
profile. (The old advice to always pass `-Dspring.profiles.active=prod` applied
to a version where the profile was baked into the properties file.)

---

## Variables

### Profile

| Variable | Default | Notes |
|---|---|---|
| `APP_PROFILE` | `dev` | `dev` or `prod`. Chooses `application-{dev,prod}.properties`. `prod` sets HTTPS-only cookies, an absolute upload path, and suppresses stack traces in responses. |

### Database

| Variable | Default | Notes |
|---|---|---|
| `DB_HOST` | `localhost` | |
| `DB_PORT` | `5432` | |
| `DB_NAME` | `testdb` | Production is `webpostingdb`. |
| `DB_USER` | `mae` | |
| `DB_PASSWORD` | `password` | **The only secret.** The dev default is deliberately worthless. |
| `DB_POOL_SIZE` | `10` | HikariCP maximum pool size. |
| `DB_CONNECTION_TIMEOUT` | `20000` | Milliseconds. |

The schema is owned by the migration runner, which applies pending
`db/migrations/V*.sql` at startup. `spring.jpa.hibernate.ddl-auto` is pinned to
`none` and must stay that way — see [MIGRATIONS.md](MIGRATIONS.md).

Tests ignore these and connect to `webposting_test` through `TEST_DB_*`
variables — see [MIGRATIONS.md](MIGRATIONS.md#the-test-database).

### Origins

| Variable | Default | Notes |
|---|---|---|
| `ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated exact origins (scheme + host + port). |

Read by `SecurityConfig`. `*` is filtered out rather than honoured: the API
authenticates with cookies, and a wildcard origin on a credentialed endpoint
would let any website read a logged-in user's data. Add the real domain instead.

In production the SPA and the API are the same origin (nginx proxies `/api/` to
the backend), so this list only needs entries for genuinely separate frontends.

### File storage

| Variable | Default | Notes |
|---|---|---|
| `UPLOAD_DIR` | `uploads` (dev) / `/var/www/webposting/uploads` (prod) | Must exist and be writable by the server user. Absolute in production, so it does not depend on the working directory the JVM was launched from. |
| `UPLOAD_MAX_SIZE` | `50MB` | Parsed by Spring's multipart resolver. |
| `UPLOAD_MAX_BYTES` | `52428800` | Enforced by the application. Keep the two in agreement. |

Uploaded files live on disk, not in the database — back up `UPLOAD_DIR`
alongside `pg_dump`.

### Sessions

| Variable | Default | Notes |
|---|---|---|
| `SESSION_LIFETIME_MINUTES` | `1440` (24h) | Absolute cut-off. |
| `SESSION_IDLE_MINUTES` | `720` (12h) | Rolling; each authorized request pushes it forward. |

Sessions are held in memory, so **a server restart ends every session** whatever
these are set to. Persisting them is tracked in [tasks.md](tasks.md).

### Logging

| Variable | Default | Notes |
|---|---|---|
| `LOG_LEVEL` | `INFO` | Root logger level. |

### Deployment paths

Read by `tools/install-release.sh` (on the server) and `server-start.sh`, not by the application:

| Variable | Example | Notes |
|---|---|---|
| `WEB_ROOT` | `/var/www/webpost.ing/html` | Where nginx serves the built frontend. |
| `APP_HOME` | `/home/webpost.ing` | Runtime tree; the JAR goes to `$APP_HOME/server/target/`. |
| `SERVICE_NAME` | `start-servers.service` | systemd unit restarted after publishing. |
| `JAR_PATH` | *(derived)* | Override only if the JAR lives outside `$APP_HOME/server/target/`. |

### Frontend build

`client/.env.development` and `client/.env.production`, read by Vite at build
time and baked into the bundle — so changing them requires a rebuild, and
neither may ever contain a secret.

| Variable | Dev | Prod |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8080` | *(empty — same origin)* |
| `VITE_IMAGES_BASE_URL` | `http://localhost:8080` | *(empty — same origin)* |

---

## Migrating an existing server to this layout

Done on production on 2026-09-30 (settings moved from an untracked
`application.properties` into `deploy.env`). Releases are built on your own
computer; see [DEPLOYMENT.md](DEPLOYMENT.md).

---

## Adding a new setting

1. Add `foo.bar=${FOO_BAR:sensible-default}` to `application.properties`.
2. Add a commented entry to `config/deploy.env.example` explaining it.
3. Add a row to the table above.
4. Read it with `@Value("${foo.bar:sensible-default}")`.

Always give a default that works for local development, so a fresh clone runs
with no configuration at all.
