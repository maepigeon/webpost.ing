# Scaling webpost.ing (and webpaint.ing): a staged plan, 2026-10-03

Mae: "research how to make this scalable too. make considerations on a
scalable architecture for my application".

This is a plan tied to measured triggers, not an ideal architecture. Nothing
here was run or measured: the capacity numbers are estimates from the source
code and are marked as such. Prices were looked up on 2026-10-03 (the Droplet
table on digitalocean.com; the rest from DigitalOcean's docs and third-party
summaries) and every price is **to-recheck** before buying. The live server's
state (nginx, swap, PostgreSQL settings, whether DEPLOYMENT.md 9.1 to 9.4 were
applied) is unknown to this document.

Related: [performance-review-2026-10-03.md](performance-review-2026-10-03.md)
(what costs what today), [design-list-payloads.md](design-list-payloads.md)
(the V020 fix this plan assumes), [DEPLOYMENT.md](DEPLOYMENT.md),
[webpaint-plan.md](webpaint-plan.md). `guide/webpaint-architecture.md` did not
exist when this was written; where it later disagrees about webpaint.ing's
design, it wins, and section 8 here is only the scaling view.

## The short version

- **One box is right for now and for a long while.** The same droplet resized
  to 4 GB / 2 vCPU ($24) and later 8 GB / 4 vCPU ($48) carries this site into
  the tens of thousands of members. Adding machines is for availability
  (deploys without an outage) and for isolating media and realtime, not for
  raw capacity.
- **Ceiling today (estimate, to be measured):** about 100 to 150 people
  actively clicking at the same moment, roughly 40 requests a second
  sustained, low thousands of daily active people; about 700 to 2,000 posting
  members before the 50 GB disk is the problem.
- **What breaks first:** (1) the Java heap, from whole post bodies in list
  responses and large saves; (2) the single CPU core, from body search,
  image uploads and sign-ins; (3) the disk, from uploads plus database plus
  backups that are never pruned.
- **The real risk today is not load, it is loss.** There is no scheduled
  backup, no copy off the server, and no restore has ever been tested. That
  comes before everything else in this document.
