# Deploying webpost.ing

Last verified: 2026-10-01 (release scripts rehearsed locally, including both
rollback paths).

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

- Open the site, **hard-refresh** (the browser may keep an old
  `index.html`), sign in, open a profile and a post.
- `curl -s https://<your site>/api/health` should say `{"status":"ok",…}`.

---

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

**A migration broke the data.** Restore the database dump taken just before
the release (this loses anything written since):

```bash
sudo systemctl stop "$SERVICE"
sudo -u postgres pg_restore --clean --if-exists -d "$DB" $B/$DB.dump
sudo systemctl start "$SERVICE"
```

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
  URLs reach the app.
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
images, avatars and fonts live on disk, so a database dump alone restores
every post with its pictures broken. To do (guide/tasks.md): a nightly
database-and-uploads backup copied off the server, and an uptime monitor on
`/api/health`.
