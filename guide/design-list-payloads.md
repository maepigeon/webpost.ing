# Design: list payloads, save cost, search, profile summary (2026-10-03)

Design-reviewer note for the next batch. Source: `performance-review-2026-10-03.md`
items 3, 6, 8, 9 and the code. Everything below was checked against the working
tree; line numbers are from today.

**Goal in one sentence:** list pages and saves stop moving post bodies, search
stops scanning them, and a profile view becomes two requests instead of
fourteen, without any post looking different.

## 0. Decisions (read these even if you skip the rest)

1. **Precomputed columns on `posts`** (`card_preview`, `search_text`,
   `preview_version`), filled by the repository on every save, backfilled by a
   **scheduled sweep** inside the server (not an admin one-off). The admin panel
   shows progress and has a "Run now" button, but nobody has to press it.
   Rejected: a per-card lazy endpoint (20 extra requests per page, bodies still
   read on every view) and a separate `post_previews` table (a join for no gain
   at this size).
2. **The preview is the grid JSON, capped.** The review's premise that "the
   first grid is small" is wrong for grid-only posts: one pixel layer may be
   700 000 characters (`GridValidator.MAX_PAINT_CHARS`), ten layers per grid, so
   the first grid can be the whole 5 MB post. Rule: the preview is the first
   grid's `grid` object if its JSON is at most **300 000 characters**, else
   NULL (the card shows title and description, like a post with "Grid on card"
   off). Pixel art of ordinary size is far under this; the sweep reports how
   many posts hit the cap so Mae can see whether it is zero. What would change
   my mind: if that count is not near zero, replace the JSON preview with a
   raster thumbnail made at save (a later design, needs server-side grid
   rendering).
3. **A `preview` field, not a fake `description`.** The review proposed
   returning a synthetic one-node Lexical document as `description` so the
   client needs no change. Rejected: it puts a lie in the API, and
   `BasicTextPost.jsx` still has a dead ContentEditable edit mode (lines 59-88,
   no caller passes `editMode`) that would save that lie back as the post.
   Instead every list item carries `preview` (grid object or null) and no body;
   the client reads `preview` when present and falls back to `description`
   when not, so client and server can land in either order.
4. **Quota: one SQL statement, no cache, no incremental counter.** A cache
   would reopen the check-then-insert race that `UploadController.lockFor`
   exists to close; a running counter drifts (cascading deletes, imports) and
   needs the truth query anyway. One statement with sub-selects returns the
   same breakdown `usage()` builds today, so `StorageAccountTest` passing
   unchanged is the proof of equivalence. Plus an early return for saves that
   do not grow.
5. **Search:** `search_text` + trigram GIN index. No separate interim step:
   the only window where body search is weaker is the few minutes the sweep
   needs after deploy (posts are then found by title only). If search must
   ship before V020 for some reason, the one-line interim is
   `p.summary ILIKE ?` in place of `p.description ILIKE ?`.
6. **Order:** client card change first (safe alone), then migration +
   repository + save path, then feeds/SEO and the profile summary. Each stage
   leaves the suite green and the site working.

Not in this design (other briefs): the V019 indexes (in flight), polling
(WP-E), nginx/JVM (WP-B). The V019 worker also edits `DatabaseSchemaTest`
and `MIGRATIONS.md`: land V019 before WP-1 starts.

## 1. Data model: migration V020

File `server/src/main/resources/db/migrations/V020__post_previews.sql`:

```sql
-- V020: what a post's card and search need, kept beside the body
--
-- card_preview: the post's first tile grid (the grid object of GRID-FORMAT.md),
--   or NULL when the post has none or its JSON is over PostPreview.PREVIEW_MAX_CHARS.
-- search_text: the post's plain text (PostTextExtractor blocks joined by
--   newlines, no markers), at most 20 000 characters; '' when none.
-- preview_version: 0 = not computed yet (the sweep fills it);
--   PostPreview.VERSION = computed by the current rule. Raising the constant
--   makes the sweep recompute every row.
-- Neither derived column counts toward the author's quota.
BEGIN;

ALTER TABLE posts ADD COLUMN IF NOT EXISTS card_preview text;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS search_text text;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS preview_version smallint NOT NULL DEFAULT 0;

-- pg_trgm is created in V001. Published posts only: drafts are never searched.
CREATE INDEX IF NOT EXISTS idx_posts_search_trgm
    ON posts USING gin (search_text gin_trgm_ops) WHERE published;

COMMIT;
```