- **Cheap preparation worth doing now** (section 7): scheduled off-box
  backups with a restore test; sessions in the database (deploys stop signing
  everyone out, and webpaint.ing's shared accounts need it); a lock around
  start-up migrations and pruning of release backups; a storage interface in
  front of the upload directory; a small job table for mail before mail is
  switched on; rate limits behind an interface.
- **Do not build yet:** Kubernetes, microservices, Redis, a message broker, a
  search engine, read replicas, server-side video transcoding, WebSocket push
  for notifications. PostgreSQL does sessions, queues, locks and search well
  enough to the size where each of those earns its upkeep.

---

## 1. Where the ceiling is now

### 1.1 What the box is

One DigitalOcean Basic droplet: 1 vCPU, 2 GB RAM, 50 GB SSD, 2,000 GiB
outbound transfer a month, $12. On it: nginx, one JVM (heap capped at 640 MB,
40 Tomcat threads, 8 database connections: `server-start.sh`,
`application.properties`), PostgreSQL over a Unix socket, and the upload
directory.

Memory budget (estimate): JVM resident 0.9 to 1.1 GB (systemd `MemoryMax`
1200M once DEPLOYMENT.md 9.2 is applied), PostgreSQL 350 to 400 MB, nginx and
the OS 150 MB, leaving 300 to 500 MB of page cache. There is **no room for a
second process of any size**: a webpaint.ing realtime service, a second JVM
for rolling deploys, or a build. That alone forces the first resize when
webpaint.ing goes multi-user.

### 1.2 Which quick wins this estimate assumes

In the repository today: JVM and thread caps, response compression, the V019
indexes, one unread poll per 45 s that pauses in hidden tabs. Designed but not
built: V020 (`card_preview`, `search_text`, one-statement quota, profile
summary). **Until V020 lands, the ceiling is set by memory, not by the numbers
below**: one profile page of a heavy poster can ask the heap for hundreds of
megabytes (performance review 1.A).

### 1.3 Capacity estimate (after V020; estimate, plus or minus a factor of two)

Costs per action on one core, JVM plus PostgreSQL, estimated from the code:

| Action | CPU time | Why |
|---|---|---|
| Unread poll | about 2 ms | session check in memory, three indexed counts (`MeController`) |
| Post page | 25 to 40 ms | about 8 requests |
| Profile page | 40 to 60 ms today, about 15 ms with the profile summary | 14 requests today |
| Save or autosave of a typical post | about 100 ms | body parsed, cleaned, re-serialised; about 35 queries today, about 10 after V020 |
| Sign-in | 60 to 100 ms (bcrypt cost 10); 250 to 400 ms if raised to cost 12 | deliberate |
| Photo upload, 12 to 16 megapixels | 1.5 to 4 s | decoded twice, three resized copies written (`UploadController`, `ImageProcessingService`) |

Spending 60% of the core (the level at which response times start to climb):

- **About 100 to 150 people actively clicking at once**, plus several hundred
  open idle tabs, one save a second and one photo upload every ten seconds.
- **About 40 requests a second sustained** of mixed API traffic; short bursts
  of 100.
- With the usual 5 to 10% of daily visitors online at the peak, that is
  **1,000 to 3,000 daily active people**.
- **Uploads are the narrowest point.** Two decode slots, a five second wait,
  then "Busy" (503). More than about four people uploading photos in the same
  few seconds will see it. One core does both slots, so each takes twice as
  long.
- **Sign-ins**: 10 to 15 a second saturate the core. After a restart everyone
  signs in again (sessions are in memory), so a deploy at a busy moment
  causes a small stampede.
- **Idle tabs are cheap**: 1,000 visible signed-in tabs are about 22 small
  requests a second, under 5% of the core.

How to replace these guesses with numbers, without touching the server: run
the local build on the Mac with the production flags and one core
(`JAVA_OPTS="-Xmx640m -XX:+UseSerialGC -XX:ActiveProcessorCount=1"`), and
drive it with a load script from `tools/` (a k6 or plain Node script that
signs in N test users and replays profile view, post view, poll, save). One
afternoon; it becomes a repeatable check before each stage.

### 1.4 Storage growth per active user

The quota bounds it: everything a member stores (files, resized copies, post
bodies, stickers) counts against `role_limits.max_storage_bytes`: 50 MB for
`user`, 500 MB for `trusted` and `admin` (`V001__schema.sql`).

- A reader who never posts: under 1 MB (rows only).
- A member who posts with pictures: plan on **10 to 25 MB** (each image up to
  5 MB plus up to three resized copies; a painted grid stores each layer as a
  PNG data URL inside the post body, up to 1.5 MB per layer and 5 MB per
  post; one audio file can be 20 MB).
- Worst case: everyone at quota.

The 50 GB disk has roughly 35 GB for data after the OS, Java, swap and logs.
That is **about 700 members at full quota, 1,500 to 2,000 at the planning
figure**. A backup kept on the same disk doubles the need, and every release
adds a full database dump to `~/backups/release-*` that nothing deletes
(`tools/install-release.sh`): with a 2 GB database, twenty releases are 40 GB.

Outbound transfer is not a limit for webpost.ing (2,000 GiB is about a
million image-heavy page views a month). It becomes one with video (section 8).

### 1.5 The first three things that will break, and how to see each coming

| # | What breaks | Cause in the code | What users see | How to see it coming (cheapest tool) |
|---|---|---|---|---|
| 1 | **Java heap** | List endpoints send whole bodies until V020; a save holds several copies of a body up to 5 MB; two image decodes hold about 128 MB of pixels; a full account export builds everything in memory (`SocialRepository.buildUserExport`) | The JVM exits and restarts in seconds (`ExitOnOutOfMemoryError`); **everyone is signed out and every rate limit resets** | `systemctl show webposting.service -p NRestarts` should stay 0 between releases; DigitalOcean Monitoring alert on memory above 85% for 5 minutes; heap-after-GC in the ops numbers (work package S7) |
| 2 | **The one CPU core** | `description ILIKE '%q%'` over every published body (`PostController.java:738,756`, no rate limit); photo uploads; bcrypt; PostgreSQL shares the core | Everything slows together; uploads answer "Busy" | DigitalOcean alert on CPU above 70% for 5 minutes; p95 of nginx `$upstream_response_time` for `/api/` (snippet below); `pg_stat_statements` for the top queries |
| 3 | **The disk** | Uploads, post bodies, unpruned release backups, on-box backups, on 50 GB | Uploads and saves fail; PostgreSQL stops accepting writes at 100%; a release fails at "No space left" | DigitalOcean alert on disk above 70%; `df -h /`, `du -sh $UPLOAD_DIR ~/backups`, `SELECT pg_size_pretty(pg_database_size(current_database()))` |

Not a breakage under load but the largest exposure: **one disk, no scheduled
backup, no tested restore** (`DEPLOYMENT.md` section 6 says so itself). A
failed droplet today loses everything since the last release's dump, and all
uploads.

nginx timing, to paste once (`http` level, then use the format in the server
block). It costs nothing and is the only latency measurement needed for a long
time:

```nginx
log_format timed '$remote_addr [$time_local] "$request" $status $body_bytes_sent '
                 'rt=$request_time urt=$upstream_response_time';
access_log /var/log/nginx/webposting.access.log timed;
```

```bash
# p95 of API time in the current log, in seconds
awk -F'urt=' '$0 ~ /"(GET|POST|PUT|DELETE) \/api\// && $2 != "-" {print $2}' \
  /var/log/nginx/webposting.access.log | sort -n | awk '{a[NR]=$1} END {print a[int(NR*0.95)]}'
```

### 1.6 What blocks scaling today (each checked in the code)

| Blocker | Where | Consequence |
|---|---|---|
| Sessions in a static map | `JdbcLoginRepository.java:91` (`sessionsByToken`), read by `authorize()` on every request | One process only; lost on every restart and deploy |
| Rate limits in JVM memory | `RateLimiter` instances in `SocialController` (2), `DiscussionController`, `ReportController`, `SharedPackController`, `EmailSettingsController` (2); static `LoginRateLimiter`; `REG_BLOCK`/`REG_DAILY` in `AuthController.java:54-55`; `SendBudget` (2) in `EmailSettingsController` | With N instances every limit becomes N times looser; a restart forgives every lockout |
| Uploads on local disk | `Paths.get(uploadDir, ...)` in eight classes: `UploadController`, `AuthController` (avatars), `ProfileHeaderController`, `FontController`, `AdminController`, `AccountController`, `StorageAccountService`, `ImageProcessingService.writeVariants`; served by `WebConfig` or nginx `alias` | A second box cannot see the files; the disk is the only copy |
| Per-user upload lock is a JVM lock | `UploadController.java:68-73` (`USER_LOCKS`) | Two instances can both pass one quota check |
| Images decoded in the request thread, twice | `UploadController` (`decodesCleanly`, then `writeVariants`) | Upload CPU and heap compete with page views; halving it is cheap (decode once) |
| Post bodies up to 5 MB, rewritten whole on each save | `PostController.java:430`; paint layers are PNG data URLs inside the JSON (`PostContentValidator.MAX_PAINT_CHARS`) | PostgreSQL already stores large values out of line, so the table itself is fine; the cost is write volume, dump size, and anything that reads bodies in bulk |
| Publish fans out mail in the request | `EmailNotificationService.notifyFollowersOfPost` (one query or more per follower), called from `PostController.java:496,554,594` | Publishing gets slower with each follower; fine at hundreds, not at thousands |
| Mail queue is in memory | `EmailService.send` is `@Async` on Spring's default executor (unbounded, in memory) | Mail queued at the moment of a restart is silently lost |
| Scheduled work runs in every instance | `EmailNotificationService.flushDigests` (`@Scheduled`, hourly), and the V020 preview sweep | Two instances would both send each digest (the sweep is written to be harmless twice; the digest is not) |
| Migrations run at start-up by each instance, with no lock | `DatabaseMigrationService` (`@PostConstruct`), `DatabaseMigrator` | Two instances starting together both try to apply the same script |
| Polling, not push | `useUnreadCounts.js` (45 s), `MessagesPage.jsx` (10 s) | Fine and stateless well past stage 2; see 4.6 |
| No CDN | nginx on the droplet serves every byte | Fine until video; see stage 1 |
| One database, no replica, no tested restore | `tools/backup.sh` exists, nothing schedules it | See stage 0 |
| A deploy restarts the only instance | `tools/install-release.sh` | 10 to 40 s of errors, everyone signed out |
| A deploy removes the old build's files | `install-release.sh` swaps the whole web root; nothing in the client handles a failed lazy import | A tab opened before the deploy fails when it lazy-loads a page chunk that no longer exists |
| Canvas reads uploaded images without CORS | no `crossOrigin` anywhere in `client/src` (`wallpaper.js`, grid photo layers) | Uploads must stay same-origin (`/uploads/...`), or canvases become tainted and `toDataURL` throws; this shapes the CDN choice in stage 1 |

---

## 2. Stage 0: stay on one box, well (now)

**Trigger:** none; this is the current stage. **Cost:** $12 now; $15 to $21 a
month with backups; $29 to $36 after the first resize. **Work:** 4 to 6 days.

### 2.1 What to finish, in order

1. **Backups with a restore test.** (a) Turn on DigitalOcean's droplet backups
   (weekly is 20% of the droplet price, daily 30%: $2.40 or $3.60 a month).
   This is a whole-disk image and the cheapest protection against losing the
   machine. (b) A nightly `tools/backup.sh` from a systemd timer, with the
   database dump and an incremental copy of uploads sent **off the server**
   to an object storage bucket (Backblaze B2 at about $0.007 per GB a month,
   or a DigitalOcean Space at $5 for 250 GiB), keeping 7 daily and 4 weekly.
   The server holds a key that can only write to that bucket. (c) A monthly
   restore test on the Mac: download the latest pair, restore into a scratch
   database, start the local build against it, run `tools/smoke/`. A backup
   that has never been restored is a hope, not a backup. (d) A heartbeat so a
   backup that stops running is noticed (healthchecks.io, free for 20 checks).
   Work package S6.
2. **Finish the server side of the performance work**: DEPLOYMENT.md 9.1 to
   9.4 (JVM flags, `MemoryMax`, swap, nginx caching and gzip). Then V020.
3. **Monitoring and alerts**, all free: DigitalOcean Monitoring alert policies
   (CPU above 70% for 5 min, memory above 85%, disk above 70%), an outside
   uptime check on `https://webpost.ing/api/health` every 5 minutes with
   email alerts (UptimeRobot's free plan, or DigitalOcean Uptime; check the
   terms), the nginx timing log above, `log_min_duration_statement = 250ms`
   and `pg_stat_statements` in PostgreSQL. No dashboards, no agents beyond
   DigitalOcean's own.
4. **Prune release backups** (keep the last five) in `install-release.sh`.
   Work package S4.
5. **Sessions in the database**, so a deploy or a crash no longer signs
   everyone out. Work package S1. This is the single change that makes
   restarts cheap, and restarts are how one box is operated.
6. **A maintenance page and a patient client.** nginx keeps serving the app
   shell while the JAR restarts, so the work is: `/api/` answers 503 with
   `Retry-After` from nginx when the backend is down, the client shows one
   quiet "Updating, back in a moment" line and retries reads, and a static
   `maintenance.html` exists for the rare case where nginx itself must say
   so. Also catch a failed lazy import and reload once. Work package S9.
7. **PostgreSQL settings for 2 GB** (Mae, once): `shared_buffers = 256MB`,
   `work_mem = 4MB`, `max_connections = 30`, `effective_cache_size = 768MB`.
8. **Stop body search from scanning everything**: V020's `search_text` with
   its trigram index, and a per-user and per-address rate limit on
   `/search/posts` (there is none today).

### 2.2 Vertical resize points

A resize keeps the address and the disk. The droplet is powered off for a few
minutes. Choosing "CPU and RAM only" keeps it reversible; growing the disk is
permanent (to-recheck).

| Size | Price | Move here when (any one, measured over a week) |
|---|---|---|
| 2 GB / 1 vCPU / 50 GB | $12 | now |
| 4 GB / 2 vCPU / 80 GB | $24 | CPU above 60% in the busiest hour on three days; or p95 API time above 500 ms in the busiest hour; or swap in steady use above 200 MB; or more than one out-of-memory restart a month after V020; or **webpaint.ing gets its realtime service**; or two JVMs are wanted for rolling deploys |
| 8 GB / 4 vCPU / 160 GB | $48 | the same signals again on the 4 GB box, if stage 1 has not already moved the database or the files away |

After a resize raise the limits with it: on 4 GB, `-Xmx1200m`, `MemoryMax=2G`,
`TOMCAT_THREADS=80`, `DB_POOL_SIZE=12`, `shared_buffers=768MB`; give the image
decoder three slots.

**Risks at stage 0:** one disk and one machine (accepted, mitigated by 2.1
step 1); a resize is a few minutes of downtime; a member can still hurt the
box on purpose with maximum-size posts and uploads until the limits above are
all in place.

**Mae does:** turn on droplet backups and alert policies (DigitalOcean
account), create the backup bucket and its write-only key, sign up for the
uptime check and heartbeat, run the backup timer installer and the PostgreSQL
settings with sudo, paste the nginx log format, decide each resize.

---

## 3. Stage 1: two boxes (database and files move out)

**Triggers** (either half can go first; they are independent):

- **Files to object storage** when the disk passes 60%, or `UPLOAD_DIR`
  passes 20 GB, or before any video feature ships.
- **Database to its own machine or to managed PostgreSQL** when the database
  passes 5 GB (the dump before each release then takes minutes and competes
  with visitors), or PostgreSQL and the JVM are short of memory on the 4 GB
  box, or losing a day of writes has become unacceptable: in practice, when
  more than about 500 members or 100 weekly posters are people Mae does not
  know. Managed PostgreSQL brings daily backups and point-in-time recovery
  without her running anything.

**Monthly cost:** droplet $24 + Space $5 + managed PostgreSQL $15 (1 GiB,
single node) or $30 (2 GiB): **$44 to $59**. With a standby node for
automatic failover add the node price again: **$90 to $120**. A second
self-managed droplet for PostgreSQL is cheaper ($12 to $24) and is not
recommended: it doubles what one person must patch, back up and restore.

**Work:** code preparation 8 to 10 days in total (it is section 7's work
packages and most of it pays off at stage 0); the cut-overs themselves 1 to 2
days for files and 1 day for the database.

### 3.1 What must change in the code first, so this is configuration later

1. **A storage interface in front of the upload directory** (S2). One
   `FileStore` with `put(key, bytes, contentType)`, `delete(key)`,
   `size(key)`, `exists(key)`; `LocalFileStore` is today's behaviour and the
   default. The eight classes in 1.6 stop calling `Paths.get(uploadDir, ...)`.
   `ImageProcessingService.writeVariants` returns bytes instead of writing
   files. Keys are today's names (`<uuid>.png`, `audio/...`, `headers/...`,
   `avatars/...`), so nothing stored changes.
   **The stored URL stays `/uploads/<key>` forever.** Post bodies hold it, the
   validator enforces it (`PostContentValidator.UPLOAD`), and canvases need
   same-origin images. So at cut-over the bucket is reached *through* nginx:

   ```nginx
   # sketch, untested: local file first, then the bucket, cached on disk
   location /uploads/ {
       root /srv/webposting;                 # so /uploads/x maps to /srv/webposting/uploads/x
       try_files $uri @media;
       # ... the headers from DEPLOYMENT.md 9.4 ...
   }
   location @media {
       proxy_pass https://BUCKET.REGION.cdn.digitaloceanspaces.com;
       proxy_set_header Host BUCKET.REGION.cdn.digitaloceanspaces.com;
       proxy_cache media;  proxy_cache_valid 200 30d;  proxy_cache_lock on;
       proxy_force_ranges on;                # audio seeking
       # ... the same headers ...
   }
   ```

   No client change, no CSP change, no CORS, and old files keep working during
   the copy because nginx tries the local disk first. Serving straight from a
   media subdomain (`VITE_IMAGES_BASE_URL` already exists in `client/src/config.js`)
   is a later optimisation and needs `crossOrigin` on every image a canvas
   reads plus CORS on the bucket.
   The S3 client is a new server dependency (the AWS SDK's S3 module with the
   plain URL-connection HTTP client): approve it at cut-over, not now.
