# Performance review, 2026-10-03

Read-only audit from the source and the docs. Nothing was run, built or measured, and no database or server was touched. Line numbers are from the working tree at the time of reading (several files are being edited by other agents, so lines may drift by a few). Anything marked **UNCONFIRMED** could not be verified from the repository (production nginx config, table sizes, real post sizes).

## Verdict

The server is not slow because of SQL planning: most lookups hit an index and the session check is in memory (no database query per request). It is fragile because of **how much text it moves**: every list endpoint (profile page, Following, Discover, the crawler profile page) returns the full multi-megabyte post body (`posts.description`, up to 5 MB each) for 20 to 50 posts, even though the client uses it only to pull out the first tile grid. That is the most likely route to another out-of-memory event: 50 bodies x up to 5 MB is 250 MB of strings plus the JSON copy, against a JVM that has **no heap flag at all** (default max heap is a quarter of RAM, about 512 MB on this box, and it shares the machine with PostgreSQL). Second: every save, including the autosave, runs about 27 quota queries, loads the old post body, loads a whole `users` row to check ownership, and re-parses the body with regexes; search scans every published body with `ILIKE '%q%'`. Third: the client fans out about 14 requests per profile view, polls two unread counters every 30 s per tab (also from hidden tabs, and again on every navigation), and loads 24 Google font families in a render-blocking stylesheet. Nothing here needs a rewrite. The top twelve fixes below are mostly small, and the first two (nginx caching/compression and JVM/systemd limits) need no code at all.

## Top 12 fixes, ranked by impact on the small server / effort