Cost on the live database: the two nullable columns and the `NOT NULL DEFAULT 0`
column are catalogue-only on PostgreSQL 11+ (no rewrite); the index is built
over all-NULL values, milliseconds. **Do not use `CREATE INDEX CONCURRENTLY`**:
`DatabaseMigrator` runs each script as one statement batch inside the script's
own `BEGIN`/`COMMIT`, and CONCURRENTLY is refused inside a transaction. Safe to
run twice: every statement is `IF NOT EXISTS`. No index on `preview_version`:
`posts` is small and the sweep's probe is a one-row `LIMIT 1`.

Docs: add the three columns to `DATABASE_SCHEMA.md` (posts) and a line to
`MIGRATIONS.md`; `DatabaseSchemaTest` asserts the columns and the index.

## 2. `PostPreview` (new, `posts/service/PostPreview.java`, pure, static)

```java
public final class PostPreview {
    public static final int VERSION = 1;
    public static final int PREVIEW_MAX_CHARS = 300_000;
    public static final int SEARCH_MAX_CHARS = 20_000;

    /** gridJson: the first grid's "grid" object as JSON, or null; searchText: never null ('' when none). */
    public record Result(String gridJson, String searchText, boolean gridTooBig) {}

    /** Never throws: null, blank or unparsable content gives (null, "", false). */
    public static Result of(String cleanedDescription);

    /** What a list item puts under "preview": a Jackson RawValue of the stored
     *  preview, or when the row is not yet computed (bodyFallback != null) the
     *  grid found in the body on the fly, or null. */
    public static Object previewValue(String storedPreview, String bodyFallback);
}
```

Rules:
- First grid = depth-first, children in order, the first node with
  `type == "tilegrid"` and an object `grid` (the same walk as
  `firstGridOfPost` in `client/src/utils/gridPost.js`). Serialise `grid` with
  Jackson; if its length is over `PREVIEW_MAX_CHARS`, `gridJson = null,
  gridTooBig = true`. Do not modify the grid (the body was already cleaned by
  `PostContentValidator`, so it is normalised).
- `searchText` = `PostTextExtractor.extract(desc).blocks()`, each block's
  `text`, joined with `\n`, skipping `img` blocks with empty text, cut to
  `SEARCH_MAX_CHARS` (the extractor already stops at 20 000). No `#`/`- `
  markers (those are what `plain()` adds; they are noise for search and for
  the crawler excerpt). Grid text layers are included because the extractor
  already reads them.
- `previewValue`: `storedPreview != null` →
  `new com.fasterxml.jackson.databind.util.RawValue(storedPreview)`; else if
  `bodyFallback != null` → `of(bodyFallback).gridJson()` wrapped the same way
  or null; else null. `RawValue` serialises as raw JSON inside a `Map`, which
  is what the feeds return.
- Parsing twice (validator, then preview) is accepted for now: the first tree
  is garbage before the second is built, and it keeps `PostContentValidator`
  (in flux) untouched.

## 3. Where the columns are written, and how they stay right

