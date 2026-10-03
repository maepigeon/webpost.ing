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
server login and where `deploy.env` is on the server, then it runs
`tools/release.sh` (build here, upload, install). `./tools/deploy.sh
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
5. Memory limits and nginx caching (section 9): copy the new
   `server-start.sh`, add the systemd memory limit and swap, paste the nginx
   files. A release does none of this.

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

---

## 7. Installable web app

The site can be added to a phone or tablet home screen (Settings, App).
`sw.js` and `manifest.webmanifest` ship in the website build (`client/public`).
nginx must serve `/sw.js` with `Cache-Control: no-cache`, or browsers keep an
old worker and updates arrive late:

```
location = /sw.js { add_header Cache-Control "no-cache"; }
location = /manifest.webmanifest { add_header Cache-Control "no-cache"; }
```

## 8. Security headers in nginx

(Section 9.4 has these headers merged into one complete nginx example, with
caching; use it when you paste, and keep this section for the reasons.)

Spring only sets headers on API responses; the HTML and `/uploads/` are served by
nginx, so the headers go there (security review M10). The origin list below was
taken from `client/index.html` and the client code: Google Fonts (stylesheet from
`fonts.googleapis.com`, files from `fonts.gstatic.com`) and `api.github.com` (the
admin build check). Nothing else is loaded from outside.

Roll the policy out as `Content-Security-Policy-Report-Only` first, load every page
type (home, a post with images, a themed post, settings, admin, the editor) with
the browser console open, fix anything it reports, then rename the header to
`Content-Security-Policy`. Remember that `add_header` in a `location` replaces
every header inherited from the `server` block, so each location repeats them.

```nginx
# inside the server { } block that serves the site
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header X-Frame-Options "DENY" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; media-src 'self'; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://api.github.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;

