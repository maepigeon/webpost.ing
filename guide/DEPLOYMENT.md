# Deploying webpost.ing

Last verified: 2026-10-01 (release scripts rehearsed locally, including both
rollback paths; production layout from the go-live of 2026-09-30).

**The rule: build on your own computer, never on the server.** The server is a
1-CPU, 2 GB droplet. Building, testing or running extra Java or Postgres
processes there is what ran it out of memory and crashed it on 2026-09-30.
The server only receives finished releases.

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
3. **Packs** them, with the install script, into
   `release/webposting-<date>-<commit>.tar.gz`.
4. **Uploads** it to `~/incoming` on the server and unpacks it (asks for your
   SSH password).
5. **Installs** it with `sudo` (asks for your sudo password on the server).
   The install script:
   - backs up the database (`pg_dump`), the running JAR and the website to
     `/home/mae/backups/release-<timestamp>/`;
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
| `sudo bash ~/incoming/<release>/install.sh --dry-run` | on the server: show what an install would do |
| `sudo bash ~/incoming/<release>/install.sh` | on the server: install an uploaded release |

Database migrations need no step of their own: the server applies pending
`db/migrations/V*.sql` when it starts, and the install backs the database up
just before that happens.

### One-time setup on your computer

- Java 21 and Node 20.19 or newer (`java -version`, `node -v`).
- A local test database: `createdb webposting_test`.
- SSH access: `ssh mae@webpost.ing` should work. If you'd rather not type the
  password every time, set up a key: `ssh-copy-id mae@webpost.ing`.

### After a release

- Open https://webpost.ing, **hard-refresh** (the browser may keep an old
  `index.html`), sign in, open a profile and a post.
- `curl -s https://webpost.ing/api/health` should say `{"status":"ok",…}`.

---

## 2. When something goes wrong

**The install rolled back on its own.** The previous version is running; the
output above the rollback says why the new one failed. Logs:
`sudo journalctl -u start-servers -n 200`.

**The new version is live but misbehaving.** Put the previous release back
from its backup:

```bash
B=/home/mae/backups/release-<timestamp>      # the one made by the bad release
sudo cp -p $B/server.jar /home/webpost.ing/server/target/server-0.0.1-SNAPSHOT.jar.new
sudo mv -f /home/webpost.ing/server/target/server-0.0.1-SNAPSHOT.jar.new /home/webpost.ing/server/target/server-0.0.1-SNAPSHOT.jar
sudo rm -rf /var/www/webpost.ing/html && sudo tar -xzf $B/html.tgz -C /var/www/webpost.ing
sudo systemctl restart start-servers.service
```

**A migration broke the data.** Restore the database dump taken just before
the release (this loses anything written since):

```bash
sudo systemctl stop start-servers.service
sudo -u postgres pg_restore --clean --if-exists -d webpostingdb $B/webpostingdb.dump
sudo systemctl start start-servers.service
```

---

## 3. Production facts

| Thing | Value |
|---|---|
| Server | DigitalOcean droplet, 1 vCPU, ~2 GB RAM, host `webpost.ing`, user `mae` |
| JAR the service runs | `/home/webpost.ing/server/target/server-0.0.1-SNAPSHOT.jar` (owned by `mae`) |
| Website | `/var/www/webpost.ing/html` (owned by `mae`) |
| Uploads | `/var/www/webposting/uploads` (owned by `webposting`, served by nginx) |
| Service | `start-servers.service` → `/home/webpost.ing/server-start.sh`, runs as **`webposting`** (not root), with systemd hardening |
| Settings | `/home/webpost.ing/deploy.env` (`root:webposting`, mode 0640). Read at startup: change it, then restart |
| Database | `webpostingdb` on the same machine; app user `mae` |
| API | `127.0.0.1:8080`, behind nginx at `/api/` |
| Health | `GET /api/health` |
| Release uploads | `~/incoming/` (mae's home) |
| Backups | `/home/mae/backups/` (release backups, older dumps) |

`/home/webpost.ing` is an old git checkout. Only `server-start.sh`,
`deploy.env` and the JAR there are live. Don't build or `git pull` there.
`/home/mae/webpost.ing` is an old build tree; don't build there either.

nginx config is on the server only (`/etc/nginx/sites-available/webpost.ing`):
HSTS, `nosniff`, `server_tokens off`, a 50 MB body limit on `/api/`,
`X-Forwarded-For` set to the real client address, and a catch-all
`try_files $uri $uri/ /index.html` so profile URLs like `/maepigeon` reach the
app.

---

## 4. Gotchas that have cost time

**Never build or run tests on the server**, and don't leave a VSCode
Remote-SSH or Claude session open there. Each reconnect starts more
background processes and keeps the old ones for three hours. That is how
the second crash on 2026-09-30 happened.

**Use `systemctl`, not `kill`.** systemd restarts a killed JVM straight away,
and a normal user can't even see the service's process on port 8080.

**Hard-refresh after a release.** Vite gives every bundle a new filename, but
a cached `index.html` still points at the old one. If a fix "isn't live",
check which bundle the browser loaded before debugging the code.

**Usernames are case-sensitive** in hand-written SQL. The admin account is
`maepigeon`. Confirm a write changed a row: `UPDATE 0` means it didn't.

**`DROP DATABASE` can't run in a transaction**, so give each statement its
own `-c`. On PostgreSQL 15+ a new database needs
`GRANT ALL ON SCHEMA public TO mae;` or every migration fails on permissions.

---

## 5. Backups

Each release backs up the database, JAR and website (section 1). That's not
the same as regular backups: nothing schedules `tools/backup.sh` yet, and
images, avatars and fonts live on disk, so a database dump alone restores
every post with its pictures broken. To do (guide/tasks.md): a nightly
database-and-uploads backup copied off the server, and an uptime monitor on
`/api/health`.