2. **Sessions in the database** behind `LoginRepository` (S1). PostgreSQL,
   not Redis: one less thing to run, and one primary-key lookup per request
   costs less than the three counts each poll already runs.
3. **Rate limits behind an interface** with the in-memory store as default
   (S3). A PostgreSQL store (one upsert into an unlogged table per check) is
   written when a second instance exists, not before.
4. **Background jobs in a table** (S5): `jobs(id, kind, payload jsonb,
   run_after, attempts, locked_until, last_error)`, claimed with
   `SELECT ... FOR UPDATE SKIP LOCKED`. First users: outgoing mail and the
   follower mail fan-out. The digest flush claims its rows in one statement
   (`DELETE ... RETURNING`) so two instances cannot both send.
5. **Migrations run once** (S4): an advisory lock around the start-up
   migration now; later a `--migrate-only` run by the release before any
   instance restarts, with instances started in "verify, do not apply" mode.
6. **Database settings for a remote server**: the URL needs TLS
   (`?sslmode=${DB_SSLMODE:prefer}`, and `verify-full` with the provider's CA
   in production), a password returns to `deploy.env` (the passwordless socket
   only works on the same machine), and `ProductionConfigCheck` already
   accepts that. With managed PostgreSQL's connection pooler in transaction
   mode, session-level advisory locks do not work: point migrations at the
   direct port.

