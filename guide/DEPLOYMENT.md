# Deploying webpost.ing

Last checked against the code: 2026-10-03, on `main` (migrations V008 to
V014 are new since the last release). The release scripts were rehearsed
locally, including both rollback paths, but **have not yet run against the
real server**: the first real release is their first real test (see "Before
you release").

**The short way, on a Mac.** `./tools/mac-app/build.sh` makes
`~/Applications/Webposting.app`: a small menu to build and view what is
checked out (`tools/run-local.sh`, at http://localhost:5174) and to deploy it
(`tools/deploy.sh`: commit if needed, push `main` to GitHub, then log in
to the server and update it). The first time, `deploy.sh` asks for the
server login and for the command the server runs to update itself; with no
command it uses `tools/release.sh` (build here, upload). `./tools/deploy.sh
--setup` asks again. Each runs in a Terminal window, where the release asks
for your passwords. Everything below still applies; the app only runs the
scripts for you.

**Two rules.**

1. **Build on your own computer, never on the server.** The server is small.
   Building, testing or running extra Java or Postgres processes there is what
   ran it out of memory and crashed it on 2026-09-30. The server only receives
   finished releases.
2. **No credentials or server details in the repository.** It is public. The
   server's addresses, paths, names and settings live in its `deploy.env` (on
   the server) and your `release.env` (on your computer), neither of them in
   git. The database needs no password at all (section 4).

---

## Before you release

On your own computer. Nothing here touches the server.

1. **Merge.** Merge the branch you are releasing into `main`, then check it
   out and pull. The release is built from whatever is checked out, so make
   sure the working tree is clean and the latest commit is the one you mean.
2. **Font.** `client/public/fonts/Chococooky.woff2` must exist (see
   [Choco Cooky](#choco-cooky)). It is gitignored, so a fresh checkout or
   worktree does not have it, and `release.sh` stops without it.
3. **`release.env`** exists in the repository root with `DEPLOY_HOST` and
   `SERVER_ENV` set (see "One-time setup on your computer"). Not needed for
   `--build-only`.
4. **Local prerequisites:** Java 21, Node 20.19 or newer, and the empty
   `webposting_test` database (`createdb webposting_test`).
5. **Dry run first, this once.** `./tools/release.sh --no-install` tests,
   builds and uploads without going live. Then on the server run the
   install with `--dry-run` (table below) and read what it would do.
6. **Release:** `./tools/release.sh`. It asks for your SSH and sudo passwords.
7. Run the **smoke test** below.

### What this release changes

Everything since the last deploy (`git log --oneline origin/main..HEAD`
lists it). What matters for the server:

- **Seven migrations, V008 to V014.** They run by themselves when the new
  server starts, in order, after the install has taken its database backup.
  Each is wrapped in a transaction and written to be safe to run again, so a
  failure part-way leaves nothing half-done and the next start retries it.
  They only add things, except V008, which swaps a key. What each does:
  [MIGRATIONS.md](MIGRATIONS.md#current-migration-history).
- **No existing data is rewritten** except V009, which copies each author's
  current profile theme onto their existing posts, so nothing changes
  visually.
- **First release made with `release.sh`.** It also brings the passwordless
  database connection (`DB_SOCKET`), real-client-address handling for rate
  limits (nginx already sends `X-Forwarded-For`), and a production start-up
  check that **refuses to start** if `deploy.env` is wrong. If the new
  version won't start, the install rolls back by itself, and the journal
  names the variable to fix. In `deploy.env` the server needs
  `APP_PROFILE=prod`, `DB_NAME` (not `testdb`), either `DB_SOCKET` or
  `DB_PASSWORD`, `ALLOWED_ORIGINS` (the public origin, not localhost), and
  `UPLOAD_DIR` as an **absolute** path. The old built-in default for
  `UPLOAD_DIR` is gone, so a `deploy.env` that relied on it fails now.
  `APP_BASE_URL` pointing at localhost is only a warning.
- **New kinds of file in `UPLOAD_DIR`:** `audio/` (MP3s, up to 20 MB each,
  from `POST /upload/audio`), `headers/` (profile header images, up to 4 MB),
  and avatars (accepted up to 25 MB, then compressed). Post images are
  where they were. All are recorded in the `uploads` table (filename
  prefixes `audio/`, `header/`, `avatar/`) and all count towards each
  user's storage quota (`StorageAccountService`). They need no setup: the
  server creates the directories on first use. A database backup without
  `UPLOAD_DIR` loses them.
- **New endpoints.** Nothing to configure; listed so you know what to test:
  `/feed/following`, `/users/{u}/banner`, `/users/{u}/stickers`,
  `/users/{u}/stickies`, `/upload/audio`, `/posts/{id}/card`,
  `/posts/{id}/visibility`, `/posts/{id}/card-grid`, `/packs`,
  `/packs/{id}`, `/packs/{id}/save`. In production all are under `/api/`
  like the rest.
- **Choco Cooky** ships inside the website build (`html/fonts/`), so the
  server needs nothing extra for it.

### One-time steps after this release

Once, after the smoke test passes:

1. Run `use-passwordless-db.sh` (section 4). It removes the database
   password from `deploy.env`. Recommended; optional, since a TCP password
   still works.
2. Run `remove-stale-secrets.sh` (section 4), to delete leftover old
   `application*.properties` files and hash files.
3. Check nginx against the list in section 3 (body size and the `/uploads/`
   location). A release never changes nginx.
4. Rotate the two old database passwords that are in the repository
   history (section 4).

### Smoke test

After a hard refresh (Ctrl/Cmd+Shift+R). If something fails, see "When
something goes wrong".

- `https://<site>/api/health` shows `{"status":"ok",...}`.
- The home page loads, and the Cute theme shows Choco Cooky (a missing font
  file shows as a plain fallback font, not an error).
- Sign in (the restart signed everyone out), sign out, sign in again.
- The Following feed shows recent posts of people you follow.
- Your profile: the banner grid shows, an avatar upload works, pinned post
  and folders look right, stickies sit where you put them.
- Open a post: it has its own theme; opening it from a second signed-in
  account raises its view count (V008); comments and reactions work.
- Create a post with an image, an **audio block** (upload a small MP3, play
  it, drag the playhead: seeking needs range requests), a grid and a
  sticker. Publish, reload, check it is all still there.
- Change a post between public and private from the arrange view; a private
  post must not show when signed out.
- Send a **post in a message**: the card appears in the conversation and
  opens the post. Share a sticker pack and save it from the other account.
- Settings, Storage: audio, header and avatar files are counted.
- Customize profile: change the banner and theme, save, reload.
- Upload a file over 50 MB: it fails with a message, not a blank error.
- `sudo journalctl -u "$SERVICE" -n 100` shows no repeated errors.

---

## 1. Releasing (the normal way)

On your own computer, from the repository root, on the commit you want live:

```bash
./tools/release.sh
```

It does five things, and stops at the first that fails:

1. **Tests**: the server suite (needs your local `webposting_test` database,
   see [MIGRATIONS.md](MIGRATIONS.md#the-test-database)) and the client suite.
2. **Builds** the website (`client/dist`) and the server JAR.
3. **Packs** them, with the install script and the one-off server scripts,
   into `release/webposting-<date>-<commit>.tar.gz`.
4. **Uploads** it to `~/incoming` on the server and unpacks it (asks for your
   SSH password).
5. **Installs** it with `sudo` (asks for your sudo password on the server).
   The install script:
   - backs up the database (`pg_dump`), the running JAR and the website to
     `~/backups/release-<timestamp>/` in your home on the server;
   - swaps the new JAR and website in (by renaming, so nothing is ever
     half-written);
   - restarts the service and waits up to 2 minutes for `GET /api/health`
     to answer `{"status":"ok"}`;
   - if it doesn't, **puts the previous JAR and website back** and restarts.

Expect everyone to be signed out: sessions live in memory, so every restart
ends them.

Other ways to run it:

| Command | Does |
|---|---|
| `./tools/release.sh --build-only` | test and build the archive; upload nothing |
| `./tools/release.sh --no-install` | …and upload it; install later yourself |
| `./tools/release.sh --skip-tests` | skip the tests (emergencies only) |
| `sudo bash ~/incoming/<release>/install.sh --env <deploy.env> --dry-run` | on the server: show what an install would do |
| `sudo bash ~/incoming/<release>/install.sh --env <deploy.env>` | on the server: install an uploaded release |

Database migrations need no step of their own: the server applies pending
`db/migrations/V*.sql` when it starts, and the install backs the database up
just before that happens.

### One-time setup on your computer

- Java 21 and Node 20.19 or newer (`java -version`, `node -v`).
- A local test database: `createdb webposting_test`.
- `release.env`, from the example, with your server's address and where its
  `deploy.env` is. It's gitignored.
  ```bash
  cp config/release.env.example release.env && $EDITOR release.env
  ```
- SSH access to the server. To stop typing the password every time:
  `ssh-copy-id <you>@<server>`.

### After a release

- Run the smoke test above. At the least: `curl -s https://<your site>/api/health`
  should say `{"status":"ok",…}`; then **hard-refresh** (the browser may keep
  an old `index.html`), sign in, open a profile and a post.

---

### Cool Jazz

Optional, and handled like Choco Cooky below: Samsung's Cool Jazz is served
from `client/public/fonts/Cooljazz.woff2` when that file exists (gitignored;
make it from the TrueType file the same way). Without it the Cool Jazz
choices (post editor, themes, the grid's "Cool Jazz pixel") fall back to a
casual hand, and `release.sh` does not stop.

### Choco Cooky

The Cute theme font and the grid's Cute typeface use Samsung's Choco Cooky,
served with the site from `client/public/fonts/Chococooky.woff2`. The file is
gitignored, because the repository is public, so each checkout that releases
needs its own copy, and `release.sh` stops if it is missing. To make one from
the TrueType file (`~/Library/Fonts/Chococooky.ttf` on the owner's Mac):

```bash
python3 -m venv /tmp/ft && /tmp/ft/bin/pip install fonttools brotli
/tmp/ft/bin/python -c "from fontTools.ttLib import TTFont as T; f=T('$HOME/Library/Fonts/Chococooky.ttf'); f.flavor='woff2'; f.save('client/public/fonts/Chococooky.woff2')"
```

## 2. When something goes wrong

Every command below reads the server's settings from its `deploy.env`, so
nothing here names your server. Start with:

```bash
ENV=/path/to/deploy.env        # SERVER_ENV in your release.env
get() { sudo grep -E "^$1=" "$ENV" | tail -1 | cut -d= -f2-; }
APP_HOME=$(get APP_HOME); WEB_ROOT=$(get WEB_ROOT); SERVICE=$(get SERVICE_NAME); DB=$(get DB_NAME)
JAR=$APP_HOME/server/target/server-0.0.1-SNAPSHOT.jar
```

**The install rolled back on its own.** The previous version is running; the
output above the rollback says why the new one failed. Logs:
`sudo journalctl -u "$SERVICE" -n 200`.

**The new version is live but misbehaving.** Put the previous release back
from its backup:

```bash
B=~/backups/release-<timestamp>      # the one made by the bad release
sudo cp -p $B/server.jar $JAR.new && sudo mv -f $JAR.new $JAR
sudo rm -rf "$WEB_ROOT" && sudo tar -xzf $B/html.tgz -C "$(dirname "$WEB_ROOT")"
sudo systemctl restart "$SERVICE"
```

**Rolling back with the migrations left in place is safe.** V008 to V014
only add tables and columns (V008 swaps a key), and the previous JAR
ignores what it does not know, so putting the old JAR and website back does
not need the database restored. Restore it only if the data itself is wrong.

**A migration broke the data.** Restore the database dump taken just before
the release (this loses anything written since):

```bash
sudo systemctl stop "$SERVICE"
sudo -u postgres pg_restore --clean --if-exists -d "$DB" $B/$DB.dump
sudo systemctl start "$SERVICE"
```

Files in `UPLOAD_DIR` are not in the release backup and are never rolled
back. Anything uploaded since stays on disk, which does no harm.

---

## 3. How the server is laid out

The specifics (paths, names, the database) are in its `deploy.env`; see
[CONFIGURATION.md](CONFIGURATION.md) for every key.

- The service runs the JAR in `$APP_HOME/server/target/` through
  `server-start.sh`, as its **own system user, not root**, with systemd
  hardening. It reads `deploy.env` at startup: change it, then restart.
- `deploy.env` is readable only by root and the service's group.
- nginx serves the website from `$WEB_ROOT` and passes `/api/` to the app on
  `127.0.0.1`. Its config is on the server only: HSTS, `nosniff`,
  `server_tokens off`, a 50 MB body limit on `/api/`, `X-Forwarded-For` set to
  the real client address, and `try_files $uri $uri/ /index.html` so profile
  URLs reach the app. A sample is in the top-level README.

  What the app needs from it:
  - `client_max_body_size` on `/api/` of at least `UPLOAD_MAX_SIZE` (50 MB by
    default). The biggest single uploads are avatars (25 MB) and audio
    (20 MB). Over nginx's limit, a request is refused with a bare `413`
    before the app sees it.
  - `/uploads/` served from `$UPLOAD_DIR` (an `alias`, as in the README) or
    proxied to the app, which serves it itself. Either way **audio needs
    HTTP range requests** for seeking; nginx's static files and Spring's
    resource handler both support them. Do not add caching or buffering
    rules to `/uploads/` that strip `Range` or `Accept-Ranges`.
  - `X-Forwarded-For` set from `$proxy_add_x_forwarded_for`, because rate
    limits key on it.
- Uploads live outside both, in `$UPLOAD_DIR`, owned by the service's user.
- Release uploads go to `~/incoming/`, release backups to `~/backups/`.

---

## 4. Credentials

### No database password

Run once, after the first release that includes `DatabaseSocketConfig`
(2026-10-01 or later):

```bash
sudo bash ~/incoming/<release>/server-tools/use-passwordless-db.sh "$ENV"
```

It lets the service's system user into the database over PostgreSQL's local
socket with peer authentication, sets `DB_SOCKET` in `deploy.env`, deletes
`DB_PASSWORD` from it, restarts, and checks `/api/health`. Anything failing
puts every file back. At the end it offers to remove the password from the
database role itself, so the old one stops working wherever it was copied
to. Say yes. You still get into the database on the server as yourself:
`sudo -u postgres psql "$DB"`.

### Leftover copies

```bash
sudo bash ~/incoming/<release>/server-tools/remove-stale-secrets.sh "$ENV"
```

It finds old `application*.properties` files that hold a database login, and
password-hash files, lists them, and deletes them when you say yes.

### Old passwords in git history

Two old database passwords are in this public repository's history. See
[SECURITY.md](SECURITY.md) item 1. Rotate them wherever they were used. Then
decide whether to rewrite the history, which changes every commit hash and
needs a force-push.

---

## 5. Gotchas that have cost time

**Never build or run tests on the server**, and don't leave a VSCode
Remote-SSH or Claude session open there. Each reconnect starts more
background processes and keeps the old ones for three hours. That is how
the second crash on 2026-09-30 happened.

**Use `systemctl`, not `kill`.** systemd restarts a killed JVM straight away,
and a normal user can't even see the service's process.

**Hard-refresh after a release.** Vite gives every bundle a new filename, but
a cached `index.html` still points at the old one. If a fix "isn't live",
check which bundle the browser loaded before debugging the code.

**Usernames are case-sensitive** in hand-written SQL. Confirm a write changed
a row: `UPDATE 0` means it didn't.

**`DROP DATABASE` can't run in a transaction**, so give each statement its
own `-c`. On PostgreSQL 15+ a new database needs
`GRANT ALL ON SCHEMA public TO <user>;` or every migration fails on
permissions.

---

## 6. Backups

Each release backs up the database, JAR and website (section 1). That's not
the same as regular backups: nothing schedules `tools/backup.sh` yet, and
images, avatars, header images and audio live on disk (`UPLOAD_DIR`), so a
database dump alone restores every post with its pictures and audio broken. To do (guide/tasks.md): a nightly
database-and-uploads backup copied off the server, and an uptime monitor on
`/api/health`.
