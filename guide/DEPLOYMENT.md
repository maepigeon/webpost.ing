# Deployment Runbook — webpost.ing

Written from what actually happened on the production host, not from what the
scripts assume. `guide/README.md` §5 describes an idealized setup that does not
match the live server; where they disagree, **this file is correct**.

Last verified: 2026-09-08 (against the deploy session of 2026-07-09).

---

## 1. Production facts

| Thing | Value |
|---|---|
| Repo checkout (build here) | `/home/mae/webpost.ing` |
| Frontend served from | `/var/www/webpost.ing/html/` |
| JAR the service runs | `/home/webpost.ing/server/target/server-0.0.1-SNAPSHOT.jar` |
| Process owner | **root**, via systemd |
| systemd unit | `start-servers.service` → `/home/webpost.ing/server-start.sh` |
| Server log | `/tmp/webposting.log` |
| Database | `webpostingdb` (**not** `webposting`, **not** `testdb`) |
| DB user | `mae` |
| Uploads | `/var/www/webposting/uploads` (from `application-prod.properties`) |
| API port | `8080`, reverse-proxied by nginx at `/api/` |

Two directory trees are easy to confuse: the **build** tree is under
`/home/mae/`, the **runtime** tree is under `/home/webpost.ing/`. Building does
not deploy — artifacts must be copied across.

---

## 2. Standard deploy

```bash
cd /home/mae/webpost.ing
git pull

# frontend
cd client && npm ci && npm run build

# backend
cd ../server && ./mvnw package -DskipTests

# publish frontend (needs sudo — the assets dir is root-owned in places)
sudo cp -r /home/mae/webpost.ing/client/dist/. /var/www/webpost.ing/html/

# publish backend
sudo cp /home/mae/webpost.ing/server/target/server-0.0.1-SNAPSHOT.jar \
        /home/webpost.ing/server/target/

# restart (this is the only correct way — see §3)
sudo systemctl restart start-servers.service

# verify
curl -s -o /dev/null -w '%{http_code}\n' https://webpost.ing/api/posts
tail -40 /tmp/webposting.log
```

Database migrations need no separate step: `DatabaseMigrationService` applies
every pending `classpath:db/migrations/V*.sql` at startup and records it in
`schema_migrations`. Watch the log line
`Database migration complete — applied: N, skipped: M`.

---

## 3. Gotchas that have actually cost time

**Do not `kill` the Java process.** It is owned by root under
`start-servers.service`, which restarts it immediately — you get a confusing
"port 8080 already in use" on your own start attempt. Also, `lsof -ti :8080`
run as `mae` cannot see a root-owned listener, so the port looks free when it
is not. Always use `sudo systemctl restart start-servers.service`.

`deploy.sh` in the repo root does *not* match this host: it kills by port,
starts the JAR with `nohup` as the invoking user, and never copies anything to
`/var/www/webpost.ing/html/` or `/home/webpost.ing/`. Running it produces a
build plus an unmanaged second server. Treat it as a local-dev convenience
only, or fix it to do the copies and use systemctl.

**`application.properties` is gitignored and lives only on the server.** A
`git pull` never updates it, and a fresh clone has none — the app then fails to
start with a datasource error. Production content:

```properties
spring.profiles.active=prod
spring.datasource.url=jdbc:postgresql://localhost:5432/webpostingdb
spring.datasource.username=mae
spring.datasource.password=<password>
spring.datasource.driver-class-name=org.postgresql.Driver
spring.jpa.hibernate.ddl-auto=none
```

Keep a copy outside the repo. The JAR bundles this file at package time, so
editing it requires a **rebuild**, not just a restart.

**Usernames are case-sensitive.** The account is `Mae`, not `mae`. Any
hand-written `WHERE username = '...'` must match exactly; a wrong case reports
`UPDATE 0` and silently does nothing. Always confirm the write:

```bash
psql -U mae -d webpostingdb -c "SELECT username FROM users;"
```

`psql -U mae -d webpostingdb` works without `sudo` — reach for
`sudo -u postgres` only for cluster-level operations (CREATE/DROP DATABASE,
role management).

**Hard-refresh after a frontend deploy.** Vite content-hashes filenames, but a
cached `index.html` keeps pointing at the old bundle. If a fix "isn't live",
check which hash the browser actually loaded before re-debugging the code.

**Verify the copy landed.** Compare timestamps rather than trusting `cp`:

```bash
ls -la /var/www/webpost.ing/html/assets/*.js | tail -3
grep -o 'index-[^.]*\.js' /var/www/webpost.ing/html/index.html
```

A silently failed `sudo cp` was mistaken for a broken fix for several rounds.

---

## 4. Postgres cluster operations

`DROP DATABASE` cannot run inside a transaction block, so each statement needs
its own `-c` invocation — several `-c` clauses in one command are wrapped in a
transaction and fail.

```bash
sudo -u postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='webpostingdb';"
sudo -u postgres psql -c "DROP DATABASE webpostingdb;"
sudo -u postgres psql -c "CREATE DATABASE webpostingdb OWNER mae;"
sudo -u postgres psql -d webpostingdb -c "GRANT ALL ON SCHEMA public TO mae;"
```

The last line is not optional on PostgreSQL 15+: `public` is no longer
world-writable, so a non-owner role cannot create tables and every migration
fails with a permissions error. This is what made a freshly recreated
`webposting` database unusable and forced the move to `webpostingdb`.

---

## 5. Back up before anything destructive

```bash
pg_dump -Fc -U mae webpostingdb > ~/backup_$(date +%Y%m%d_%H%M%S).dump
pg_restore -c -d webpostingdb ~/backup_20260709_120000.dump   # restore
```

Also back up the uploads directory — images live on disk, not in the database:

```bash
tar czf ~/uploads_$(date +%Y%m%d).tar.gz -C /var/www/webposting uploads
```

---

## 6. Post-deploy smoke check

```bash
curl -s -o /dev/null -w 'posts %{http_code}\n'  https://webpost.ing/api/posts
curl -s https://webpost.ing/api/users/Mae/background; echo
grep -iE 'error|exception|migration' /tmp/webposting.log | tail -20
```

Then in a browser, hard-refreshed: log in, open a profile (wallpaper renders),
open a post, post a comment, send a DM.