### 3.2 Things that change character at stage 1

- **Every query gains a network hop** (roughly 0.5 to 1 ms inside a private
  network, against microseconds on the socket). A save with 35 queries or a
  profile with 14 requests feels it; the V020 work that cuts those counts is
  therefore a prerequisite, not an optimisation.
- **Backups split in two**: the database is the provider's job (still test a
  restore every quarter by forking the cluster); uploads live in the bucket,
  which needs versioning or a second copy to protect against a bad delete.
- **The per-request quota check reads file sizes from the `uploads` table**,
  never from the store (it already does, except `recordOldHeader`).

**Cut-over, files:** deploy with `LocalFileStore` (no change); copy the
directory to the bucket with `rclone` at low priority; switch the store to the
bucket; add the nginx fallback; after a week of clean logs stop the local
fallback and reclaim the disk. No downtime.
**Cut-over, database:** announce, stop the service, `pg_dump`, restore into the
managed cluster, point `deploy.env` at it, start, smoke test. 10 to 30 minutes
of downtime at this size. Keep the old database untouched for a week.

**Risks:** a wrong bucket permission exposes or loses files (private bucket,
public read only through the CDN endpoint, versioning on); the database
becomes reachable over a network (private network only, trusted sources set
to the droplet); two bills and two consoles.

**Mae does:** create the Space and its key, create the database cluster in the
same region and private network, set trusted sources, put the values into
`deploy.env`, paste the nginx block, run the copy, choose the maintenance
window.

---

## 4. Stage 2: several app instances

**Triggers:** deploys hurt (more than about 100 people online when Mae wants to
release, or releases more than weekly with visible errors); or the app box at
8 GB / 4 vCPU reaches 60% CPU in the busiest hour; or webpaint.ing's realtime
service must survive webpost.ing restarts. Capacity alone rarely forces this:
one 4-core JVM serves many times today's ceiling.

**Monthly cost:** two app droplets ($24 to $48), load balancer $12, managed
PostgreSQL 2 GiB with standby $60, Space $5, a small realtime droplet $12:
**about $115 to $190**. **Work:** 5 to 8 days once stage 1's preparation is
done.

### 4.1 Do it on one box first (stage 1.5, nearly free)

nginx is already a load balancer. On the 4 GB droplet run **two copies of the
JAR** on ports 8080 and 8081 behind an nginx `upstream`, and have the install
script restart one, wait for `/api/health`, then restart the other. That gives
deploys without an outage and proves statelessness, with no second machine and
no new bill. Everything in the checklist below must be true for it; if it is,
moving one copy to a second droplet later is a configuration change.

```nginx
upstream webposting_app {
    server 127.0.0.1:8080 max_fails=2 fail_timeout=5s;
    server 127.0.0.1:8081 max_fails=2 fail_timeout=5s;
    keepalive 16;
}
# in location /api/:  proxy_pass http://webposting_app;  proxy_next_upstream error timeout http_502 http_503;
```

### 4.2 Statelessness checklist (current state from the code)