location /uploads/ {
    # user-supplied files: never executed or rendered as a page
    add_header X-Content-Type-Options "nosniff" always;
    add_header Content-Security-Policy "default-src 'none'; sandbox" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    # ...existing alias / expires lines...
}
```

**Turnstile (only if `TURNSTILE_SECRET_KEY` is set):** add
`https://challenges.cloudflare.com` to both `script-src` and `frame-src`, i.e.
`script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com`
(the `default-src 'self'` above would otherwise block the widget's frame). The
sign-up page loads Cloudflare's script on demand; `index.html` is unchanged.

`'unsafe-inline'` is for styles only, because the app and the Lexical editor use
inline `style=` attributes; scripts stay `'self'`. If the page uses an inline
`<script>` (for example JSON-LD is fine, it is not executed, but a real script is
not) the report-only phase will show it.

---

## 9. Memory and caching (do once on the server)

Source: [performance-review-2026-10-03.md](performance-review-2026-10-03.md)
(items 1 and 2). The repository now carries the app side of this (JVM
flags in `server-start.sh`, thread and pool limits and response compression
in `application.properties`). What is left is the server itself, in four
steps. Nothing here needs a build, and none of it touches the database.
Do them in this order.

### 9.1 Get the new `server-start.sh` onto the server

**A release does not ship `server-start.sh`** (`release.sh` packs the JAR,
the website and the server tools only), so the copy in `$APP_HOME` stays
as it is until you replace it. From your Mac, in the repository root, then
on the server:

```bash
scp server-start.sh <you>@<server>:~/incoming/server-start.sh      # Mac
```

```bash
# server; $ENV and $APP_HOME as at the top of section 2
sudo install -m 755 --owner="$(stat -c %U $APP_HOME/server-start.sh)" \
     --group="$(stat -c %G $APP_HOME/server-start.sh)" \
     ~/incoming/server-start.sh $APP_HOME/server-start.sh
```

It takes effect at the next restart, which the next release does anyway.
The new script runs the JVM with `-Xmx640m -Xms256m -XX:+UseSerialGC
-XX:+ExitOnOutOfMemoryError -XX:MaxMetaspaceSize=192m`. To change them, set
`JAVA_OPTS` in `deploy.env` (see `config/deploy.env.example`). If you would
rather not copy the file: `JAVA_TOOL_OPTIONS=<the same flags>` in
`deploy.env` reaches the JVM through the old script too.

### 9.2 Memory limit for the service (systemd drop-in)

A drop-in keeps your unit file as it is. If the JVM ever grows past the
limit, systemd stops that one service instead of the machine running out of
memory and taking PostgreSQL with it. `Restart=on-failure` (already in the
unit) brings it back.

```bash
sudo systemctl edit webposting.service       # use your SERVICE_NAME
```

In the editor that opens, paste exactly this and save:

```ini
[Service]
MemoryMax=1200M
```

```bash
sudo systemctl restart webposting.service     # signs everyone out, like a release
```

Check:

```bash
systemctl show webposting.service -p MemoryMax          # MemoryMax=1258291200
sudo journalctl -u webposting.service -n 20 | grep "java opts"   # shows the -Xmx640m flags
ps -o rss=,args= -C java | cut -c1-120                  # RSS (KB) should sit well under 1,200,000
curl -s https://webpost.ing/api/health
```

The `java opts` line only appears once 9.1 is done.

### 9.3 One gigabyte of swap, as a safety net

Look first: if `swapon --show` already lists something, skip this.

```bash
swapon --show; free -h
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-webposting-swap.conf
sudo sysctl -p /etc/sysctl.d/99-webposting-swap.conf
```

Check: `swapon --show` lists `/swapfile` at 1G, `free -h` shows a Swap line of
1.0Gi, `cat /proc/sys/vm/swappiness` says `10`, and
`grep swapfile /etc/fstab` shows one line (so it survives a reboot).

### 9.4 nginx: caching, compression, security headers, SEO in one place

This replaces the scattered snippets in sections 7 and 8 and in
[SEO.md](SEO.md) with one complete example. Three files, pasted once:
two small header files and one server block. Paste, then `sudo nginx -t`;
nginx refuses to reload a broken config, so a mistake costs nothing.

**Read before pasting.**

- **Keep your existing `/api/` block's `proxy_pass` form.** The README
  sample has `proxy_pass http://127.0.0.1:8080/;` (trailing slash, which
  strips the `/api` prefix), but the controllers are mapped under `/api/...`,
  so a working server must pass the path through unchanged, or the real
  config differs from the sample. The audit could not see the live file. In
  the example below, `proxy_pass http://127.0.0.1:8080;` stands for **your
  own form**: wherever it appears, copy the `proxy_pass` line from your
  current `/api/` block, and the same for its `proxy_set_header` lines and
  the port.
- **`add_header` inside a `location` throws away every header the `server`
  block set.** That is why the example puts the security headers into two
  include files and includes them in every location that sets any
  `add_header` of its own. If you add a location later that sets
  `Cache-Control`, include the two files there as well, or its responses
  lose the security headers.
- Keep your own `ssl_*` lines, `server_name`, `root` and port-80 redirect
  block. Remove the `add_header` lines you already have at the top of the
  `server` block (they are in the include files now; leaving both sends
  every header twice). If your current config has an HSTS line, keep it
  as it is in the first file below.
- Look for existing gzip lines first: `grep -rn gzip /etc/nginx/nginx.conf
  /etc/nginx/conf.d/`. Debian and Ubuntu ship `gzip on;`. A second `gzip on;`
  makes `nginx -t` fail with "directive is duplicate": then delete that
  line from the file below and add the missing ones to the existing block.
- Start the Content-Security-Policy as `Content-Security-Policy-Report-Only`
  (section 8) if you have not already turned it on.

**File 1: `/etc/nginx/snippets/webposting-headers.conf`**

```nginx
add_header Strict-Transport-Security "max-age=31536000" always;   # keep your existing value
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header X-Frame-Options "DENY" always;
```

**File 2: `/etc/nginx/snippets/webposting-csp.conf`** (the page policy from
section 8; `/uploads/` has its own, stricter one below). Add the Turnstile
origins described in section 8 only if you use it.

```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; media-src 'self'; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://api.github.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
```

**File 3: `/etc/nginx/conf.d/webposting-http.conf`** (`http` level: compression,
the SEO cache, the crawler map; `conf.d` is already included by `nginx.conf`):

```nginx
gzip on;
gzip_vary on;
gzip_comp_level 5;
gzip_min_length 1024;
gzip_proxied any;
gzip_types text/plain text/css application/javascript application/json application/xml
           application/atom+xml image/svg+xml application/manifest+json;

# Micro-cache for the public SEO endpoints: a crawler burst becomes one
# backend hit per URL per 5 minutes. nginx creates the directory.
proxy_cache_path /var/cache/nginx/webposting levels=1:2 keys_zone=seo:5m max_size=64m
                 inactive=30m use_temp_path=off;

# Crawlers get plain HTML pages (SEO.md, part b).
map $http_user_agent $is_bot {
    default 0;
    ~*(Googlebot|bingbot|DuckDuckBot|GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-User|PerplexityBot|Applebot|facebookexternalhit|Twitterbot|Slackbot|Discordbot|LinkedInBot) 1;
}
```

If your config already has the `map $http_user_agent $is_bot` block from
SEO.md, leave it where it is and drop it from this file.

**The server block** (HTTPS; your port-80 redirect block stays as is):

```nginx
server {
    listen 443 ssl;
    http2 on;                    # nginx 1.25.1 or newer. Older: write "listen 443 ssl http2;" instead
    server_name webpost.ing;

    # ... your existing ssl_certificate, ssl_certificate_key and other ssl_* lines ...
    root /srv/webposting/html;   # WEB_ROOT
    server_tokens off;

    # Pages: any route that is not a file falls back to the app shell.
    # The shell is re-checked on every visit, so a release shows up at once.
    location / {
        include /etc/nginx/snippets/webposting-headers.conf;
        include /etc/nginx/snippets/webposting-csp.conf;
        add_header Cache-Control "no-cache";
        try_files $uri $uri/ /index.html;
    }

    # Build output: Vite puts a content hash in every file name, so these
    # never change under the same URL. A missing one is a 404, never the shell.
    location /assets/ {
        include /etc/nginx/snippets/webposting-headers.conf;
        include /etc/nginx/snippets/webposting-csp.conf;
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
        access_log off;
    }

    # Files that must update at once (section 7).
    location = /index.html {
        include /etc/nginx/snippets/webposting-headers.conf;
        include /etc/nginx/snippets/webposting-csp.conf;
        add_header Cache-Control "no-cache";
    }
    location = /sw.js {
        include /etc/nginx/snippets/webposting-headers.conf;
        add_header Cache-Control "no-cache";
    }
    location = /manifest.webmanifest {
        include /etc/nginx/snippets/webposting-headers.conf;
        add_header Cache-Control "no-cache";
    }

    # Fonts, icons, robots: not hashed, so only a day.
    location ~* ^/(fonts/.*|icons/.*|favicon-.*\.png|vite\.svg|robots\.txt)$ {
        include /etc/nginx/snippets/webposting-headers.conf;
        include /etc/nginx/snippets/webposting-csp.conf;
        add_header Cache-Control "public, max-age=86400";
    }

    # User uploads: names are random, a changed picture gets a new name, so
    # they never change under the same URL. Audio seeking needs range
    # requests: nginx serves them for static files; add no proxy buffering
    # and nothing that strips Range or Accept-Ranges here.
    location /uploads/ {
        alias /srv/webposting/uploads/;                # UPLOAD_DIR
        include /etc/nginx/snippets/webposting-headers.conf;
        add_header Content-Security-Policy "default-src 'none'; sandbox" always;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # Root-level SEO files (SEO.md, part a), cached like /api/seo/ below.
    location = /sitemap.xml {
        proxy_pass http://127.0.0.1:8080/api/seo/sitemap.xml;
        proxy_cache seo; proxy_cache_valid 200 5m; proxy_cache_lock on;
        proxy_set_header Cookie "";
    }
    location = /llms.txt {
        proxy_pass http://127.0.0.1:8080/api/seo/llms.txt;
        proxy_cache seo; proxy_cache_valid 200 5m; proxy_cache_lock on;
        proxy_set_header Cookie "";
    }

    # Public SEO endpoints. The app already says "public, max-age=300";
    # here nginx keeps the answer for the same five minutes. Public content,
    # so the session cookie is dropped and never part of the cache.
    location /api/seo/ {
        proxy_pass http://127.0.0.1:8080;              # YOUR form, as for /api/ below
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Cookie "";
        proxy_cache seo;
        proxy_cache_key "$scheme$host$request_uri";
        proxy_cache_valid 200 5m;
        proxy_cache_valid 404 1m;
        proxy_cache_lock on;                           # one backend fetch for a rush of requests
        proxy_cache_use_stale error timeout updating http_500 http_502 http_503;
        add_header X-Cache-Status $upstream_cache_status;
    }

    # The API. Never cached: many answers depend on who is signed in.
    # Replace the proxy_pass and proxy_set_header lines with the ones from
    # your current /api/ block if they differ.
    location /api/ {
        proxy_pass http://127.0.0.1:8080;              # YOUR form
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50m;                      # keep >= UPLOAD_MAX_SIZE (avatars 25 MB, audio 20 MB)
    }

    # Plain HTML for crawlers and link previews (SEO.md, part b). It must be
    # placed so that it wins over "location /" for /{username} and
    # /{username}/{slug}; the regex form does. Add any route of yours that is
    # not in the list.
    location ~ ^/(?!(?:api|uploads|assets|fonts|editor|settings|messages|inbox|routes|static|public|admin|login|signup|search)(?:/|$))[^/]+(?:/[^/]+)?/?$ {
        include /etc/nginx/snippets/webposting-headers.conf;
        include /etc/nginx/snippets/webposting-csp.conf;
        add_header Cache-Control "no-cache";
        if ($is_bot) { rewrite ^ /bot-page last; }
        try_files $uri /index.html;
    }
    location = /bot-page {
        internal;
        proxy_pass http://127.0.0.1:8080/api/seo/page?path=$request_uri;   # as in SEO.md: adjust host/port only
        proxy_set_header Cookie "";
        proxy_cache seo;
        proxy_cache_key "$scheme$host$request_uri";
        proxy_cache_valid 200 5m;
        proxy_cache_valid 404 1m;
        proxy_cache_lock on;
    }
}
```

Test and reload:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Then check (replace the file name with a real one from
`ls $WEB_ROOT/assets`):

```bash
curl -sI https://webpost.ing/assets/<file>.js | grep -iE "cache-control|content-encoding"   # immutable, gzip
curl -sI https://webpost.ing/ | grep -iE "cache-control|x-content-type|strict-transport"     # no-cache + headers
curl -sI https://webpost.ing/sw.js | grep -i cache-control                                   # no-cache
curl -sI https://webpost.ing/uploads/<some-file> | grep -iE "cache-control|content-security|accept-ranges"
curl -sI "https://webpost.ing/api/seo/sitemap.xml"; curl -sI "https://webpost.ing/api/seo/sitemap.xml" | grep -i x-cache-status   # MISS then HIT
curl -s -A Googlebot https://webpost.ing/<user>/<post> | head -5                             # crawler HTML
curl -s -H "Accept-Encoding: gzip" -o /dev/null -w "%{size_download}\n" https://webpost.ing/api/seo/sitemap.xml   # small; compare without the header
```

Then sign in in a browser and play a post with audio, dragging the
playhead (range requests), and hard-refresh once. If something misbehaves,
put the previous nginx files back and reload; no release is involved.

Do not add `proxy_cache` to `/api/` in general: only `/api/seo/` and the
cookie-less crawler page are safe to share between visitors.

### What happens without you

On the next release (JAR and website swapped, service restarted): Tomcat
runs with 40 threads and a queue of 50, the database pool is 8 (set
`DB_POOL_SIZE` in `deploy.env` to override), and the app compresses JSON and
text answers of 1 KB or more. The JVM flags, the `MemoryMax` limit, swap and
the nginx files do **not** arrive by themselves; sections 9.1 to 9.4 are the
whole list.