| # | Fix | Evidence | Concrete change | Expected effect | Risk |
|---|-----|----------|-----------------|-----------------|------|
| 1 | nginx: long cache for hashed assets and uploads, `index.html` no-cache, gzip, HTTP/2, micro-cache of SEO endpoints | README sample has none of these (`README.md:129-166`, `listen 443 ssl` with no `http2`); DEPLOYMENT.md only mandates `sw.js` no-cache (`DEPLOYMENT.md:376-381`); production nginx **UNCONFIRMED** (config lives on the server only) | Snippets in section 5 | Repeat visits stop re-downloading 100s of KB; JSON compresses 3 to 10x; crawlers hit nginx, not Tomcat | Low. `add_header` in a location drops inherited headers: repeat the security headers (DEPLOYMENT.md section 8 already warns) |
| 2 | Cap the JVM, Tomcat and systemd memory | `server-start.sh:28` is `exec java -jar "$JAR"`; unit file `README.md:177-190` has no `MemoryMax`; `application.properties` sets no Tomcat threads (default 200), Hikari 10 (`DB_POOL_SIZE`) | `-Xms256m -Xmx640m -XX:+UseSerialGC -XX:+ExitOnOutOfMemoryError`, `server.tomcat.threads.max=40`, `MemoryMax=1100M` in the unit, 1 GB swap as a net (section 3) | A runaway request kills and restarts the app instead of the box; predictable RSS | Low; heap too small would surface as 500s on huge posts (see #3) |
| 3 | List endpoints stop shipping the post body | `JdbcPostRepository.java:94` (profile page SELECT includes `description`), `FeedController.java:50` (Following), `SocialRepository.java:887` (Discover), `SeoController.java:363-370` (crawler profile: up to 50 bodies when no summary), `PostController.java:225` (post card); client uses it only in `BasicTextPost.jsx:30` -> `utils/gridPost.js:16` | Store the first grid at save time (`posts.card_preview`), list queries return a tiny synthetic Lexical doc built from it as `description` (so the client needs **no change**); details in section 1.A | Profile page response: from MBs to tens of KB; heap per profile request from 100s of MB worst case to under 1 MB; browser stops `JSON.parse`-ing 20 bodies | Medium: needs a backfill for old posts (admin one-off) and a save-path change; fall back to the body when `card_preview` is NULL |
| 4 | Migration V018 with the missing indexes, plus two query rewrites | `V001__schema.sql:552-587` (existing indexes); gaps listed in section 1.B | Ready body in section 1.B | Removes sequential scans of `conversations` and `notifications` from the 30 s poll and from every publish; per-save usage queries become index scans | Very low: all `IF NOT EXISTS`, small tables |
| 5 | Polling: pause when hidden, one combined endpoint, conditional GET, stop doubling on navigation | `useUnreadCounts.js:11-22` (two requests per 30 s, effect re-runs on `pathname` so every navigation fires 2 more and restarts the timer), `App.jsx:70-77` heartbeat, `MessagesPage.jsx:172-188` (4 requests every 10 s) | Section 2 | A signed-in tab goes from 4.5 to about 1 request per minute when visible, 0 when hidden; Messages page from 24 to about 6 per minute | Low |
| 6 | Trim the save/autosave path | `PostController.java:532` and `:464` call `storage.fitsQuota` -> `StorageAccountService.usage()` (`:133`, about 27 queries, 3 of them per-user `COUNT(*)` on unindexed `comments.user_id`/`direct_messages.sender_id`); `:521` and `:319`, `:582`, `:609` `getUsernameFromPostId` is `SELECT users.*` (`JdbcPostRepository.java:148`); `:523` `findById` loads the old 5 MB body only to measure it; `:548` hashtag regex and N+1 inserts (`SocialRepository.parseAndSaveHashtags`) run for every draft autosave; `:547` `syncPostUploads` one query per image | Section 1.C | Autosave from about 35 queries and about 3 body copies to about 6 queries; at most one editing tab per user does it, at most once a minute (`Editor.jsx:1529-1531`) | Low |
| 7 | Fonts: drop the 24-family Google stylesheet from `index.html`, load theme/editor fonts on demand | `client/index.html:7-8` (24 families: Bebas Neue, Caveat, Comic Neue, Great Vibes, IM Fell English, IBM Plex Mono, Josefin Sans, JetBrains Mono, Nunito, Old Standard TT, Orbitron, Outfit, Patrick Hand, Permanent Marker, Pixelify Sans, Pirata One, Playfair Display, Rubik Dirt, Sacramento, Sniglet, Special Elite, Tinos, UnifrakturMaguntia, VT323), while the app font is `system-ui` (`index.css:20`) | Section 4.C | Removes a render-blocking third-party stylesheet and two extra TLS connections from every first paint | Low-medium: every consumer of a font must ask for it (list in 4.C) |
| 8 | Search: stop `description ILIKE '%q%'` over every published body | `PostController.java:738`, `:756` (also `from:` variant); only `title` has a trigram index (`V001__schema.sql:580`) | `posts.search_text` (plain text, 20 000 chars, from `PostTextExtractor.MAX_CHARS`) + trigram GIN index, filled at save; interim: title-only | A search currently reads and decompresses the whole content of the site; this makes it an index scan | Medium (backfill; ranking unchanged) |
| 9 | Home and profile fan-out: Home asks for 12 avatars one by one; the profile fetches full follower and following name lists just to count them | `Home.jsx:22-35,63-70` (1 + 12 requests), `AuthController.java:395-401` (`recently-active` returns only name and time); `PostsViewer.jsx:254-259` (`GET_FOLLOWERS` + `GET_FOLLOWING` return every username), `SocialRepository.getFollowCounts` already exists | Add `avatar_path` to `recently-active`; one `/users/{u}/profile-summary` (counts, followsMe, bio, links, avatar, header, banner, pinned, online) | A profile view from about 14 requests / 20 queries to about 4 / 8; Home from 13 to 1 | Low |
| 10 | SEO endpoints: cache in nginx, slim the queries | `SeoController.java:117` already sends `public, max-age=300`, but nothing caches it; `sitemap()` `:134-157` runs a GROUP BY over all published posts and a 5000-row sort each hit; crawler profile `:363-370` loads up to 50 bodies; `findByTitleSlug` `PostController.java:150-158` loads every slug-less title of an author per miss | `proxy_cache` (section 5); use `summary`/`card_preview`-like excerpt column instead of body | Crawler bursts become one backend hit per 5 min per URL | Low |
| 11 | Discover: make the date cursor index-friendly | `SocialRepository.java:894` `date_trunc('milliseconds', p.date) < ?` wraps the column, so the index cannot be used for the range and deep pages walk from the newest post; `discoverPeople` `:900-908` sorts users by `last_active_at` | `p.date < ?::timestamptz` (equivalent, see 1.D); partial index `idx_posts_pub_date` from #4 | Page N costs the same as page 1 | Very low |
| 12 | Client CPU: TileGrid redraws on every render, Home pulls the whole tile-grid editor into the first bundle, WaterTitle never stops animating, post body copied to localStorage | `TileGrid.jsx:335-356` draw effect has **no dependency array** and re-registers `document.fonts.ready.then(draw)` each time; `Home.jsx:5` static import of `TileGrid.jsx`; `WaterTitle.jsx:197,294` `requestAnimationFrame(tick)` runs the wave simulation and `createImageData`/`putImageData` every frame even at rest; `Viewer.jsx:217` `localStorage.setItem('currentPostData', data.description)` on every post view (up to 5 MB synchronous write) | Section 4.D | Lower first-load JS, no 60 fps loop on the home page, no multi-MB storage write when merely reading | Low |

## 1. Database

### Existing indexes (from V001 and later migrations)

`posts`: `idx_posts_date (date DESC)`, `idx_posts_published (published)`, `idx_posts_sort_order`, `idx_posts_slug_lower`, `idx_posts_title_trgm` (GIN, `WHERE published`). `users_posts_junctions`: unique `(post_id, user_id)`, `idx_upj_user_id`, `idx_upj_post_id`. `users`: unique `username`, `lower(username)` (also unique since V015). `follows`: pkey `(follower_id, followed_id)`, plus two single-column indexes (`idx_follows_follower` duplicates the pkey prefix). `notifications`: `idx_notif_read (recipient_id, is_read)`, `idx_notif_recipient` and `idx_notifications_recipient` (both `(recipient_id, created_at DESC)`, **identical duplicates**). `conversations`: unique `(user1_id, user2_id)` only. `direct_messages`: `(conversation_id, created_at)`, partial unread index. `comments`: `(discussion_id)`, `(parent_id)`.

### 1.A Post bodies in list responses (the big one)

- Profile page: `JdbcPostRepository.getPostsPage` (`:88-114`) returns `description` for up to 50 posts (controller caps at 50, `PostController.java:383`). The inner query carries `post.*` through a window function over all of the author's posts of that section; the heavy column is only fetched for the LIMIT rows, so the cost is the transfer and the heap, not the plan.
- Following: `FeedController.java:50`; Discover: `SocialRepository.java:887`; both return `p.description` for 20 (+1) posts. Following also joins `follows` x junctions x posts and orders by `date DESC, id DESC` with no index that serves both (see 1.B).
- Post card in a message: `PostController.java:225` returns one body (acceptable, one row).
- Client use: `BasicTextPost.jsx:29-31` only calls `firstGridOfPost(postdata.description)` when `cardGrid !== false`; `firstGridOfPost` (`utils/gridPost.js:16-35`) does `JSON.parse` of the whole body and returns the first `tilegrid` node. Nothing else on the list cards reads the body. Before shipping, run `grep -rn "\.description" client/src/components/Pages/Posts/PostsViewer client/src/components/Social client/src/components/Pages/Discover` to confirm no other list consumer exists (I only checked `ProfilePostList.jsx`, `BasicTextPost.jsx`, `FollowingPage.jsx`).
- Heap arithmetic (estimate, not measured): a 5 MB Latin-1 `String` from the JDBC driver, plus the serialised response buffer, is roughly 10 MB per post in flight; 50 posts is about 500 MB, a quarter-RAM default heap is about 512 MB. Real posts are probably far smaller (not measured), but the limit is 5 MB each (`PostController.java:429`) and a user can do this on purpose.
- `card_grid` defaults to TRUE (V010), so "send NULL when `card_grid` is false" alone barely helps; the preview must be precomputed.

**Fix, no client change:**

1. Migration (put in V019, separate from the index migration so it can ship alone):
   ```sql
   ALTER TABLE posts ADD COLUMN IF NOT EXISTS card_preview text;          -- first tile grid, as a one-node Lexical document
   ALTER TABLE posts ADD COLUMN IF NOT EXISTS card_preview_done boolean NOT NULL DEFAULT false;
   ```
2. Save path (`PostController` create and update, after `validatePost`): find the first `tilegrid` node the same way `firstGridOfPost` does (Jackson, same traversal as `PostTextExtractor`) and store
   `{"root":{"children":[<that node>],"type":"root","version":1,"direction":null,"format":"","indent":0}}` in `card_preview`, or NULL when the post has no grid; set `card_preview_done = true` in both cases. The validator already parses the tree, so reuse it rather than parsing twice.
3. List queries replace `p.description` with
   `CASE WHEN NOT p.card_grid THEN NULL WHEN p.card_preview_done THEN p.card_preview ELSE p.description END AS description`.
   Rows not yet backfilled fall back to the body (today's behaviour).
4. Backfill: an admin-only endpoint (or button) that loops `SELECT id, description FROM posts WHERE NOT card_preview_done ORDER BY id LIMIT 20`, computes the preview and updates, one batch per call, so it never holds many bodies at once. Do not run it as a migration (it would read every body on startup).
5. Same column serves the crawler profile (`SeoController.java:363-370` currently selects the body when there is no summary: use an excerpt column or only the first 50 posts' summary/title).

### 1.B Missing indexes: ready migration body

Evidence per index in comments. Save as `server/src/main/resources/db/migrations/V018__performance_indexes.sql` (next free number after V017; check no other agent took it):

```sql
-- V018: indexes the hot paths were missing (performance review 2026-10-03)
--
-- Every statement is IF NOT EXISTS, so running it twice is harmless. The tables
-- are small enough that a plain (blocking) CREATE INDEX takes well under a second.
BEGIN;

-- Following, Discover, sitemap, search and hashtag pages all order published
-- posts by (date DESC, id DESC); a partial index skips drafts and serves the
-- order without a sort. (FeedController, SocialRepository.discoverPosts, SeoController.)
CREATE INDEX IF NOT EXISTS idx_posts_pub_date ON posts (date DESC, id DESC) WHERE published;

-- Unread-count poll (every 30 s per tab): count only unread rows of one user.
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (recipient_id) WHERE NOT is_read;

-- PostController.alreadyAnnounced: COUNT(*) FROM notifications WHERE type='new_post' AND post_id=?
-- had no index on post_id (sequential scan on every publish).
CREATE INDEX IF NOT EXISTS idx_notifications_new_post ON notifications (post_id) WHERE type = 'new_post';

-- getUnreadMessageCount / getConversations: "user1_id = ? OR user2_id = ?" could
-- only use the unique (user1_id, user2_id) index for one side.
CREATE INDEX IF NOT EXISTS idx_conversations_user2 ON conversations (user2_id);

-- Profile page and post lookups join junction by user: cover post_id too so the
-- planner can read the junction from the index alone.
CREATE INDEX IF NOT EXISTS idx_upj_user_post ON users_posts_junctions (user_id, post_id);

-- StorageAccountService.usage() (runs on every post save) and the activity page:
-- per-user counts and sums over these tables had no user index.
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments (user_id);
CREATE INDEX IF NOT EXISTS idx_post_reactions_user ON post_reactions (user_id);
CREATE INDEX IF NOT EXISTS idx_comment_reactions_user ON comment_reactions (user_id);
CREATE INDEX IF NOT EXISTS idx_post_votes_user ON post_votes (user_id);
CREATE INDEX IF NOT EXISTS idx_post_views_user ON post_views (user_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_sender ON direct_messages (sender_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_group_messages_sender ON group_messages (sender_id) WHERE deleted_at IS NULL;

-- Orphan cleanup (AdminController) and deleting a post: NOT EXISTS / DELETE by upload_id.
CREATE INDEX IF NOT EXISTS idx_post_uploads_upload ON post_uploads (upload_id);

-- User search (ILIKE '%q%') and hashtag suggest (LIKE 'q%'; a plain btree cannot serve LIKE
-- under a non-C collation without text_pattern_ops). pg_trgm is already installed (V001:13).
CREATE INDEX IF NOT EXISTS idx_users_username_trgm ON users USING gin (username gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_hashtags_tag_prefix ON hashtags (tag text_pattern_ops);

-- Redundant copies: identical to idx_notif_recipient / a prefix of the follows pkey.
-- They only slow every insert (a new_post fan-out inserts one notification per follower).
DROP INDEX IF EXISTS idx_notifications_recipient;
DROP INDEX IF EXISTS idx_follows_follower;

COMMIT;
```

Notes: do **not** index `users.last_active_at` while the heartbeat updates it (an indexed column disables HOT updates, so every 2-minute heartbeat per tab would write an index entry); `users` is small, so sorting it for `recently-active` is fine. The `DROP INDEX` lines are the only non-additive part (docs say migrations "only add things", `DEPLOYMENT.md:63`); they are optional, delete them if you want the rule kept.

### 1.C Per-query findings (hot paths)

**Profile page** (`/user/{u}` + `/sections` + 12 small ones, `PostsViewer.jsx:158,221,237-268`)
- `getPostsPage` `JdbcPostRepository.java:93-114`: window over all the author's posts then LIMIT/OFFSET. Fine for hundreds of posts per author, linear in the author's post count per page. Body issue: 1.A.
- `countSections` `:126-135`: one scan of the author's posts, fine.
- `GET_FOLLOWERS`/`GET_FOLLOWING` (`SocialController.java:44-57`, `SocialRepository.getFollowers/getFollowing`): return **every** username to compute two numbers; unbounded. Replace with one count query (`getFollowCounts`, `SocialRepository.java:~889`) plus a `followsMe` boolean.
- `getBanner` (`ProfileBannerController.java:42-47`): a correlated `COUNT(*)` over the author's posts. The same count is in `countSections`. Merge into one summary endpoint.
- `getPinnedPost` (`PostController.java:645`): two queries (user, then `findById` which loads the **whole body** of the pinned post). Return a card projection instead.
- Bio, bio-links, avatar, header, theme, background, online: each is a one-row `SELECT ... FROM users WHERE username=?` (indexed). Eleven round trips for what one `SELECT` of the user row could return.

**Post page** (`RESOLVE_POST`, `READ_POST`, `GET_USER_FROM_POST`, `GET_POST_FEATURES`, `RECORD_POST_VIEW`, `GET_POST_VOTE`, theme, reactions, `Viewer.jsx:209-229`)
- `getPostById` (`PostController.java:315-318`): `findById` (body) plus `getUsernameFromPostId`, which is `SELECT selected_user.* FROM users ...` (`JdbcPostRepository.java:146-153`), pulling the password hash, theme (up to 4000 chars), banner grid and presets for a username comparison. Then `GET_USER_FROM_POST` repeats both (`:341-342`). Replace by `SELECT u.username FROM users_posts_junctions j JOIN users u ON u.id=j.user_id WHERE j.post_id=?` and return the author in the post response so `UserFromPostID` is not needed.
- `recordPostView` (`SocialRepository.java:764-787`): up to two writes per view, one of them an upsert on a hot counter row; no rate limit, crawlers and reloads count. Fine for now; if it shows up, batch in memory and flush every few seconds.
- Votes/reactions/features: three one-row queries; `getPostScore` is a `SUM` over `post_votes` (pkey prefix `post_id`), fine.
- Comments (`SocialRepository.getComments:195-261`): 3 to 5 queries per page view and **no LIMIT** (all comments of the post, replies built in memory). Add a limit (for example top 200 roots) when comment counts grow.
- `resolvePost` slug path (`PostController.java:94-104`): indexed by `idx_posts_slug_lower`; on a miss, `findByTitleSlug` (`:150-158`) loads id and title of **all** the author's slug-less posts and slugifies in Java. V003 backfilled slugs and the save path stores them, so this should rarely run; keep an eye on it.

**Following feed** (`FeedController.java:48-60`): `follows` x junctions x posts, `ORDER BY p.date DESC, p.id DESC LIMIT n OFFSET m`. Uses the pkey on `follows` and `idx_upj_user_id`, but the sort over the union of all followed authors' posts is done per request, and OFFSET paging re-walks earlier pages. For tens of follows that is fine; for hundreds, switch to a `before` cursor like Discover and rely on `idx_posts_pub_date`. Body issue: 1.A.

**Discover** (`SocialRepository.java:885-896`): see #11. `date_trunc('milliseconds', p.date) < ?::timestamptz`: the cursor sent by the client is the last post's date in milliseconds (`DiscoverPage.jsx:nextBefore`), i.e. ms-aligned, and for an ms-aligned `C`, `date_trunc('ms', D) < C` is exactly `D < C`. So `p.date < ?::timestamptz` is equivalent and index-friendly. `(? IS NULL OR ...)` with a typed null is fine; two bind parameters can become one. `discoverPeople` (`:900-908`): `EXISTS` per user in `last_active_at` order; fine at this size.

**Notifications and unread polling** (`SocialController.java:256-280, 433-445`)
- `getUnreadCount` (`SocialRepository.java:398`): `COUNT(*) WHERE recipient_id=? AND is_read=FALSE` through `idx_notif_read`. A user who never opens the inbox accumulates one unread row per post of everyone they follow (`notifyFollowers`, `:365`), so this count grows without bound; the partial index in V018 keeps it small and an index-only scan.
- `/conversations/unread-count` (`SocialController.java:433-445`): `getUnreadMessageCount` (`:753-760`) joins `conversations` on `user1_id=? OR user2_id=?` (second side unindexed until V018, so a sequential scan of `conversations` every 30 s per tab), plus `getTotalGroupUnreadCount` (`:1142-1154`), a correlated `COUNT(*)` per group. The group query is fine with `idx_group_messages_group (group_id, created_at)`.
- `getNotifications` (`:387-396`): `n.*` plus left joins to posts/junctions/users per row; 30 rows; uses `idx_notif_recipient`. Fine.
- `hasRecentFollowNotification`, `alreadyAnnounced` (`PostController.java:65-69`): see V018; also prefer `SELECT EXISTS(...)` over `COUNT(*)`.

**Messages** (`getConversations` `SocialRepository.java:667-686`, `getMessages` `:711-717`): per conversation a correlated `COUNT(*)` plus a LATERAL last message; both use `idx_direct_messages_conv` / `idx_dm_conv_unread`. `getMessages` uses OFFSET and always reloads the latest 100 each poll (see section 2). `getDmReactionsForConversation` aggregates every reaction of every message of the conversation each poll.

**Search** (`PostController.java:715-762`): `p.title ILIKE ? OR p.description ILIKE ?` with a leading `%`. The title half can use `idx_posts_title_trgm`; the body half cannot, so the planner scans all published posts and decompresses every body for each query, up to 25 results. Cost grows with the total bytes of all posts, and a single query can touch hundreds of MB of TOAST. `q` is limited to 200 chars and the client debounces (`SearchPage.jsx`), but there is no server rate limit. Fix:
```sql
-- V019 (with card_preview)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS search_text text;      -- plain text, <= 20 000 chars
CREATE INDEX IF NOT EXISTS idx_posts_search_trgm ON posts USING gin (search_text gin_trgm_ops) WHERE published;
```
Fill `search_text` in the save path with `PostTextExtractor.extract(...).plain()` (already capped by `MAX_CHARS = 20_000`), backfill with the same admin loop as the preview, and query `(p.title ILIKE ? OR p.search_text ILIKE ?)`. Interim, no migration: search titles and `summary` only. Also keep the `%`/`_` escaping already there, and add `ESCAPE '\'` is the default so it is fine.
- `searchUsers` (`SocialRepository.java:850-854`) is `username ILIKE '%q%'` on a small table; the trigram index in V018 covers it.
- Hashtag suggest (`PostController.java:705-711`) `tag LIKE 'x%'`: `idx_hashtags_tag_prefix` in V018. Hashtag posts (`SocialRepository.getPostsByHashtag`) LIMIT 50, indexed through `idx_post_hashtags_hashtag`; fine.

**Save path and storage usage** (`PostController.java:451-560`, `StorageAccountService.java`)
- Every create and update calls `storage.fitsQuota` (`:464`, `:532`), which calls `usage(userId)` (`StorageAccountService.java:125-133`), which runs about 27 queries (uploads by prefix x4, comments, direct and group messages, notifications, stickers, fonts, packs, `SUM(octet_length(p.description))` and `octet_length(page_theme)`, `octet_length(background_pattern)` over all the user's posts, plus `recordOldHeader`). `octet_length(text)` reads the stored length from the TOAST header rather than decompressing the value (PostgreSQL behaviour as I know it, not verified here), so the post-size sum is not as bad as it looks; the cost is the number of round trips and the unindexed per-user counts.
- Fix in order of value: (1) at the top of `fitsQuota`: `if (addBytes <= freedBytes) return true;` (shrinking edits can never exceed the quota); (2) compute only `totalBytes` with one SQL statement (sum of the pieces as sub-selects) instead of the full breakdown; (3) cache `totalBytes` per user for about 30 s, invalidated on upload/delete (a `ConcurrentHashMap` with size cap).
- `updatePost` loads the old post with `findById` (whole body, `:523`) only to take `storedBytes` of it: use `SELECT COALESCE(octet_length(description),0) + COALESCE(octet_length(background_pattern),0) FROM posts WHERE id=?`.
- Ownership checks use `getUsernameFromPostId` (`SELECT users.*`) at `:319, :343, :522, :582, :609, :678`: replace with a one-column query.
- `parseAndSaveHashtags` (`SocialRepository.java:811-832`): 5 MB regex scan, then `DELETE` + three statements per tag (insert, select, insert). Hashtags matter only for published posts (`getPostsByHashtag` filters `published`), so skip it when the post stays a draft (autosave) and run it at publish; make the per-tag work one statement:
  ```sql
  WITH t AS (INSERT INTO hashtags(tag) SELECT unnest(?::text[]) ON CONFLICT (tag) DO NOTHING RETURNING id, tag)
  INSERT INTO post_hashtags(post_id, hashtag_id)
  SELECT ?, id FROM hashtags WHERE tag = ANY(?::text[]) ON CONFLICT DO NOTHING
  ```
- `syncPostUploads` (`:294-308`): `DELETE` then one `SELECT id FROM uploads WHERE filename=?` and one insert per image; replace with `INSERT INTO post_uploads(post_id, upload_id) SELECT ?, id FROM uploads WHERE filename = ANY(?::text[]) ON CONFLICT DO NOTHING` (keep it for drafts: uploads linked to a draft must not be treated as orphans by the admin cleanup).
- Write amplification: `update()` rewrites `description` in full on every autosave, so PostgreSQL writes the whole TOASTed value again (WAL and dead TOAST rows for autovacuum). Autosave only runs for saved drafts, after 30 s idle and at most once a minute per editing tab (`Editor.jsx:1529-1531, 1571-1578`), so this is bounded; if drafts grow large, send a diff-free "dirty" check (client already skips when nothing changed, `rev === savedRev`).
- Validation CPU/heap on each save: `PostContentValidator.clean` parses the body into a Jackson tree (`readTree`) and re-serialises it; limits are depth 40, 20 000 nodes (`PostContentValidator.java:41-43`). Transient copies of a 5 MB body during one save: request `String`, tree, cleaned `String`, old body, two `getBytes` for `storedBytes`: roughly 60 to 100 MB worst case (estimate), about 1 to 2 MB for a typical post.

**Storage usage endpoint** (`GET /users/{u}/storage`, profile page for the owner): `usage()` as above, about 27 queries per profile view for owners and admins (`PostsViewer.jsx:252`). Cache like `fitsQuota`.

**Admin** (rare, but unbounded): `AdminController.java:69-76` per-user correlated `SUM(octet_length(p.description))`, `COUNT(*)` on comments and uploads for every user in one query, no LIMIT; `:361-368` orphan cleanup does `position('/uploads/' || f.filename IN COALESCE(p.background_pattern,''))` per upload x per post (O(uploads x posts)); `:317` `SUM(octet_length(description))` over all posts. Acceptable for one admin occasionally; do not put them on a timer.

**SEO** (`SeoController.java`): `sitemap()` `:134-157` two queries, up to 5 000 rows, with the junction/users joins; profile and post pages read bodies (post page needs the one body for the excerpt, fine); `findUser` uses `lower(username)` on `idx_users_username_lower`. Cache at nginx (section 5).

**What is fine (checked):** the session store (`JdbcLoginRepository.java:75-122`, in memory, capped at 10 000 sessions, 5 per user, so no per-request SQL for auth); `getUserIdByUsername`, follow checks, vote and reaction toggles (pkey lookups); `getNotifications` ordering; message paging limits (max 100); `GET /users/recently-active` (LIMIT 50).

### 1.D Notes on exact rewrites

- Following feed projection: add `CASE ... AS description` as in 1.A; drop `p.published` from the select list (it is always true).
- `getUnreadMessageCount`:
  ```sql
  SELECT COUNT(*) FROM direct_messages dm
   WHERE dm.is_read = FALSE AND dm.sender_id <> ?
     AND dm.conversation_id IN (SELECT id FROM conversations WHERE user1_id = ? OR user2_id = ?)
  ```
  works with the new `idx_conversations_user2` (BitmapOr) and the partial unread index. Alternatively `UNION ALL` of the two sides.
- `alreadyAnnounced`: `SELECT EXISTS(SELECT 1 FROM notifications WHERE type='new_post' AND post_id=?)`.
- `getUsernameFromPostId` callers that only compare names: `SELECT 1 FROM users_posts_junctions j JOIN users u ON u.id=j.user_id WHERE j.post_id=? AND u.username=?`.

## 2. Polling

| Source | Interval | Requests | Server cost | Evidence |
|---|---|---|---|---|
| Unread counts | 30 s, plus once on **every route change** (the effect depends on `pathname` and restarts the timer) | 2 per tick: `/conversations/unread-count`, `/notifications/unread-count` | auth (memory) + 3 SQL: DM unread, group unread, notification unread; the DM one scans `conversations` until V018 | `useUnreadCounts.js:11-22`; `SocialController.java:271-280, 433-445` |
| Heartbeat | 2 min | 1 POST | one `UPDATE users SET last_active_at=NOW()` (new tuple version of a wide row every time) | `App.jsx:70-77`; `AuthController.java:830-840` |
| Messages page, thread open | 10 s | 4: messages (100 rows), reactions, conversations list, groups list (the last two refreshed on every tick) | about 6 to 8 SQL: participant check, 100-message page with join, reaction aggregate, conversations with LATERAL + correlated count per conversation, groups with the same | `MessagesPage.jsx:172-188` |
| Editor autosave | 10 s timer that does nothing unless: saved draft, tab visible, changed, idle 30 s, 60 s since last try; backoff doubles to 5 min on failure | at most 1 PUT per minute, whole post body | the save path of section 1.C (about 35 queries, several body copies) | `Editor.jsx:1529-1531, 1571-1600` |
| Session check | once per page load | 1 POST `/authorizeSession` | memory only | `App.jsx:58-60` |
| Site settings | once per load | `GET /users/{u}/settings` (carries `pattern_presets`, `site_background`, email fields) just for the site background and code font | one wide row | `SiteBackground.jsx:43-56`; `EmailSettingsController.java:153-170` |

Per signed-in tab, steady state, **visible or not** (nothing checks `document.visibilityState` for the counters or the heartbeat; only the editor does): 2 x 2 + 0.5 = **4.5 requests per minute**, 270 per hour, plus 2 per page navigation; a tab left open overnight keeps polling, and because `authorize()` pushes `idleExpiresAt` forward (`JdbcLoginRepository.java`, "Successful use pushes the idle deadline forward") the poll also keeps the session from ever idling out (the 24 h absolute cap still ends it). Ten people with one tab each is about 45 requests per minute: cheap while each is a 1 ms indexed query, but the DM count scan grows with the number of conversations and the notification count with unread rows. Editing tabs are not a problem as designed; the cost is the save path (section 1.C). Messages page open: up to 24 requests per minute per tab.

**How to cut it:**

1. **One endpoint**: `GET /api/me/counters` returning `{ "messages": n, "notifications": m }` (calls the two existing repository methods; one authorize, one HTTP round trip), and have it do the heartbeat write too, throttled in SQL:
   `UPDATE users SET last_active_at = NOW() WHERE id = ? AND (last_active_at IS NULL OR last_active_at < NOW() - INTERVAL '60 seconds')`
   Then delete the separate heartbeat timer (`App.jsx:68-77`). Request rate drops to 2 per minute.
2. **Pause when hidden, refresh on return**: in `useUnreadCounts`, skip the tick when `document.visibilityState !== 'visible'` and fetch immediately on `visibilitychange`/`focus` if the last fetch is older than 30 s. Same guard in `MessagesPage.jsx:172`.
3. **Do not restart on navigation**: keep `pathname` out of the effect dependency, or refetch only when `pathname` is `/inbox` or `/messages` (where reading changes the count).
4. **Back off**: when the counts did not change for 5 ticks, go 30 s, 60 s, 120 s (reset on any change or user interaction).
5. **ETag/304**: Spring `ShallowEtagHeaderFilter` on `/api/me/counters` and `/api/messages/*` makes unchanged polls cost headers only (the query still runs, so combine with 6).
6. **Messages**: poll `GET /conversations/{id}/messages?after={lastId}` (or `since=`) instead of 100 rows, refresh the conversation list every 30 s rather than every 10 s tick, and skip reactions unless something changed (include a `reactionsVersion` or fold reaction counts into the messages response).
7. **Several tabs of one user**: elect one tab to poll (`BroadcastChannel` or `localStorage` lock) and share the result; optional.
8. Do **not** introduce SSE/WebSocket on a 2 GB box with a 40-thread Tomcat: each open stream holds a thread.

## 3. Memory and threads

- **JVM**: `server-start.sh:28` runs `exec java -jar "$JAR"` with no flags; the documented unit (`README.md:177-190`) sets no `MemoryMax`/`MemoryHigh`. Default max heap is 25% of the RAM the JVM sees (about 512 MB on 2 GB), the default collector on a small machine is Serial/G1 depending on core count, metaspace and thread stacks add 150 to 250 MB, and PostgreSQL, nginx and the OS share the rest. Whether the server has swap is **UNCONFIRMED**.
  Suggested (Mae applies it in `deploy.env`/the unit, nothing in the repo changes except the example):
  ```bash
  # server-start.sh, last line
  exec java -Xms256m -Xmx640m -XX:+UseSerialGC -XX:MaxMetaspaceSize=160m -Xss512k \
       -XX:MaxDirectMemorySize=96m -XX:+ExitOnOutOfMemoryError ${JAVA_EXTRA_OPTS:-} -jar "$JAR"
  ```
  ```ini
  # webposting.service, [Service]
  MemoryHigh=1000M
  MemoryMax=1200M
  Restart=on-failure
  RestartSec=5
  ```
  `ExitOnOutOfMemoryError` plus `Restart=on-failure` turns an OOM into a 5 s blip instead of a wedged JVM; `MemoryMax` stops the JVM taking PostgreSQL's pages with it. Add 1 GB of swap with `vm.swappiness=10` as a last resort. Do not add `-XX:+HeapDumpOnOutOfMemoryError` unless there is disk for 640 MB dumps. Postgres on 2 GB: `shared_buffers=256MB`, `work_mem=4MB`, `max_connections=30` (the app needs at most 10): **UNCONFIRMED** whether the server already has these.
- **Tomcat and Hikari** (`application.properties`): `spring.datasource.hikari.maximum-pool-size=${DB_POOL_SIZE:10}`, connection-timeout 20 s; Tomcat threads at the Spring default of 200, no `accept-count`/`max-connections`. With a 5 MB body per request and about 100 MB of transient heap per worst-case save, 200 threads is unbounded memory; add `server.tomcat.threads.max=${TOMCAT_THREADS:40}` and `server.tomcat.accept-count=50`, and set `DB_POOL_SIZE=8` (nothing needs more connections than busy threads, and each Postgres backend is about 10 MB resident).
- **Request sizes**: `spring.servlet.multipart.max-file-size`/`max-request-size` = 50 MB for every endpoint (`application.properties`), JSON bodies capped at 6 MB by `RequestBodyLimitFilter.java:46-80` (good). Uploads read the file fully into a `byte[]`: `UploadController.java:126` (audio, 20 MB cap `:61`), `:194` (images, 5 MB cap `:179`), `AuthController.java:777` (avatar, `file.getBytes()`, up to 25 MB). So up to 40 concurrent uploads x 25 MB is possible in principle. Reduce with nginx per-endpoint limits (section 5) so the 50 MB limit applies only where needed, and keep the 2-slot decode semaphore.
- **Image processing** (`ImageProcessingService.java`): bounded and well done: max 16 megapixels (about 64 MB decoded, `:58`), two decode/resize slots at once (`:78`), 5 s wait then 503 (`:80-89`). Costs to know: an upload is decoded **twice** (`decodesCleanly` at `UploadController.java:217`, then `writeVariants` at `:264` decodes again), so about 128 MB of pixel data per upload under the semaphore; downscaling from 4000 px to 480 px in a single bilinear step (`scaleToWidth`) aliases (quality, not memory). Peak heap from images is therefore about 2 x 64 MB = 128 MB plus the `byte[]`s, which is a large share of a 640 MB heap: lowering `MAX_PIXELS` to 12 MP or setting the semaphore to 1 is a cheap safety if uploads and profile loads ever coincide with OOM.
- **In-memory maps**:
  - Sessions `sessionsByToken` (`JdbcLoginRepository.java:75-117`): bounded (10 000 total, 5 per user, oldest evicted); a few MB at most. `storeSession` is `synchronized` and scans all sessions per login (10 000 entries, trivial). Expired entries are purged only at login (`purgeExpiredSessions`, `:171-174`), which is fine because of the cap.
  - `LoginRateLimiter` (`validator/LoginRateLimiter.java`): keyed by IP and attacker-chosen usernames, pruned above 10 000 entries (`:58, 62-68`): bounded.
  - `RateLimiter` (`validator/RateLimiter.java`): entries are removed only when the same key is checked again after its window. Keys in `SocialController`/`DiscussionController`/`ReportController`/`SharedPackController` are per-user (bounded by user count); `EmailSettingsController.java:289-438` keys by **client IP** (`VERIFY_LIMITER`, `RESET_LIMITER`), so a flood from many IPs grows the map without eviction. Each entry is about 100 bytes; low risk, but add the same prune-above-N as `LoginRateLimiter`.
  - `wallpaperStyle` client cache is capped at 40 (`wallpaper.js:208`); `pixelatedChars` at 2000 (`tileGrid.js:~1085`).
- **Whole files and whole result sets in memory**: post list endpoints (1.A) and `getComments` (all comments of a post); `buildUserExport` (`SocialRepository.java:587-619`) loads every post of the user with its body plus up to 10 000 comments and all notifications into one map, then serialises it: a user with 50 MB of posts can allocate 100+ MB for one export; stream it or limit to one export at a time per user and globally (a semaphore of 1). Admin `listUsers` has no LIMIT.
- **Response sizes**: no compression is configured in Spring (`server.compression.*` absent) and gzip in nginx is **UNCONFIRMED**; the profile page response is the worst case above; `GET /api/posts/{id}` returns the whole body (needed). Notifications cap at 100, messages at 100, search at 25, hashtags at 50.
- **Scheduled/async**: `@EnableAsync` (`WebpostingServerApplication.java:12`) uses Spring Boot's default task executor (core 8, unbounded queue); `EmailNotificationService.notifyFollowersOfPost` queries and sends one mail per follower (`:95-114`) and an hourly digest `@Scheduled` (`:192`): fine at this size, but the queue can grow if the SMTP server hangs (timeouts are 10 s, `application.properties`).

## 4. Client weight

### 4.A Bundles (from source; `vite build` was not run; sizes are from the existing `client/dist`, a previous build, so treat as approximate)

- `App.jsx:6-30` lazy-loads every page except Home, Login, Registration, Logout and the Navbar. Good. Lexical, KaTeX (`MathNode.jsx` imports `katex` statically, but only the Viewer/Editor chunk loads it), dnd-kit (`ProfileArrange.jsx` only), `qrcode` (`AvatarPopup.jsx`, in the profile chunk) are all out of the initial bundle. `sanitize-html` and `react-contenteditable` appear only in the legacy `BasicTextPost.jsx`, which is on the profile and Discover path (sanitize-html is large; check it is really used before keeping it: `BasicTextPost.jsx` was the only file matching).
- Existing `dist` sizes (raw / gzip): initial `index-*.js` 446 KB / 147 KB, `index-*.css` 80 KB / 16 KB; `TileGridNode-*.js` (Lexical and the grid editor, loaded with the editor and viewer) 521 KB / 160 KB; `PostsViewer-*.js` 92 KB / 30 KB; `Editor-*.js` 49 KB / 16 KB; 59 KaTeX font files in `assets/` (browsers fetch only the woff2 they use).
- **Home pulls the tile-grid editor into the first bundle**: `Home.jsx:5` imports `TileGrid.jsx` (1 500+ lines of editor UI) and `tileGrid.js` (1 116 lines) statically only to draw a welcome paragraph with `editable={false}`. In the existing `index-*.js`, the grid editor's strings ("Magic wand", "Mono pixel", "Serif bitmap") are present, confirming it is in the initial chunk. Fix: `const TileGrid = lazy(() => import('.../TileGrid.jsx'))` in Home with a text fallback, or export a small read-only `GridView` that shares `renderGrid` but not the editor. Same for the two `TileGrid` users reachable from the Navbar-less first paint (`Home`).
- The Viewer imports every node type including `TileGridNode` -> `TileGrid.jsx` (the editor) because grids render through the same component: acceptable for a post page that has grids; for plain text posts a lazy import of the grid node would save about 160 KB gz, optional.
- Service worker (`public/sw.js`): caches `/assets/*` forever (correct, hashed) and serves navigations network-first; good. It never caches the API.

### 4.B Images

Responsive variants exist for uploaded post images and are used: `ImageNode.jsx:175-185` sets `srcSet`, `sizes`, `loading="lazy"`, `decoding="async"`. Variants are **not** produced or used for: avatars (`ProfileBanner.jsx:67`, `FollowingPage.jsx:56`, `DiscoverPage.jsx:15`, `MessagesPage.jsx:483,666`, `SearchPage.jsx:24`, `AvatarPopup.jsx:40`, `CommentItem.jsx:34`) and profile headers. `compressSquare` bounds avatars (`AuthController.java:~777`: max side set by the caller), so small ones are fine; none of those `<img>` tags has `loading="lazy"` or `width`/`height` (layout shift and eager loading of every avatar in a long Discover list or comment thread). Add `loading="lazy" decoding="async"` and explicit sizes to list avatars. Avatar lookups themselves: `CommentItem.jsx:24` keeps a per-session cache (good); `Home.jsx:27` does not (12 requests).

### 4.C Google Fonts: exact approach

Facts: `index.html:7-8` requests 24 families with about 50 weight/style faces up front, as one **render-blocking** stylesheet, plus two preconnects to third-party origins. The app font is `system-ui` (`index.css:20`), so none of these are needed to render the app chrome. Google's CSS API only downloads font files for faces whose text is actually on the page, so the transfer is mostly the stylesheet itself (several hundred `@font-face` rules because of per-script `unicode-range` splits: size **not measured**, estimate 50 to 150 KB), but a blocking third-party stylesheet delays first paint on every page, and every font is in the page's CSS font list for tile-grid measurement (`document.fonts.load` in `tileGrid.js:66-70` loads all 8 typeface families the first time a grid draws, even if only one is used).

Where the families are really used: page themes (`FONTS` in `components/PageTheme/theme.js:24`, applied via `--th-font-heading` / `--th-font-body` at `theme.js:359-360`), the tile grid typefaces (`TYPEFACES`, `tileGrid.js:49-58`, and `SMOOTH_FONT` JetBrains Mono at `:25`), and the code font option (`index.css`, `--code-font`).

Plan:
1. Delete the `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?...">` and keep only `preconnect` (or delete both; they are used only on demand).
2. Add `client/src/utils/fontLoader.js`:
   ```js
   const loaded = new Set();
   /** spec is the css2 family string, e.g. 'Playfair+Display:ital,wght@0,700;0,900;1,700' */
   export function ensureGoogleFont(spec) {
     if (!spec || loaded.has(spec) || typeof document === 'undefined') return;
     loaded.add(spec);
     const link = document.createElement('link');
     link.rel = 'stylesheet';
     link.href = `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
     document.head.appendChild(link);
   }
   ```
   (`display=swap` keeps text visible; this link is not render-blocking because it is inserted after load.)
3. In `theme.js`, give each `FONTS` entry a `google` field with its css2 spec and call `ensureGoogleFont` for the two chosen fonts when a theme is applied (`DocumentThemeLayers`/`PageTheme.jsx` effect), and in the ThemeEditor when the user previews a font (call it for the hovered/selected option only, or load the 24 on first open of the font select, not at startup).
4. In `tileGrid.js`, change `requestTypefaces()` (`:66-70`) to request only the typeface for the font in use: `ensureGoogleFont(TYPEFACES[font].google)` then `document.fonts.load(...)` for that one family; `drawSmoothChar` already redraws via `document.fonts.ready`.
5. Keep the self-hosted `Chococooky.woff2` in `public/fonts` as is. If Mae later wants **no third party at all** (privacy, CSP: `DEPLOYMENT.md` section 8 allows `fonts.googleapis.com` and `fonts.gstatic.com` only for this), self-hosting the OFL families as woff2 is the next step; that is a download and needs her yes with the licence checked (working rules).
6. Update the CSP note only if self-hosting; the on-demand approach needs no policy change.

Expected: first paint no longer waits on `fonts.googleapis.com`; a page with a default theme loads zero web fonts; a themed page loads one or two families.

### 4.D Canvas work for tile grids and wallpapers

- `TileGrid.jsx:335-356`: the draw `useEffect` has **no dependency array**, so it redraws the full canvas on every render of the component (pointer hover state, history tick, any parent re-render), and registers `document.fonts?.ready?.then(draw)` each time (an already-resolved promise: a redraw on the next microtask). Each draw runs `renderGrid` over `cols x rows` tiles at `SCALE = 4` (`tileGrid.js:20-22`: a 32 x 16 grid is 2048 x 1024 pixels). In the **viewer** (non-editing), a profile card or post with a grid should draw once per data change. Fix: dependency array `[data, editing, tool, selection, cursor, lasso, moveBy, active?.id, width, bump]` (list what `renderGrid` really reads) and redraw on `document.fonts.ready` once per mount in a separate effect; wrap the viewer's props in `useMemo`.
- Paint layers: each pixel layer is decoded from a PNG data URL into its own canvas per mount (`TileGrid.jsx:307-323`, `loadImage`), with no sharing across identical grids (home grid, repeated cards). For profile cards a cached rendered `ImageBitmap`/`<img>` per `data`-hash (like `wallpaper.js` already does) would avoid redecoding on every remount; low priority.
- Off-screen grids: nothing uses `IntersectionObserver` for grids (only the infinite scroll sentinel and the inbox). A post with many grids decodes them all at once; render lazily when scrolled near.
- `wallpaper.js:179-209`: cached by key with a cap of 40, good; each distinct wallpaper does one `toDataURL('image/png')` of the composed tile (`:202`), then stored as a CSS `url(data:...)` string, which can be megabytes of text in a style attribute and is re-parsed by the browser whenever it is reapplied: prefer `canvas.toBlob` + `URL.createObjectURL` (revoke on unmount). `useBodyWallpaper` (`:222-243`) re-applies on every `style` change only, fine.
- `solidPaint` and the grid editor call `toDataURL` on each stroke commit (`TileGrid.jsx:371` `savePaint`), which is by design (the stored format is PNG data URLs); each grid is capped server-side (`MAX_PAINT_CHARS`).
- `WaterTitle.jsx:197,294`: the animation loop `requestAnimationFrame(tick)` runs the wave equation over the whole grid, builds a new `ImageData` and calls `putImageData` **every frame for as long as Home is mounted**, though the comment says the title "renders at rest" (`:289-292`). Stop the loop when the wave energy is below a threshold and restart it from `mousemove/mousedown/touchstart`; also stop it when the tab is hidden (`visibilitychange`).
- `CursorGlow.jsx:17-27`: a permanent `requestAnimationFrame` loop that only updates a transform; run it only while the pointer is moving (set a flag in `onMove`, cancel the frame when position stops changing).
- `Viewer.jsx:217`: `localStorage.setItem('currentPostData', data.description)` on every post view, even for readers who cannot edit: a synchronous write of up to 5 MB on the main thread (may also throw on quota). Write it only when entering the editor.
- `useAutosave.js` (local draft autosave) is cheap: debounced 1.5 s, skips unchanged JSON, writes on hide (`useAutosave.js:22-100`); the lazy `data()` form avoids serialising on every keystroke. It does `JSON.stringify` of the editor state once per write, which is the right place.

## 5. nginx and static serving (copy-paste snippets; production config is **UNCONFIRMED**, merge with what exists)

What the docs say today: SPA fallback, `/api/` proxy, 50 MB body limit, `/uploads/` alias with a "...existing alias / expires lines..." placeholder (`DEPLOYMENT.md:410`), `/sw.js` and `/manifest.webmanifest` `no-cache` (`:380-381`), security headers (`:384-416`). Nothing documents `Cache-Control` for `/assets/`, `index.html`, gzip/brotli, HTTP/2 or any `proxy_cache`.

`add_header` inside a `location` replaces every header inherited from `server`, so put the security headers in one include and repeat it (as DEPLOYMENT.md section 8 requires):

```nginx
# /etc/nginx/snippets/webposting-security.conf  (the four headers from DEPLOYMENT.md section 8)
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header X-Frame-Options "DENY" always;
add_header Content-Security-Policy "default-src 'self'; ..." always;   # unchanged
```

```nginx
# http { } level, once
gzip on;
gzip_vary on;
gzip_comp_level 5;
gzip_min_length 1024;
gzip_proxied any;
gzip_types text/plain text/css application/javascript application/json application/xml
           application/atom+xml image/svg+xml application/manifest+json;
# Pre-compressed files if the build adds .gz next to them (optional): gzip_static on;

# micro-cache for the public SEO endpoints
proxy_cache_path /var/cache/nginx/webposting levels=1:2 keys_zone=seo:5m max_size=64m
                 inactive=30m use_temp_path=off;
```

```nginx
server {
    listen 443 ssl;
    http2 on;                       # nginx 1.25.1+; on older versions: "listen 443 ssl http2;"
    # ... existing ssl_*, server_name, root ...

    # Hashed build output (Vite puts a content hash in every file name): cache for a year.
    location /assets/ {
        include /etc/nginx/snippets/webposting-security.conf;
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;        # a missing hashed file is a 404, never the HTML shell
        access_log off;
    }

    # The shell and the files that must update at once.
    location = /index.html {
        include /etc/nginx/snippets/webposting-security.conf;
        add_header Cache-Control "no-cache";
    }
    location = /sw.js                { add_header Cache-Control "no-cache"; }
    location = /manifest.webmanifest { add_header Cache-Control "no-cache"; }

    # Icons, favicon, robots: a day.
    location ~* ^/(favicon-.*\.png|icons/.*|vite\.svg|robots\.txt)$ {
        include /etc/nginx/snippets/webposting-security.conf;
        add_header Cache-Control "public, max-age=86400";
    }

    # User uploads: file names are random UUIDs (UploadController.java:246, ProfileHeaderController.java:127,
    # AuthController avatars), a changed picture gets a new name, so they never change under the same URL.
    # Keep Range support for audio: do not add proxy buffering or strip Accept-Ranges.
    location /uploads/ {
        alias /srv/webposting/uploads/;                      # UPLOAD_DIR
        include /etc/nginx/snippets/webposting-security.conf;
        add_header Content-Security-Policy "default-src 'none'; sandbox" always;   # as in section 8
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # Public SEO endpoints: Spring already says "public, max-age=300" (SeoController.java:117),
    # nginx now honours it, so a crawler burst is one backend hit per URL per 5 minutes.
    location /api/seo/ {
        proxy_pass http://127.0.0.1:8080;       # keep the same proxy_pass form your /api/ block uses
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Cookie "";             # public content: never vary or cache by session
        proxy_cache seo;
        proxy_cache_key "$scheme$host$request_uri";
        proxy_cache_valid 200 5m;
        proxy_cache_valid 404 1m;
        proxy_cache_lock on;                    # one backend fetch for a thundering herd
        proxy_cache_use_stale error timeout updating http_500 http_502 http_503;
        add_header X-Cache-Status $upstream_cache_status;
    }

    # Larger body limit only where needed (the global 50m applies to every /api/ call today).
    location ~ ^/api/(upload|users/[^/]+/avatar|users/[^/]+/header)$ {
        client_max_body_size 30m;               # avatars 25 MB, audio 20 MB
        proxy_pass http://127.0.0.1:8080;       # same form as the /api/ block
        # ... same proxy_set_header lines as /api/ ...
    }
    location /api/ {
        client_max_body_size 7m;                # JSON is capped at 6 MB by RequestBodyLimitFilter
        # ... existing proxy_pass and headers ...
    }
}
```

Notes:
- **Brotli**: not in stock nginx; `gzip` already gets most of the gain for text. Only add `brotli on` if the module is installed (`libnginx-mod-http-brotli-*`), **UNCONFIRMED** on the server. HTML, CSS and JS from the build can be pre-compressed in `tools/release.sh` (`gzip -9 -k`) and served with `gzip_static on` to save CPU, optional.
- The README sample uses `proxy_pass http://127.0.0.1:8080/;` with a trailing slash that "strips the /api prefix" (`README.md:145-147`), while the controllers are mapped under `/api/...` (for example `@RequestMapping("/api/seo")`). Either the real config differs from the sample or a context path is set; I could not confirm which, so the snippets say "same form as your /api/ block".
- Do not cache `/api/` generally: many endpoints read the session cookie to decide what the caller may see (`canSee` in `PostController`). The only safe micro-cache candidates are `/api/seo/` and cookie-less public lookups such as `/api/users/recently-active`; per-user profile pieces (bio, avatar, theme) would show stale data to the owner after an edit, so prefer the combined summary endpoint over caching them.
- After changing nginx: `sudo nginx -t && sudo nginx -s reload`; check with `curl -sI https://webpost.ing/assets/<file>.js` for `cache-control` and `content-encoding: gzip`.

## Quick wins the lead can assign today (disjoint file sets)

Files being edited by other agents right now (from `git status`/diff at the time of reading): `PostTextExtractor.java`, `PostContentValidator.java`, the two tests next to them, `App.jsx`, `Navbar.jsx`, `Home.jsx`, `Registration.jsx`, `BasicTextPostServerApi.js`, `FeedController.java`, `SocialRepository.java` (the Discover work). Packages that touch those files must wait for those agents to finish or be handed to the same agent.

- **WP-A, indexes (independent, no collisions)**: create `server/src/main/resources/db/migrations/V018__performance_indexes.sql` with the body in section 1.B. Verify with the existing migration test (`./mvnw -q test -Dtest=...Migrat*`). Only file touched: the new migration.
- **WP-B, nginx and server operations (docs and examples only, Mae applies on the server)**: `guide/DEPLOYMENT.md` (add the section 5 snippets and the JVM/systemd block from section 3), `README.md` (nginx sample: `http2`, `/assets/`, gzip), `server-start.sh` (JVM flags, `JAVA_EXTRA_OPTS`), `config/deploy.env.example` (`TOMCAT_THREADS`, `JAVA_EXTRA_OPTS`), `server/src/main/resources/application.properties` (`server.tomcat.threads.max=${TOMCAT_THREADS:40}`, `server.tomcat.accept-count=50`). No code behaviour changes. Do not edit the live server.
- **WP-C, client fonts**: `client/index.html`, new `client/src/utils/fontLoader.js`, `client/src/components/PageTheme/theme.js` (+ `PageTheme.jsx` if the apply effect lives there), `client/src/components/PageTheme/ThemeEditor.jsx` (preview), `client/src/components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/tileGrid.js` (only `requestTypefaces` and `TYPEFACES` entries). Test: `cd client && npx vitest run`; browser check with a theme using Playfair Display and a grid in Script pixel.
- **WP-D, client render cost** (after Home.jsx is free): `client/src/components/Pages/Home/Home.jsx` (lazy TileGrid; request avatars from the list), `Home/WaterTitle.jsx` (stop loop at rest and when hidden), `client/src/components/CursorGlow/CursorGlow.jsx`, `TileGrid/TileGrid.jsx` (dependency array on the draw effect), `Pages/Posts/PostRenderer/RichTextPost/Viewer.jsx:217` (drop the `localStorage` write for readers; make sure the editor gets the body some other way: check `Editor.jsx` use of `currentPostData` first), avatar `<img>` tags get `loading="lazy"` (`ProfileBanner.jsx`, `FollowingPage.jsx`, `DiscoverPage.jsx`, `MessagesPage.jsx`, `SearchPage.jsx`, `CommentItem.jsx`).
- **WP-E, polling** (touches `App.jsx` and `BasicTextPostServerApi.js`, so run after the other agents finish): new `GET /api/me/counters` in `SocialController.java` (merging `getUnreadCount` + `getUnreadMessageCount` + `getTotalGroupUnreadCount`, with the throttled heartbeat UPDATE in the same method), `client/src/components/Navbar/useUnreadCounts.js` (one request, visibility pause, no `pathname` restart, back-off), `client/src/App.jsx` (remove the heartbeat interval), `BasicTextPostServerApi.js` (new `GET_COUNTERS`), `client/src/components/Social/MessagesPage.jsx` (visibility pause, slower list refresh). Tests: `SocialControllerTest`-style test for the new endpoint, `vitest` for the hook.
- **WP-F, server list payloads and indexes' queries** (after the Discover agent is done with `FeedController.java` and `SocialRepository.java`): migration `V019__post_previews.sql` (`card_preview`, `card_preview_done`, `search_text` + trigram index), `JdbcPostRepository.java` (page SELECT and `findById` unchanged, add `CASE` projection), `FeedController.java` (Following and Discover projections), `SocialRepository.java` (`discoverPosts`: `p.date < ?`, projection; `getUnreadMessageCount` rewrite; `parseAndSaveHashtags` one statement), a new small `PostPreview.java` in `posts/service/` that extracts the first grid and the plain text (reuse the traversal from `PostTextExtractor`, do not edit that file while it is in flux), and an admin backfill endpoint in `AdminController.java`. Tests: repository tests with the local test database.
- **WP-G, save path and search** (`PostController.java`, `StorageAccountService.java`; must follow WP-F because both set the preview/search columns on save, or be done by the same agent): `fitsQuota` early return and single-query total, one-column ownership query replacing `getUsernameFromPostId` callers, `findById` replaced by a size query in `updatePost`, skip hashtags for drafts, one-statement `syncPostUploads`, `searchPosts` using `search_text`. Tests: `PostContentValidatorTest`-adjacent controller tests, quota tests.
- **WP-H, profile summary endpoint** (new `ProfileSummaryController.java`, plus `PostsViewer.jsx` and `BasicTextPostServerApi.js`): one `GET /api/users/{u}/profile-summary` replacing the 11 small calls and the two full name lists. Largest client change of the set; do last.

Suggested order for today: A and B (no code risk), C, then D in parallel, E, F and G after the Discover agents hand back their files, H last.

## What I could not confirm

- Production nginx config (caching, gzip, HTTP/2, `proxy_pass` form), swap, PostgreSQL memory settings, table row counts, real post-body sizes, and whether the live JVM already runs with extra flags (the repo's `server-start.sh` and the documented unit have none).
- `octet_length(text)` not detoasting (PostgreSQL internals as I recall them; not run against a database).
- Current `dist` chunk sizes (from an older build in `client/dist`; the working tree has newer fonts and a Discover page).
- That no other list consumer reads `description` besides `firstGridOfPost` (checked three files by grep, see 1.A).