| # | Must be true | Today | Fixed by |
|---|---|---|---|
| 1 | Any instance accepts any session | static map | S1 |
| 2 | Limits hold across instances | per JVM | S3, then a PostgreSQL store |
| 3 | Files reachable from every instance | local disk | S2, then the bucket |
| 4 | Quota check and upload row are atomic across instances | JVM lock (`USER_LOCKS`) | `pg_advisory_xact_lock(user id)` in the same transaction (part of S2) |
| 5 | Scheduled work runs once | every instance | S5 (claim in SQL) |
| 6 | Queued work survives a restart | in memory | S5 |
| 7 | Migrations applied once, before instances start | each instance, no lock | S4 |
| 8 | Old and new versions can run side by side for a minute | usually true ("the previous JAR ignores what it does not know") | rule in section 6: expand, deploy, contract in a later release |
| 9 | In-flight requests finish on shutdown | not set | `server.shutdown=graceful`, `spring.lifecycle.timeout-per-shutdown-phase=20s` (S4) |
| 10 | Old build files stay available after a deploy | web root swapped whole | keep the previous releases' `/assets/` for 14 days (S4) and reload on a failed import (S9) |
| 11 | Client address is right behind the balancer | `forward-headers-strategy=native` trusts private addresses | keep the balancer on the private network; if Cloudflare is ever put in front, nginx must take the address from `CF-Connecting-IP` for Cloudflare's ranges only, or every visitor shares a few addresses and the limits lock everyone out |
| 12 | Per-instance caches are only speed-ups | none on the server today | rule in section 6 |
| 13 | The image decode limit is per instance | yes, by design (it protects that JVM's heap) | nothing |

### 4.3 Sticky sessions or shared sessions

**Shared, in the database.** Sticky routing only hides state that should not
exist, and it breaks on every restart. The one thing that is pinned on purpose
is a webpaint.ing drawing room (4.5), and it is pinned by room, not by user.

### 4.4 Zero-downtime deploys

Rolling restart of two or more instances (4.1), plus checklist rows 7 to 10.
The release order becomes: back up, run migrations once, restart instance A,
health check, restart instance B, swap the web root while keeping old assets.
A migration that removes or renames something ships one release after the
code that stopped using it.

### 4.5 WebSocket rooms for webpaint.ing

Use **a small dedicated realtime process, with each room living on exactly one
process**. Not inside the webpost.ing JVM (its restarts, heap and deploys would
end drawing sessions), and not a pub/sub mesh where any instance serves any
room (ordering then needs a single sequencer anyway).

- The room process is the only writer of that room's ordered event log and
  assigns sequence numbers. It relays and logs; it never rasterises.
- One process until it is full. Then several, with a `rooms` table (room,
  instance, heartbeat) and nginx hashing on the room id
  (`hash $arg_room consistent;`), or the join call returning the host to
  connect to. A room that loses its process is re-homed and rebuilt from the
  last snapshot plus the log; clients reconnect with their last sequence
  number.
- Sign-in at connect: a short-lived ticket issued over HTTPS by the account
  server, checked once at the WebSocket handshake. The room process does not
  need the session table on every message.
- It gets its own systemd unit and memory limit (`MemoryMax=300M` to start).

### 4.6 Push instead of polling

Not at this stage. Polling at 45 s is stateless and costs about 2 ms per tab
per poll; 5,000 open tabs are about 110 small requests a second, which is when
push starts to pay. If it is ever wanted, the webpaint.ing realtime process is
the place to carry "you have a notification" pings for both sites, with the
poll kept as the fallback. Do not add server-sent events to the main JVM
before then.

### 4.7 Read replicas

**Trigger:** the primary above 60% CPU in the busiest hour with reads
dominating in `pg_stat_statements`, after the indexes and V020. A managed
read-only node costs the same as a primary node. The app gets a second
`JdbcTemplate` used only by queries that tolerate a second of lag and are not
read-after-write: Discover, search, sitemap, crawler pages, hashtag pages.
Never the page a member sees right after saving.

### 4.8 Search out of `ILIKE`

1. Now (V020): `search_text` with a trigram index, and a rate limit.
2. Stage 2: PostgreSQL full-text search (a generated `tsvector` column with a
   GIN index, `websearch_to_tsquery`, `ts_rank`), trigram kept for names and
   typos. Still one database.
3. Stage 3 only: a separate search service fed from the job table, when there
   are around a million posts or members ask for typo tolerance and filters.

**Risks at stage 2:** bugs that only appear with two instances (limits, double
sends); more places to look when something is wrong; a load balancer that
terminates TLS changes where certificates live (DigitalOcean's managed
certificates need the domain's DNS on DigitalOcean: to-recheck; keeping nginx
as the balancer avoids the question).

**Mae does:** resize for stage 1.5; later create the second droplet and the
balancer, move or keep certificates, and add a DNS name for the realtime
service.

---

## 5. Stage 3: only if it takes off

**Triggers:** tens of thousands of daily active people; media egress above 1
to 2 TB a month; jobs regularly waiting more than five minutes; uploads using
more than 30% of app CPU; search p95 above one second on full-text search.
**Cost:** from about $300 a month, mostly storage and transfer. **Work:**
weeks per item; do one at a time, each when its own trigger fires.

- **Media pipeline:** browsers upload straight to the bucket with a presigned
  URL (size limited by the signature), the app only records the row; resized
  copies made by a worker process from the job table, or on request by an
  image-resizing proxy in front of the bucket; uploads served from a separate
  cookie-less domain with CORS (and `crossOrigin` in the client).
- **Paint layers out of post bodies:** each layer stored as a PNG in the file
  store under its content hash and referenced from the grid JSON. Bodies
  shrink from megabytes to kilobytes; saves, dumps and replication get
  cheap. This is a grid format version (see GRID-FORMAT.md), so it needs its
  own design.
- **Workers as a separate process** from the same JAR (`--worker`), so mail,
  resizing and exports stop sharing the web heap.
- **A real queue or a search service** only when the PostgreSQL versions are
  measurably the bottleneck.
- **Splitting services:** accounts, webpost.ing and webpaint.ing content are
  already separate by data. Split a process out only when it needs different
  scaling or a different release rhythm; realtime is the first and probably
  the only one for a long time.

**What not to build before then, and why**

| Not yet | Why |
|---|---|
| Kubernetes, container orchestration | Two JARs and systemd units do not need a scheduler; one person would spend more time on the platform than on the site |
| Microservices | Every split adds a deploy, a failure mode and a network call; nothing here scales differently enough yet |
| Redis | Sessions, limits, locks and queues fit in PostgreSQL at this size; Redis would be a second stateful system to back up and secure |
| Kafka, RabbitMQ | The job table handles thousands of jobs a minute |
| Elasticsearch or similar | PostgreSQL trigram and full-text search cover it to about a million posts |
| Read replicas, sharding, multi-region | No read pressure yet; replicas add lag bugs |
| Server-side video transcoding | CPU-hungry, already ruled out for the droplet; encode in the browser |
| WebSocket push for webpost.ing | Polling is cheaper to run and already paused in hidden tabs |
| A cache layer (Redis, Varnish) in front of the API | Most answers depend on who is asking; nginx's micro-cache already covers the public SEO pages |

---

## 6. Design rules for new code, from today

One page an implementer can follow. Each rule exists so that nothing new makes
the stages above harder.

1. **No new state in JVM memory that must be right.** No new `static` maps,
   counters, caches or locks for anything that matters across requests. If it
   must survive a restart or be seen by a second instance, it lives in
   PostgreSQL. A per-instance cache is allowed only as a speed-up with a short
   lifetime, and the correctness check still happens in SQL.
2. **No direct file access.** New code never calls `Files`, `Paths` or
   `new File` for user content. It goes through the storage interface (once S2
   lands; until then, add to the existing upload classes and do not invent a
   new directory).
3. **Stored references are keys or relative paths** (`/uploads/<key>`), never
   absolute URLs and never a host name.
4. **No binary data inside JSON documents or table rows** in new features.
   Store a file, reference its key. (Existing paint layers are the exception
   to retire, not the pattern to copy.)
5. **List endpoints never return a heavy column.** Every list has a `LIMIT`
   with a server-side maximum, uses a cursor (`before` id or date) rather than
   a growing `OFFSET`, and returns a projection made for the card.
6. **Every new query has an index that serves it**, added in the same
   migration, and a comment naming the query.
7. **Work that is slow, sends something, or can be retried goes in a job row**
   (once S5 lands), not in the request and not in a bare `@Async`.
8. **Anything on a timer must be safe on two instances at once**: claim rows
   in one SQL statement, or take an advisory lock, or be harmless when run
   twice (the V020 sweep's `WHERE preview_version < ?` is the model).
9. **Throttle in SQL when the throttle must hold everywhere** (the heartbeat
   in `MeController` is the model: `UPDATE ... WHERE last_active_at < NOW() -
   INTERVAL '1 minute'`). Use the database clock for anything compared across
   machines.
10. **Every write endpoint has a limit** (rate, size, count), through the
    `RateLimiter` class, keyed by user id, and by client address for anonymous
    routes.
11. **Migrations are additive and backward compatible.** The previous JAR must
    run against the new schema. Removing or renaming waits one release.
    Backfills never run inside a migration; they run as a resumable sweep.
12. **Bound memory per request.** Never load "all of a user's X". Read at most
    one large body at a time. Stream exports.
13. **No new long-lived connections to the main JVM** (server-sent events,
    WebSockets, long polls). Poll, and pause when the tab is hidden.
14. **The client survives a restart.** New data-loading code handles 502, 503
    and a network error as "try again shortly", not as a crash.
15. **Configuration through environment variables with a development default**
    (CONFIGURATION.md), so a second environment or a second instance is only
    configuration.
16. **Uploads are immutable.** A changed file gets a new key; URLs can then be
    cached for a year anywhere.
17. **For webpaint.ing:** the server never decodes pixels or video, never
    holds a canvas in memory, and never proxies media bytes through the
    account server.

---

## 7. Work packages for the cheap preparation

Rules as in WORKING-HERE.md: no commits, no `vite build`, no servers, verify
with the named tests. Migration numbers: V019 is the latest in the tree and
V020 is reserved for the list payloads; take the next free number when the
package starts. Lines for the shared files `application.properties`,
`config/deploy.env.example`, `guide/CONFIGURATION.md`, `guide/MIGRATIONS.md`,
`guide/DATABASE_SCHEMA.md` and `client/src/App.jsx` are **reported by each
worker and applied by one integrator**.

**Order and timing.** `JdbcLoginRepository`, `AuthController`,
`AdminController` and `EmailSettingsController` are being edited by the
accounts-readiness worker today, and `tools/install-release.sh` by the
release-script worker: S1, S2, S4 and S5 start after those hand back. S6 and
S3 can start at once.

| # | Package | Worker | Days | Do it now? |
|---|---|---|---|---|
| S6 | Scheduled off-box backups, restore test, monitoring notes | implementer | 1 to 1.5 | **Yes, first.** It is the only one that protects data |
| S1 | Sessions in the database | senior-engineer | 1.5 to 2 | **Yes.** Ends sign-out on every deploy; webpaint.ing's shared accounts need it |
| S4 | Migration lock, graceful shutdown, release backups pruned, old assets kept | implementer | 1 | **Yes.** Small, and the pruning prevents a full disk |
| S2 | Storage interface in front of the upload directory | senior-engineer | 2 to 3 | **Yes, before the next upload feature** and before webpaint.ing adds a second kind of file |
| S5 | Job table; mail and digests through it | implementer | 2 | **Yes, before mail is switched on in production** |
| S3 | Rate limits behind an interface | implementer | 1 | Yes, low urgency |
| S9 | Client rides out a restart; maintenance page | implementer + design-guardian | 1 | Yes, with the next client batch |
| S7 | Ops numbers for the admin | implementer | 0.5 | Optional |

### S6. Backups, restore test, monitoring notes

- **Files:** `tools/backup.sh` (add: optional upload of the pair to a bucket
  named in `deploy.env`, retention of 7 daily and 4 weekly, a heartbeat URL
  ping on success; uploads copied incrementally rather than re-archived whole
  each night), new `tools/server/install-backup-timer.sh` (systemd service and
  timer, run by Mae with sudo, low CPU and I/O priority), new
  `tools/restore-test.sh` (on the Mac: fetch the latest pair, restore into
  `webposting_restore_test`, print row counts for users, posts and uploads,
  check that a sample of upload rows have files), `guide/DEPLOYMENT.md`
  section 6 (rewrite: what runs, how to restore, the monthly test, the alert
  policies and the nginx timing log from section 1.5 here).
- **Design notes:** the off-box copy tool is a download Mae approves (`rclone`
  or the `aws` CLI); the bucket key is write-only and lives only in
  `deploy.env`; a nightly dump is one `pg_dump` at low priority, which the
  "never run extra processes on the server" rule allows as a scheduled,
  bounded job (say so in the doc). Nothing in this package touches the live
  server; Mae runs the installer.
- **Tests:** `bash -n` on each script; a local run of `backup.sh` then
  `restore-test.sh` against the development database, with the output pasted
  in the report.

### S1. Sessions in the database

- **Files:** new migration `V0NN__sessions.sql`; new
  `posts/repository/SessionStore.java` (interface: `put`, `find`, `remove`,
  `removeAllFor(username)`, `removeOthers(username, keepToken)`,
  `countFor(username)`, `purgeExpired`), `InMemorySessionStore.java` (today's
  behaviour, moved), `JdbcSessionStore.java`; `JdbcLoginRepository.java`
  (delegates; the static helpers `storeSession`, `sessionCountFor`,
  `hasSession`, `clearSessions` keep working for tests);
  `server/src/test/.../OpenSignupHardeningTest.java` only if it must change;
  new `SessionStoreTest`. `LoginRepository` (the interface the controllers
  use) does not change.
- **Design:** table `sessions(token_hash bytea primary key, user_id int
  references users on delete cascade, created_at, expires_at,
  idle_expires_at, last_seen_at)`, index on `user_id`. Store the SHA-256 of
  the token, never the token. `authorize` is one statement that joins `users`
  for the name and role, so freezing an account takes effect at once instead
  of relying on eviction. The idle deadline is pushed forward **at most once
  every five minutes per session** (`UPDATE ... WHERE last_seen_at < NOW() -
  INTERVAL '5 minutes'`), never on every request. Expiry compares against the
  database clock. Caps stay: 5 per user, oldest evicted, in SQL. Expired rows
  are purged at sign-in as today. Store chosen by `app.sessions.store`
  (`jdbc` default, `memory` available). No cache in front at first.
- **Tests:** everything the current session tests assert, run against both
  stores; a session survives a new `JdbcLoginRepository` instance (the
  restart case); a frozen role refuses an existing session; the per-user cap;
  the idle push is throttled; a token is never stored in clear.

### S4. Migration lock, graceful shutdown, pruning, old assets

- **Files:** `migration/DatabaseMigrationService.java`, `DatabaseMigrator.java`
  (take `pg_advisory_lock` on one dedicated connection around the whole run,
  release in `finally`; property `app.migrations.mode` = `apply` (default) or
  `verify`, where `verify` refuses to start with pending scripts and names
  them); `tools/install-release.sh` (keep the five newest
  `~/backups/release-*`; when swapping the web root, copy the previous
  root's `assets/` files younger than 14 days into the new one). Reported for
  the integrator: `server.shutdown=graceful` and
  `spring.lifecycle.timeout-per-shutdown-phase=20s` in
  `application.properties`; `guide/MIGRATIONS.md` and `guide/DEPLOYMENT.md`
  paragraphs.
- **Not in this package:** the `--migrate-only` entry point (stage 2).
- **Tests:** the migration tests, plus two migrators started on two threads
  against the test database apply each script once; the install script's
  existing local rehearsal (`--dry-run`) shows the prune and the asset copy.

### S2. Storage interface

- **Files:** new `posts/service/FileStore.java`, `LocalFileStore.java`;
  `UploadController.java`, `ProfileHeaderController.java`,
  `FontController.java`, `StorageAccountService.java` (`recordOldHeader`),
  `ImageProcessingService.java` (`writeVariants` returns the encoded copies;
  the store writes them), and the file-touching parts of `AuthController.java`
  (avatars), `AdminController.java` (deletes, orphan cleanup),
  `AccountController.java` (deleting a member's files). `WebConfig` is left
  as it is. New `LocalFileStoreTest`.
- **Design:** the interface in 3.1. Keys are exactly today's relative names.
  Reject keys containing `..` or a leading `/` in one place. Replace the JVM
  `USER_LOCKS` with `pg_advisory_xact_lock(userId)` inside one transaction
  that checks the quota and inserts the `uploads` row. While in these files,
  decode each uploaded image once and reuse the decoded image for the resized
  copies (halves upload CPU and peak pixels). No behaviour change otherwise:
  same names, same URLs, same responses.
- **Tests:** the existing upload, avatar, header, font, storage and
  account-deletion tests pass unchanged; a new test proves no class outside
  `LocalFileStore` and `WebConfig` references `uploadDir` (a grep-style test
  like `noGradients.test.js` on the client).

### S5. Job table; mail through it

- **Files:** new migration `V0NN__jobs.sql`; new `posts/service/JobQueue.java`
  (`enqueue(kind, payload, runAfter)`), `JobWorker.java` (a `@Scheduled` poll
  every few seconds, `FOR UPDATE SKIP LOCKED`, at most N jobs a tick, retry
  with back-off, give up after 5 attempts and keep the row with its error);
  `EmailService.java` (`send` enqueues; the worker sends),
  `EmailNotificationService.java` (`notifyFollowersOfPost` enqueues one
  fan-out job that resolves recipients with a single joined query instead of
  one per follower; `flushDigests` claims with `DELETE ... RETURNING`). New
  `JobQueueTest`.
- **Design:** kinds `mail.send` and `mail.post_fanout` only. Payloads hold ids
  and short strings, never bodies. Finished jobs are deleted; failed ones are
  kept 14 days. The worker does nothing when the table is empty beyond one
  indexed probe.
- **Tests:** a job enqueued before a simulated restart is still sent; two
  workers on two threads send each job once; a failing send is retried and
  then parked; the digest is sent once when `flushDigests` runs twice at the
  same time.

### S3. Rate limits behind an interface

- **Files:** `posts/validator/RateLimiter.java` (same constructor and methods,
  so no controller changes; delegates to a store), `LoginRateLimiter.java`
  (same static methods), new `RateLimitStore.java`,
  `InMemoryRateLimitStore.java` (with the prune-above-10,000 that
  `LoginRateLimiter` has and `RateLimiter` lacks), new `RateLimitStoreTest`.
- **Follow-up, not in this package** (files owned by others today): moving
  `REG_BLOCK`/`REG_DAILY` in `AuthController` and `SendBudget` in
  `EmailSettingsController` onto the same store; a rate limit on
  `/search/posts`; the PostgreSQL store.
- **Tests:** `SocialAbuseGuardsTest`, `EmailRateLimitTest` and the sign-in
  limit tests unchanged; the new store test covers window expiry, lockout and
  pruning with an explicit clock.

### S9. Client rides out a restart; maintenance page

- **Files:** new `client/src/utils/serverStatus.js` (axios response
  interceptor: on 502, 503, 504 or a network error, mark the server as away,
  retry idempotent GETs with back-off up to about 60 s, clear on the next
  success), new `client/src/components/ServerStatus/ServerStatus.jsx` and its
  CSS (one quiet line, grayscale, plain words), new
  `client/public/maintenance.html` (static, self-contained, reloads itself
  every 20 s), a `vite:preloadError` handler that reloads the page once;
  tests in `client/src/test/serverStatus.test.js`. Reported for the
  integrator: mounting the component and installing the interceptor in
  `App.jsx` / `main.jsx`; an nginx snippet for DEPLOYMENT.md
  (`error_page 502 503 504` to a JSON 503 with `Retry-After: 15` under
  `/api/`).
- **Needs a browser** and the design-guardian before hand-over.

### S7. Ops numbers for the admin (optional)

- **Files:** new `posts/controller/OpsController.java` (`GET /api/admin/ops`,
  admin only: uptime, heap used and max, live threads, pool active and
  waiting, free bytes on the upload volume, database size, live sessions,
  waiting jobs), new `OpsControllerTest`. Showing it in the admin panel waits
  until `AdminPanel.jsx` is free.

---

## 8. The same thinking for webpaint.ing

Scaling view only; the product architecture is the other document's.

**Stage 0 for webpaint.ing is single-user.** A Godot web build is static
files: nginx serves it from the same droplet at no meaningful cost, apart from
download size (tens of megabytes: serve it compressed and with a year-long
cache on hashed names, and expect it to be the largest transfer item until
video). Projects save in the browser first. That needs no server capacity at
all and should ship before any realtime work.

**Shared accounts** need sessions that more than one process can check, which
is work package S1. The hand-off between the two domains (a one-time code
redeemed server to server) then creates an ordinary session row for the second
site.

**Stroke relay and rooms.** See 4.5: one small separate process, one room per
process, the server orders, relays and logs, and never draws.

- Rough numbers (estimate): a pen produces 60 to 240 points a second. Batched
  every 30 to 50 ms in a compact binary form that is about 1 to 3 KB a second
  per person drawing. A room of 8 with 3 drawing at once sends about 40 KB a
  second in total. One hundred such rooms drawing continuously would be about
  4 MB a second, which is roughly 10 TB a month if it never stopped; at a
  realistic few percent of the time it is a few hundred GB. So **bandwidth is
  fine, and the limits to set are per room**: at most 8 to 16 people, a cap on
  message size and rate per connection, and a bounded send queue per
  connection (a client that cannot keep up is dropped and resyncs from a
  snapshot rather than making the server buffer for it).
- Memory: no canvases on the server, so a room is its sockets and a short tail
  of the log. Plan on 300 MB for the process on the 4 GB droplet and measure
  connections per megabyte in the phase 0 spike.
- The event log is append-only chunks in the file store with a snapshot every
  N events (made by a client and uploaded, since the server cannot draw), so
  joining late means one snapshot plus a short tail, and the log can be
  trimmed.
- Trigger to give the realtime process its own droplet ($12): more than about
  200 concurrent connections, or its CPU above 50% of a core, or webpost.ing
  deploys disturbing drawing sessions.

**Video and large files: storage and egress.**

- Never through the JVM and never on the droplet's disk. The browser encodes
  (already decided) and uploads straight to object storage with a presigned,
  size-limited URL; the server records a row. Playback comes from the bucket's
  CDN with range requests.
- Sizes (estimate): a 30 second 1080p clip is 7 to 15 MB in AV1 or VP9 and
  about 30 MB in H.264 at 8 Mbit/s. A hundred views of a 10 MB clip are 1 GB
  out.
- Cost levers, in order: the per-member allowance, the maximum clip size and
  length, then the provider. Storage at DigitalOcean Spaces is $5 for the
  first 250 GiB, then $0.02 per GiB a month; egress is 1 TiB included, then
  $0.01 per GiB. Cloudflare R2 is about $0.015 per GB a month with no egress
  charge; Backblaze B2 about $0.007 per GB with free egress up to three times
  what is stored. So 1,000 members with 500 MB of video each (500 GB) cost
  about $10 a month to store on Spaces, and 10 TB of viewing a month about
  $90 there or nothing on R2. **Start on Spaces** (one provider, one bill) and
  move video to R2 only if egress passes about 2 TB a month; the storage
  interface makes that a configuration change.
- User media of kinds a browser might execute (anything that is not an image,
  audio or video file with a fixed content type) is served from a separate
  cookie-less domain, as `/uploads/` already is sandboxed by CSP today.
- Comic pages in batches are ordinary image uploads: the same quota, the same
  storage interface, one job per batch for resized copies, and one
  notification fan-out per batch, not per page.

**Triggers for webpaint.ing specifically**

| Event | Action |
|---|---|
| Multi-user drawing goes live | Resize to 4 GB / 2 vCPU first |
| Any video upload feature | Object storage first (stage 1, files half) |
| More than about 200 concurrent realtime connections | Realtime process on its own droplet |
| Media egress above about 2 TB a month | Video bucket to a zero-egress provider |

---

## 9. All stages at a glance

| Stage | Trigger (measured) | Monthly cost | Work (one developer with AI help) | Main risks | Mae does |
|---|---|---|---|---|---|
| 0. One box, well | now | $15 to $21; $29 to $36 after the first resize | 4 to 6 days | one machine, one disk; a resize is minutes of downtime | backups and alerts in the DigitalOcean account, a backup bucket and key, uptime check, timer and PostgreSQL settings with sudo, nginx log format, each resize |
| 1. Two boxes | disk above 60% or uploads above 20 GB or video (files); database above 5 GB, or memory contention, or more than about 500 members she does not know (database) | $44 to $59; $90 to $120 with a standby | preparation 8 to 10 days (mostly done at stage 0), cut-overs 2 to 3 days | bucket permissions; a network hop per query; 10 to 30 minutes of planned downtime for the database move | create the Space and the database cluster, private network and trusted sources, values in `deploy.env`, nginx block, the copy, the window |
| 2. Several instances | deploy pain with more than about 100 online, or 8 GB / 4 vCPU at 60% CPU, or realtime needs isolating | $115 to $190 (stage 1.5 on one bigger box: no extra cost) | 5 to 8 days | two-instance-only bugs; more to watch | second droplet and balancer, certificates, a DNS name for realtime |
| 3. If it takes off | tens of thousands daily; egress above 1 to 2 TB; jobs waiting over 5 minutes; uploads over 30% of CPU | $300 and up | weeks per item | building too early | provider accounts, budgets, deciding what is worth it |

## 10. To-recheck list

- Every price in this document (DigitalOcean droplets were read from
  digitalocean.com on 2026-10-03; Spaces, managed PostgreSQL, the load
  balancer, backups, R2, B2 and the free monitoring plans came from
  documentation pages and third-party summaries).
- Whether DigitalOcean Monitoring alert policies and one Uptime check are
  still free; UptimeRobot's terms for a personal site.
- Droplet resize behaviour (power-off, reversible when the disk is not
  grown).
- Connection limits of the smallest managed PostgreSQL plan (from memory,
  about 22 usable connections on 1 GiB), and that its pooler's transaction
  mode breaks session advisory locks.
- That the PostgreSQL JDBC driver's default `sslmode` is `prefer`.
- Managed load balancer certificates requiring DigitalOcean DNS.
- Cloudflare's current terms on serving video through the free plan, if
  Cloudflare is ever put in front.
- All capacity figures in section 1: replace with a measured run (1.3).
- The live server: nginx config, swap, PostgreSQL settings, whether
  DEPLOYMENT.md 9.1 to 9.4 are applied, current disk use.