| Path | What happens |
|---|---|
| Create, Save draft, Publish, autosave (`POST /posts`, `PUT /posts/{id}`) | `JdbcPostRepository.save`/`update` call `PostPreview.of(post.getDescription())` and write `card_preview, search_text, preview_version = VERSION` in the same INSERT/UPDATE. `validatePost` has already cleaned the body, so the preview matches what is stored. Nothing in `PostController` changes for this. |
| "Grid on card" switch (`PUT /posts/{id}/card-grid`) | No recompute. Every list projection applies it: `CASE WHEN p.card_grid THEN p.card_preview END`. The client keeps its own `cardGrid !== false` check too. |
| Public/private from the arrange menu (`PUT /posts/{id}/visibility`) | Today it does `findById` (whole body) then `update(post)`, which would now re-run the preview on every toggle. WP-2 replaces it with `UPDATE posts SET published=? WHERE id=?` and a three-column row read. |
| Admin import (`AdminController:453`, `SocialRepository:648`) | Inserts rows directly, so they land at `preview_version = 0`; the sweep picks them up within a minute. No change. |
| Rows not yet computed (`preview_version < VERSION`) | Lists select `CASE WHEN p.card_grid AND p.preview_version < ? THEN p.description END AS body` and compute the preview on the fly with `previewValue(null, body)` (today's cost for that row, nothing written). Search finds them by title only. The crawler excerpt falls back to the body the same way. |
| Rule change later | Raise `PostPreview.VERSION`; the sweep recomputes every row in the background; pages fall back on the fly meanwhile. |

## 4. The sweep (`posts/service/PreviewSweep.java`, `@Service`)

- `@Scheduled(fixedDelay = 2000, initialDelay = 30_000)`, guarded by property
  `app.preview-sweep.enabled` (default `true`; `false` in the test profile is
  optional, the sweep is harmless there).
- Each tick: if `idleTicks > 0`, decrement and return. Else
  `SELECT id FROM posts WHERE preview_version < ? ORDER BY id LIMIT 10`. Empty →
  `idleTicks = 30` (one cheap probe a minute from then on, which is how
  imported rows get caught without a restart). For each id, **one at a time**:
  `SELECT description FROM posts WHERE id = ?`, `PostPreview.of`,
  `UPDATE posts SET card_preview=?, search_text=?, preview_version=? WHERE id=? AND preview_version < ?`.
  At most one body (plus its Jackson tree, about 30 MB worst case) in memory.
- Counters (`AtomicLong`): `processed`, `tooBig`, `failed`, `lastError`,
  `lastRunAt`. Any exception: log a warning, set `idleTicks = 30`, continue
  next time (no tight loop on a persistent error).
- Restart mid-way: nothing to recover; progress is the per-row version, and
  the sweep resumes 30 s after boot.
- Concurrent user save: the save writes the three columns unconditionally;
  the sweep's `AND preview_version < ?` guard makes its stale write a no-op.
- Admin (`AdminController`, same `authorize`+`isAdmin` pattern as every route
  there): `GET /api/admin/previews` →
  `{ "version": 1, "remaining": n, "processed": n, "tooBig": n, "failed": n, "lastError": s|null, "lastRunAt": iso|null }`;
  `POST /api/admin/previews/run` → runs one batch synchronously, resets
  `idleTicks`, returns the same status. Admin panel, Stats tab: one line
  "Card previews: N remaining (M over the size cap)" and a "Run now" button.
  Expected run time: a site with 1 000 posts finishes in about 200 s.

## 5. Response shapes

**Card** (what every list carries per post; `preview` is a grid object as in
GRID-FORMAT.md v3, or null; no `description`):

```json
{ "id": 42, "title": "…", "slug": "…", "date": …, "published": true, "section": "profile",
  "folder": null, "sortOrder": 0, "summary": "…", "cardGrid": true, "preview": { "cols": 16, "rows": 8, "layers": [ … ] } }
```

| Endpoint | Shape after |
|---|---|
| `GET /api/user/{u}?section&limit&offset` | `Post[]` (the bean). `description` and `backgroundPattern` are **null**; `preview` added. The bean gets `@JsonRawValue @JsonProperty(access = READ_ONLY) private String preview;` (serialised as an object, never bound from a request body). `findById` is unchanged (editor and post page need the body). |
| `GET /api/feed/following`, `GET /api/feed/discover` | `{ "posts": [card + "username", "avatarPath"], "hasMore": bool }`; the `description` key is gone. |
| `GET /api/posts/{id}/card` | `{ id, title, slug, published, section, username, preview }`. |
| `GET /api/search/posts` | unchanged shape (`id, title, username`); query changes. |
| `GET /api/users/{u}/pinned-post` | unchanged (full `Post`); the summary below returns the pinned post as a card instead, and `PostsViewer` stops calling this. |
| `GET /api/seo/page` profile | HTML unchanged; excerpt now from `search_text`. |

Client (WP-4), `client/src/utils/gridPost.js`:

```js
/** The grid a card shows: the server's preview when it sends one, else the first grid of the body. */
export function cardGridOf(post) {
  if (!post || post.cardGrid === false) return null;
  if (post.preview !== undefined) {
    if (!post.preview) return null;
    try { return normaliseGrid(post.preview); } catch { return null; }
  }
  return firstGridOfPost(post.description);
}
```

`BasicTextPost.jsx`: `const grid = useMemo(() => cardGridOf(postdata), [postdata.cardGrid, postdata.preview, postdata.description]);`
and delete the dead edit mode (`Modes.EDIT`, `Editable`, `ContentEditable`,
`submitEditPost`, `UPDATE_POST` import; keep Edit/Delete buttons). Check with
`grep -rn "editMode" client/src` that only `TitleBar` (its own prop) remains.
`PostMessageCard.jsx:29`: `cardGridOf(post)`. Nothing else in list code reads
`description` or `backgroundPattern` (checked: `ProfilePostList`, `profileOrder`,
`PostsViewer`, `FollowingPage`, `DiscoverPage`, `SearchPage`, `viewAs`).

## 6. Profile summary (`GET /api/users/{username}/profile-summary`)

Public; cookies optional and used only to add the signed-in parts. One
request replaces these calls in `PostsViewer.jsx` lines 221-268:
`GET_POST_SECTIONS`, `GET_USER_BACKGROUND`, `GET_PROFILE_HEADER`,
`GET_PROFILE_BANNER`, `GET_USER_BIO`, `GET_USER_BIO_LINKS`, `GET_FOLLOWERS` +
`GET_FOLLOWING` (every username, just to count), `GET_BLOCK_MESSAGE_STATUS`,
`GET_PINNED_POST` (whole body), `GET_USER_AVATAR`, `GET_USER_ONLINE`, and the
`READ_POSTS_BY_USER(username, 50, 0, 'notes')` at line 231 that loads fifty
note bodies to count the published ones (the review missed this one). Stays
separate: `READ_POSTS_BY_USER` for the posts, `GET_USER_STORAGE` (owner/admin
only, the expensive one), the theme (`PageTheme` hook, shared with post pages),
`FollowButton`'s own status call, `AUTHORIZE_SESSION`.

```json
{
  "username": "mae", "joined": "2025-…", "online": true, "lastSeen": "…",
  "bio": "…", "bioLinks": [ { "label": "…", "url": "…" } ],
  "avatarPath": "/uploads/avatar/…" | null,
  "header": { "headerPath": null, "headerInk": "auto" },
  "background": "<wallpaper json or ''>",
  "banner": { "joined": "…", "publicPosts": 12, "cols": 32, "rows": 12, "grid": … },
  "counts": { "profile": 10, "notes": 3, "subscribers": 1, "drafts": 2 },
  "publicNotes": 2,
  "follows": { "followers": 5, "following": 7, "followsMe": false },
  "pinnedPost": <card> | null,
  "dm": { "blocked": false, "blockedByThem": false } | null
}
```

Rules: 404 for an unknown user. `counts` is exactly `countSections(username,
isOwner)` (owner keys only for the owner). `publicNotes` is a one-line count
(published notes) so the client stops loading bodies to count. `followsMe` is
"the profile owner follows the viewer" (what `following.includes(me)` computed);
null/false when signed out or owner. `dm` only for a signed-in non-owner, else
null. `online`: same five-minute rule as `AuthController:857`. `pinnedPost`:
card projection (no body) and the **same `canSee` rule as `getPinnedPost`**
(a pinned draft is the author's alone; this was a leak once, do not reintroduce
it). Field names match what `PostsViewer` already stores (`setHeader`,
`setBanner`, `setFollowCounts`, …) so the state code changes little.
Queries: one `users` row, `countSections`, `getFollowCounts`, and for a signed-in
viewer `isFollowing` and the DM block row; one card row if pinned. About six,
one round trip. Add `Cache-Control: private, no-store`. Keep the old endpoints
(other callers: `FollowListModal`, settings pages, the editor).

## 7. Quota and the save path (WP-2)

`StorageAccountService`:
- `usage(userId)`: `recordOldHeader` (1 query, keep), then **one statement**
  `WITH me AS (SELECT CAST(? AS INTEGER) AS id) SELECT (SELECT COUNT(*) FROM uploads, me WHERE user_id = me.id AND <POST_IMAGES>) AS post_images_count, (…SUM…) AS post_images_bytes, … FROM me`
  with one sub-select per figure the map holds today (files x4 count+bytes,
  renditions, posts content/themes/wallpapers count+bytes, the six `users`
  text columns, stickers/fonts/packs, comments, messages (dm+group),
  notifications). Build the same nested map from that one row. Then
  `fileLimitBytes` (1). Total 3 queries instead of about 27, same numbers.
- `fitsQuota(userId, add, freed)`: first line
  `if (addBytes <= freedBytes) return true;` (a save that does not grow can
  never breach the quota, and a user already over a lowered limit can still
  shrink). Then limit (1) + the statement (1).
- Verification: `StorageAccountTest` expectations unchanged; add one test for
  the early return; `UploadControllerTest` quota cases unchanged.

`PostController`:
- `private String ownerOf(long postId)`:
  `SELECT u.username FROM users_posts_junctions j JOIN users u ON u.id = j.user_id WHERE j.post_id = ?`
  (first row or null). Use it where `getUsernameFromPostId` only compares
  names: `getPostById:319`, `getUserByPostID:343`, `updatePost:522`,
  `setVisibility:582`, `deletePost:609`, `setPinnedPost:678`. Compare the
  way `LoginInfo.compareUsername` does (read it first; keep the same case
  rule).
- `updatePost`: drop `findById` (loads the old body). Replace with
  `SELECT published, COALESCE(octet_length(description),0) + COALESCE(octet_length(background_pattern),0) AS stored FROM posts WHERE id = ?`
  → `wasPublished`, `freedBytes`. Build the row to save from the request:
  `post.setId((int) id)`, trimmed folder, `uniqueSlugFor`, then
  `postRepository.update(post)` (`update()` already writes every field from
  the bean; `_post` was only a carrier). 404 when the row is missing.
- `setVisibility`: `SELECT published, section, title FROM posts WHERE id=?`,
  then `UPDATE posts SET published=? WHERE id=?`; when going public and
  `announces(section)`, run hashtags (read the body once there:
  `SELECT description FROM posts WHERE id=?`), then the existing notify logic.
- Hashtags only matter for published posts (`getPostsByHashtag` filters
  `published`): in create and update call `social.parseAndSaveHashtags` only
  when `post.isPublished()`; unpublishing leaves the rows (filtered anyway).
- `syncPostUploads`: keep for drafts (orphan cleanup must see draft images),
  but two statements:
  `DELETE FROM post_uploads WHERE post_id=?` then
  `INSERT INTO post_uploads(post_id, upload_id) SELECT ?, id FROM uploads WHERE filename = ANY(string_to_array(?, E'\n')) ON CONFLICT DO NOTHING`
  with the names joined by `\n` (upload names are UUID paths, never contain a newline).
- Daily-limit check in `createPost`: one query
  `SELECT rl.max_posts_per_day FROM users u LEFT JOIN role_limits rl ON rl.role = COALESCE(u.role,'user') WHERE u.id=?`
  plus the count, instead of three.
- `searchPosts`: `(p.title ILIKE ? OR p.search_text ILIKE ?)` in both
  branches; keep the `%`/`_` escaping. With V019's partial date index and the
  V020 GIN index this is an index scan for queries of three characters or more.
- `postCard` (`/posts/{id}/card`): select `card_preview, preview_version,
  CASE … description END AS body`, return `preview` via
  `PostPreview.previewValue`, drop `description`.

Expected save: authorize (memory), owner (1), gate (1), size row (1), quota
(2), slug (1-2), update (1), uploads (2), hashtags when published (2 with
WP-3's rewrite), notifications on first publish only. About 10 queries and no
old body loaded, from about 35 and three body copies.

## 8. Feeds, Discover, SEO, hashtags (WP-3)

- `FeedController.following`: select
  `p.id, p.title, p.date, p.slug, p.card_grid, CASE WHEN p.card_grid THEN p.card_preview END AS card_preview, CASE WHEN p.card_grid AND p.preview_version < ? THEN p.description END AS body, author.username AS author, author.avatar_path`
  (drop `p.published`, it is always true), and
  `post.put("preview", PostPreview.previewValue((String) r.get("card_preview"), (String) r.get("body")))`;
  no `description`. Same mapping for `discover`.
- `SocialRepository.discoverPosts`: same projection; cursor becomes
  `(?::timestamptz IS NULL OR p.date < ?::timestamptz)` (the client sends a
  millisecond-aligned time, so it is equivalent to the `date_trunc` form and
  lets `idx_posts_pub_date` serve the range).
- `SocialRepository.parseAndSaveHashtags(int postId, String content)`: same
  signature; after extracting tags, one `DELETE` and one statement:
  `WITH ins AS (INSERT INTO hashtags(tag) SELECT unnest(string_to_array(?, ',')) ON CONFLICT (tag) DO NOTHING) INSERT INTO post_hashtags(post_id, hashtag_id) SELECT ?, h.id FROM hashtags h WHERE h.tag = ANY(string_to_array(?, ',')) ON CONFLICT DO NOTHING`
  (tags are `\w` only, so a comma join is safe). Skip both when the tag set is empty.
- `SeoController.profilePage` (lines 363-372): select `p.search_text,
  p.preview_version` and `CASE WHEN (p.summary IS NULL OR p.summary = '') AND p.preview_version < ? THEN p.description END AS description`;
  `describe()` (line 275): summary → else, when `preview_version >= VERSION`,
  `PostTextExtractor.shorten(search_text, 160)` → else today's
  `extract(description).excerpt(160)`. `onePost` for the post page keeps the
  body (it renders the blocks).

## 9. Failure modes and the test for each

| Failure | Behaviour | Test |
|---|---|---|
| V020 fails at boot (server will not start) | Every statement is `IF NOT EXISTS`; pg_trgm exists since V001 | `DatabaseMigratorTest` runs the set twice; `DatabaseSchemaTest` columns + index |
| `PostPreview.of` meets odd content | Catches everything, returns `(null, "", false)`; a save never fails because of the preview | `PostPreviewTest`: garbage, empty, non-object root, grid without `grid`, grid nested in a list, two grids (first wins), over-cap grid (`tooBig`), text with no markers, 20 000 cap |
| Preview over the cap | Card shows title + summary; sweep counts it | `PostPreviewTest`; `ProfilePagingTest`: list item `preview == null`, `cardGrid == true` |
| Row not yet computed | On-the-fly fallback; nothing written | `ProfilePagingTest`/`FeedControllerTest`: insert, `UPDATE posts SET preview_version = 0`, list still returns the grid |
| Sweep vs. user save | Save wins (`preview_version < ?` guard) | `PreviewSweepTest`: row at `VERSION` untouched; row at 0 filled; second batch returns empty |
| Sweep hits a bad row / SQL error | Logs, idles 30 ticks, resumes | `PreviewSweepTest` with a closed-over failing JdbcTemplate is optional; at least assert counters |
| Restart mid-sweep | Resumes after 30 s from the per-row marker | covered by the above (no in-memory state needed) |
| Old client, new server | Cards without grids until the bundle refreshes (navigations are network-first) | ship WP-4 first; manual check |
| New client, old server | `preview` undefined → body fallback | `gridPost.test.js`: `cardGridOf` with no `preview` key |
| "Grid on card" off | `preview` null in every list though `card_preview` is stored | `PostCardGridTest` extension |
| Quota statement wrong | Numbers differ from today | `StorageAccountTest` unchanged expectations |
| Draft text leaking through `search_text`/`card_preview` | Search filters `published`; lists apply the same visibility as before; crawler profile only published | `PostAuthorizationTest`: a draft is not found by its body text; visitor list has no draft |
| Pinned draft in the summary | Same `canSee` as `getPinnedPost` | `ProfileSummaryTest`: visitor gets `pinnedPost: null` |
| Hashtags no longer saved for drafts | Rows appear on publish from editor and from the arrange menu | `PostControllerTest`: draft save → no rows; publish → rows; `/visibility` publish → rows |
| `setVisibility` after the change | Still notifies once | existing tests in `PostControllerTest` |

Client: `cd client && npx vitest run` and a browser look at a profile, Following,
Discover, a post card in a DM, and the admin Stats line, desktop and phone,
light and dark. Confirm in the Network panel that `/api/user/{u}` is tens of KB
for a profile that was MBs.

## 10. Work packages (disjoint files) and order

**Stage 0** (safe alone, 20 minutes; ship before anything below)
- **WP-4, client cards** (`implementer`, Sonnet). Files: `client/src/utils/gridPost.js`,
  `client/src/components/Pages/Posts/PostRenderer/BasicTextPost/BasicTextPost.jsx`,
  `client/src/components/Social/PostMessageCard.jsx`, new `client/src/test/gridPost.test.js`.
  Section 5. Remove the dead edit mode. No other files.

**Stage 1** (parallel)
- **WP-1, columns, preview, repository, sweep** (`senior-engineer`, Opus: a
  migration with a backfill and the save path are on the hard list). Files:
  `server/src/main/resources/db/migrations/V020__post_previews.sql`,
  new `posts/service/PostPreview.java`, new `posts/service/PreviewSweep.java`,
  `posts/repository/JdbcPostRepository.java`, `posts/repository/PostRepository.java`,
  `posts/model/Post.java`, `posts/controller/AdminController.java` (the two
  routes only), `server/src/main/resources/application.properties` (the
  property), tests `PostPreviewTest`, `PreviewSweepTest`, `DatabaseSchemaTest`
  (three columns, one index), `ProfilePagingTest` and `PostCardGridTest`
  (extend), docs `guide/DATABASE_SCHEMA.md`, `guide/MIGRATIONS.md`. Sections
  1-4 and the profile list row of section 5. Grep callers of
  `getPostsFromUsername` first; it now returns cards without bodies (the user
  export has its own SQL at `SocialRepository:599`, unaffected). **Write
  `PostPreview.java` first and report it**, so WP-3 can start.
- **WP-2, quota and save path** (`implementer`, Sonnet). Files:
  `posts/controller/PostController.java`, `posts/service/StorageAccountService.java`,
  tests `StorageAccountTest` (add one), `PostControllerTest`, `PostAuthorizationTest`
  (extend). Section 7. Uses only `jdbc` and existing repository methods, so it
  does not wait for WP-1; the `search_text` query compiles today and is
  exercised once V020 is applied (run the server tests after WP-1 lands).

**Stage 2** (parallel, after WP-1 has committed `PostPreview.java` and V020)
- **WP-3, feeds, Discover, SEO, hashtags** (`implementer`, Sonnet). Files:
  `posts/controller/FeedController.java`, `posts/repository/SocialRepository.java`,
  `posts/controller/SeoController.java`, tests `FeedControllerTest`,
  `SeoControllerTest` (extend). Section 8.
- **WP-5, profile summary and admin panel** (`implementer`, Sonnet). Files:
  new `posts/controller/ProfileSummaryController.java`, new test
  `ProfileSummaryTest.java`, `client/src/components/Pages/Posts/PostsViewer/PostsViewer.jsx`,
  `client/src/components/Pages/Posts/BasicTextPostServerApi.js`
  (`GET_PROFILE_SUMMARY`, `ADMIN_PREVIEW_STATUS`, `ADMIN_PREVIEW_RUN`),
  `client/src/components/Pages/Auth/AdminPanel/AdminPanel.jsx` (Stats line +
  button). Sections 4 (panel) and 6. Read `PostsViewer.jsx` lines 130-270 in
  full before editing; keep every `useState` name.

**Stage 3**: `integrator` (full suites, build), `screen-checker` on profile,
Following, Discover, DM card, admin Stats. Then `project-structure.md` rows
for the new files (integrator).

## 11. What Mae decides or does

- The 300 000-character preview cap (section 0.2). Default stands unless the
  sweep's "over the size cap" count on the admin Stats line is not near zero
  after deploy; then ask for the raster-thumbnail design.
- Derived columns are not charged to the quota (bounded by the caps; charging
  them would make an unchanged post "grow" after deploy). Say if she disagrees.
- Nothing to run on the server by hand: V020 applies at start-up, the sweep
  starts 30 s later and finishes in minutes; she can watch the count in the
  admin panel. One deploy carries all five packages.
- Look at the card of a grid post, a text post, and a post with "Grid on card"
  off after deploy; they should be pixel-identical to before.
