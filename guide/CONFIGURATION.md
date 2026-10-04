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
| `DB_NAME` | `testdb` | The development database locally; set it on a server. |
| `DB_USER` | your login name | |
| `DB_SOCKET` | *(unset)* | Directory of PostgreSQL's Unix socket (e.g. `/var/run/postgresql`). When set, the app connects through it with peer authentication and **needs no password**. Recommended on a server; `tools/server/use-passwordless-db.sh` sets it up. |
| `DB_PASSWORD` | *(empty)* | Only for a TCP connection. Locally a PostgreSQL usually lets you in as yourself without one. On a server prefer `DB_SOCKET`, so no password exists. |
| `DB_POOL_SIZE` | `8` | HikariCP maximum pool size. |
| `DB_CONNECTION_TIMEOUT` | `20000` | Milliseconds. |

The schema is owned by the migration runner, which applies pending
`db/migrations/V*.sql` at startup. `spring.jpa.hibernate.ddl-auto` is pinned to
`none` and must stay that way — see [MIGRATIONS.md](MIGRATIONS.md).

Tests ignore these and connect to `webposting_test` through `TEST_DB_*`
variables — see [MIGRATIONS.md](MIGRATIONS.md#the-test-database).

### Memory and threads

| Variable | Default | Notes |
|---|---|---|
| `JAVA_OPTS` | `-Xmx640m -Xms256m -XX:+UseSerialGC -XX:+ExitOnOutOfMemoryError -XX:MaxMetaspaceSize=192m` | JVM flags, read by `server-start.sh` (not by the application), sized for the 2 GB server. Put the value in **double quotes** in `deploy.env`, which is sourced as a shell file. Leave it out for the default; an empty `JAVA_OPTS=` starts the JVM with no flags. A release installs the current `server-start.sh` and prints the flags in effect. |
| `TOMCAT_THREADS` | `40` | Most requests handled at once (`server.tomcat.threads.max`; Spring's own default is 200, too many for 2 GB). |
| `TOMCAT_ACCEPT_COUNT` | `50` | Connections that may wait for a free thread before further ones are refused (`server.tomcat.accept-count`). |

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
| `UPLOAD_DIR` | `uploads` (dev) / **none** (prod) | Must exist and be writable by the server user. In production there is no default and it must be absolute: the server refuses to start otherwise (`ProductionConfigCheck`). |
| `UPLOAD_MAX_SIZE` | `50MB` | Parsed by Spring's multipart resolver. |
| `UPLOAD_MAX_BYTES` | `52428800` | Enforced by the application. Keep the two in agreement. |

Some uploads have their own, smaller ceilings in code, under the one above:
audio 20 MB (`UploadController`), avatars 25 MB before compression
(`AuthController`), header images 4 MB (`ProfileHeaderController`), fonts 2 MB
(`FontController`). Keep `UPLOAD_MAX_SIZE` and nginx's `client_max_body_size`
at 25 MB or more or avatars break.

Uploaded files live on disk, not in the database. `UPLOAD_DIR` holds post
images and their resized copies at the top level, plus `audio/`, `headers/`
and avatars, all counted in each user's storage. Back up `UPLOAD_DIR`
alongside `pg_dump`.

### Sessions

| Variable | Default | Notes |
|---|---|---|
| `SESSION_LIFETIME_MINUTES` | `1440` (24h) | Absolute cut-off. |
| `SESSION_IDLE_MINUTES` | `720` (12h) | Rolling; each authorized request pushes it forward. |

Sessions are held in memory, so **a server restart ends every session** whatever
these are set to. Persisting them is tracked in [tasks.md](tasks.md).

### Behind a proxy

| Variable | Default | Notes |
|---|---|---|
| `SERVER_FORWARD_HEADERS_STRATEGY` | `native` | Takes the client's address from `X-Forwarded-For`, trusting only a proxy on this machine or a private network. Rate limits depend on it. Leave it alone behind nginx. |

### Email, and the public URL

| Variable | Default | Notes |
|---|---|---|
| `APP_BASE_URL` | `http://localhost:5173` | Public address, used in links inside emails. Production warns if it says localhost. |
| `MAIL_ENABLED` | `false` | Everything email is off unless `true`; then `MAIL_HOST` is required. |
| `MAIL_FROM`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_SMTP_AUTH`, `MAIL_SMTP_STARTTLS` | see [EMAIL.md](EMAIL.md) | `MAIL_PASSWORD` is a secret: `deploy.env` only. |

### Admin update check (optional)

The admin panel's "Live build" box can say whether `main` has commits the live
build lacks. The repository is private, so only the server asks GitHub's API,
with a read-only token; no browser talks to GitHub and the token is never sent
to one. The route is `GET /api/admin/build/latest` (admin only). Answers are
cached for ten minutes (a failed check for one minute), with a 3 second timeout.

| Variable | Where | Notes |
|---|---|---|
| `GITHUB_REPO` | `deploy.env` | `owner/name` of the repository, for example `maepigeon/webpost.ing`. |
| `GITHUB_TOKEN` | `deploy.env` | A secret (same rules as `DB_PASSWORD`). Fine-grained personal access token with read-only access to this one repository. |

Both empty (the default) turns the check off: the box shows the live build and
"Update check is off." Nothing else depends on it.

To make the token: GitHub, Settings, Developer settings, Personal access tokens,
Fine-grained tokens, Generate new token. Name it for the site, set an expiry,
under Repository access choose "Only select repositories" and pick this one, and
under Repository permissions set **Contents** to **Read-only** (Metadata read is
added automatically; grant nothing else). Put the two lines in the server's
`deploy.env` and restart the service. When the token expires the box says "Could
not check" until a new one is put in.

### Backups and background work (optional)

| Variable | Default | Notes |
|---|---|---|
| `HEARTBEAT_URL` | none | A healthchecks.io-style ping URL. Read by `tools/backup.sh`: a good night pings it, a failed one pings `/fail`. Never printed or logged. |
| `BACKUP_KEEP_DAILY` | `7` | Nightly backups kept. |
| `BACKUP_KEEP_WEEKLY` | `4` | Weekly backups kept. |
| `PREVIEW_SWEEP_ENABLED` | `true` | The background sweep that fills card previews and search text for posts saved before V020. Set `false` to switch it off; it stops by itself when nothing is left. |

### Logging

| Variable | Default | Notes |
|---|---|---|
| `LOG_LEVEL` | `INFO` | Root logger level. |

### Deployment paths

Read by `tools/install-release.sh` (on the server) and `server-start.sh`, not by the application (`server-start.sh` itself is installed by the release, at the path the service's unit runs it from):

| Variable | Example | Notes |
|---|---|---|
| `WEB_ROOT` | `/srv/webposting/html` | Where nginx serves the built frontend. |
| `APP_HOME` | `/srv/webposting/app` | Runtime tree; the JAR goes to `$APP_HOME/server/target/`. |
| `SERVICE_NAME` | `webposting.service` | systemd unit restarted after publishing. |
| `JAR_PATH` | *(derived)* | Override only if the JAR lives outside `$APP_HOME/server/target/`. |
| `SERVER_PORT` | `8080` | Spring's own port setting; the install script reads it too, for its health check. Only set it if 8080 is taken. |

### Frontend build

`client/.env.development` and `client/.env.production`, read by Vite at build
time and baked into the bundle — so changing them requires a rebuild, and
neither may ever contain a secret.

| Variable | Dev | Prod |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8080` | *(empty — same origin)* |
| `VITE_IMAGES_BASE_URL` | `http://localhost:8080` | *(empty — same origin)* |

---

## Opening sign-ups (all off by default)

Nothing here changes behaviour until it is switched on.

| Name | Where | Effect |
|---|---|---|
| `TURNSTILE_SITE_KEY` | `deploy.env` | Public key for the Cloudflare Turnstile widget on the sign-up page. |
| `TURNSTILE_SECRET_KEY` | `deploy.env` | Server-side secret. While empty, no bot check happens. When set, `register` needs a `turnstileToken` and verifies it with Cloudflare (3 s timeout; fails closed). |
| `invite_required` | admin setting (`system_settings`) | Default true (absent row = true). Set to `false` to let people register without an invite code; every other limit still applies. |
| `require_verified_email` | admin setting (`system_settings`) | Default false (absent row = false). When `true` **and** `MAIL_ENABLED=true`, an account must confirm its email before it can create or publish posts or upload files (admins exempt). Reading, private drafts and profile edits stay allowed. |

`GET /api/signup/config` tells the sign-up page what to show. Turnstile also
needs two CSP additions, see [DEPLOYMENT.md](DEPLOYMENT.md) section 8.

---

## Sign in with Google and Microsoft (off by default)

A provider is off until **both** of its values are in `deploy.env`. With none
set the site behaves exactly as before: no "Continue with ..." buttons, and
every `/api/auth/sso/...` provider address answers 404. `GET /api/signup/config`
lists the providers that are on (`ssoProviders`). What the owner does at each
provider is the checklist at the top of [SSO-PLAN.md](SSO-PLAN.md).

| Name | Where | Effect |
|---|---|---|
| `SSO_GOOGLE_CLIENT_ID` | `deploy.env` | The OAuth client ID of the "Web application" client in Google Cloud Console. |
| `SSO_GOOGLE_CLIENT_SECRET` | `deploy.env` | Its client secret. A secret: `deploy.env` only. |
| `SSO_MICROSOFT_CLIENT_ID` | `deploy.env` | The "Application (client) ID" of the app registration in Microsoft Entra. |
| `SSO_MICROSOFT_CLIENT_SECRET` | `deploy.env` | The client secret's **Value** (not its ID). A secret; it expires (24 months at most), and Microsoft sign-in stops when it does. |
| `SSO_MICROSOFT_TENANT` | `deploy.env` | Default `common` (work, school and personal accounts). `consumers` = personal accounts only, `organizations` = work and school only, or one tenant's ID. It must match the "Supported account types" chosen in Entra. Any other value switches Microsoft off. |
| `SSO_REDIRECT_BASE` | `deploy.env`, optional | Where the provider sends people back, when that is not `APP_BASE_URL`. Not needed in production. Locally, set it to the API's address when the pages are served from another port (`http://localhost:8080` beside the dev server on 5173). |
| `SSO_APPLE_*` | not used yet | Sign in with Apple is not built. Setting `SSO_APPLE_CLIENT_ID` only logs a warning; Apple stays off. |

The server restarts to pick these up. The start-up log warns when a provider
has only one of its two values, and never prints a secret.

### Redirect addresses to register (exactly: https, no trailing slash)

```
https://webpost.ing/api/auth/sso/google/callback
https://webpost.ing/api/auth/sso/microsoft/callback
```

The rule is `APP_BASE_URL` (or `SSO_REDIRECT_BASE` when set) followed by
`/api/auth/sso/<provider>/callback`; `APP_BASE_URL` must therefore be the real
public address. For a local run add the matching local address at the
provider too, for example `http://localhost:5174/api/auth/sso/google/callback`
for `tools/run-local.sh` (Google and Microsoft both allow `http://localhost`).

nginx needs no change: these are ordinary `/api/` addresses. Nothing from a
provider is stored except its id for the person, the email it reported and
whether it called that email verified (table `user_identities`); no tokens.

---

## Migrating an existing server to this layout

Done on production on 2026-09-30 (settings moved from an untracked
`application.properties` into `deploy.env`). Releases are built on your own
computer; see [DEPLOYMENT.md](DEPLOYMENT.md), which also lists what
`deploy.env` must contain for the server to start in production.

---

## Adding a new setting

1. Add `foo.bar=${FOO_BAR:sensible-default}` to `application.properties`.
2. Add a commented entry to `config/deploy.env.example` explaining it.
3. Add a row to the table above.
4. Read it with `@Value("${foo.bar:sensible-default}")`.

Always give a default that works for local development, so a fresh clone runs
with no configuration at all.
