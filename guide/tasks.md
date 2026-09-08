# Priority Task List

Last updated: 2026-09-08

---

## Session — 2026-09-08 — Backlog

Ordered roughly by (value / risk). Items marked **[needs decision]** have a
question that changes the implementation; items marked **[dangerous]** touch
data or the running deployment and need hardening beyond ordinary auth.

### P0 — Deploy blockers (done this session)
- [x] **Wallpaper crash on profile pages** — `GET /api/users/{u}/background` returns
      text/plain whose body is JSON, so axios silently parsed it into an object and
      `parseWallpaper` threw `stored.trim is not a function`, blanking the page.
      Fixed at the root (`TEXT_GET` identity `transformResponse`) and hardened in
      `parseWallpaper`; 4 regression tests added.
- [x] **Wallpaper editor looked inert** — `handlePreset` carried the previous
      `bgColor` over, so a dark page background made every new preset invisible.
      Preset switch now resets `bgColor` to `DEFAULT_BG_COLOR`.
- [x] **Colour choices silently dropped** — native `<input type="color">` does not
      reliably fire `blur`; pattern colour slots now commit on the DOM `change`
      event, matching how the background input already worked.
- [x] **Migration runner could not apply V001** — `ScriptUtils.executeSqlScript`
      splits on `;` without understanding dollar quoting, shredding `DO $$ … $$`
      blocks. Prod had to be worked around by hand-seeding `schema_migrations`.
      Scripts containing a dollar-quoted block now go to the driver whole.
- [x] **Deployment runbook** — `guide/DEPLOYMENT.md`, written from the real host
      layout. `README.md` §5 was describing paths, a database name and a restart
      procedure that do not exist on the server.

### P1 — Correctness and hygiene
- [ ] **Fix themes** — needs a repro; investigate theme token application and
      persistence.
- [ ] **Fix broken editor features** **[needs decision]** — need the specific list
      of what is broken.
- [ ] **Remove the logout wait timer; detect and handle stale sessions** — sessions
      are in-memory, so a restart invalidates every token while the client keeps
      showing a logged-in UI. Auto-logout on any 401/empty `authorizeSession`.
- [ ] **Vulnerability audit** — full pass over endpoints for missing auth and
      ownership checks; report findings to Mae. See `guide/code-smells.txt`.
- [ ] **Clean up smelly code** — running list in `guide/code-smells.txt`.
- [ ] **Named post URLs** — slug-based `/users/{u}/posts/{slug}`, with the numeric
      id kept as a permanent redirect target.

### P2 — Product features
- [ ] **Set the real logo; remove the React logo** everywhere (favicon, PWA icons,
      any leftover Vite asset).
- [ ] **Logo: drop the on-load splash and the droplets**, keep the hover/click
      animation.
- [ ] **Report post** — user-facing report action; reported posts queue in the
      admin dashboard with reporter, reason and resolution state.
- [ ] **Admin fonts directory** — admin uploads a font file; it becomes selectable
      by every user immediately. Needs format allowlist (woff2/woff/ttf/otf),
      magic-byte validation and a size cap — fonts are executable-adjacent
      binaries served to every visitor.
- [ ] **Post font options** — font-family picker in the editor, sourced from the
      fonts directory above.
- [ ] **Preferences area** — one page for the settings below.
- [ ] **Email: connect and verify an address** — token-based double opt-in, with a
      documented SMTP configuration.
- [ ] **Email notifications** — per-type toggles (new DM, new post from someone you
      follow, post-publish receipt) plus a one-click unsubscribe link that works
      without logging in.
- [ ] **Email as a login option**, and password change gated on email verification.
- [ ] **Account deletion and data download** from Preferences (export already
      exists at `GET /api/users/{u}/export` — wire it up and add a copy-to-admin).
- [ ] **Responsive images** **[needs decision]** — generate width variants at upload
      and serve via `srcset`/`sizes`. Client-side bandwidth detection
      (`navigator.connection`) is unreliable and unavailable in Safari; `srcset`
      lets the browser decide, which is the better mechanism. Confirm before I
      build a bandwidth-sniffing path instead.
- [ ] **Make the app look less AI-generated** — design pass; see
      `guide/style-guide.md`. More skeuomorphism / 2.5D depth, fewer uniform
      cards-and-gradients, real typographic hierarchy.
- [ ] **Homepage pizzazz** — blurb about the app, visual interest.

### P3 — Admin operations **[dangerous]**
These put destructive, host-level power behind a web request. Each needs
admin-only auth *plus* a second factor of protection (re-authentication,
typed confirmation, rate limit, audit log, and IP allowlisting where possible),
because a single session-token compromise otherwise means total data loss.
- [ ] **Download database backup** — stream a `pg_dump` to the admin. Must never
      accept a path or a database name from the request.
- [ ] **Upload / create / merge databases** **[needs decision]** — restoring an
      uploaded dump is arbitrary SQL execution by definition. Proposal: restore
      only into a scratch database, diff it, and require an explicit second
      confirmation to promote. Merge semantics need to be specified (which side
      wins on a username or post-id collision?).
- [ ] **Delete database button** — I would like to talk you out of this one, or at
      minimum require a fresh backup to exist, a typed database name, and a
      re-entered password.
- [ ] **Upgrade / roll back the app from GitHub** **[dangerous]** — pull, build,
      migrate, restart, with a one-click revert to the previous release. Wants a
      release-directory + symlink layout so rollback is instant and does not
      depend on a rebuild succeeding.
- [ ] **Maintenance / migration landing page** — shown while an upgrade runs.
- [ ] **Admin panel mobile** — responsive layout.

### Carried over
- [ ] **Persistent sessions** — store tokens in the DB (subsumes part of the
      stale-session item above).
- [ ] **CSRF protection review**
- [ ] **Integration tests for auth flows**
- [ ] **Share post/comment to DM** — from the share button
- [ ] **Post list/collection on profile** — horizontal slider block
- [ ] **View as visitor on own profile**

---

## Completed (recent)

- [x] **Liquid glass dialog system** — promise-based `useDialog()` hook replaces all `window.confirm`/`window.alert` calls; `DialogProvider` wraps the app
- [x] **Post upvote/downvote** — `post_votes` table (V009 migration), `GET/POST /api/posts/{id}/vote`, vote bar in `Viewer.jsx`
- [x] **Wallpaper preset preview** — clicking a preset previews without saving; Apply/Cancel bar appears; Cancel reverts
- [x] **Avatar counts toward storage quota** — avatar uploads tracked in `uploads` table as `avatar/...`; quota check subtracts old avatar bytes
- [x] **15-second comment cooldown** — server-side minimum gap between comments, bypassed for admins
- [x] **React button hidden on own comments** — `me !== comment.authorUsername` guard in `CommentItem.jsx`
- [x] **Hashtag highlighting in editor** — `HashtagHighlightPlugin` wraps `#word` in styled spans with 150ms debounce
- [x] **Mobile hamburger navbar** — hamburger at ≤860px with glass slide-in panel; logged-out shows Log In directly
- [x] **Mobile post editor toolbar** — Format hamburger opens glass panel; Save controls always visible
- [x] **Deleted posts in My Activity** — `deletePost` logs deletion; `ActivityPage` shows post deletions by `item_type`
- [x] **Login page invite code link** — "Have an invite code? Create an account" link below login form
- [x] **Admin access to user profiles** — admins can view any user's activity page and storage stats; server-side `is_admin` check before returning data; frontend lets server decide (no client-side gate)
- [x] **New-post notifications** — followers notified when a post is published (both new-as-published and draft→publish)
- [x] **Mutuals indicator** — follow button shows "Mutuals" (purple) when both users follow each other; re-fetches status after following
- [x] **"Follows you" on profile** — shown next to the follow button when the viewed user follows the current user
- [x] **Post link in new_post notifications** — "mae published **[post title]**" with clickable link to post in inbox and bell dropdown
- [x] **Message + Block DMs moved above follower counts** — was in the header row; now sits between storage bar and follower counts
- [x] **BCrypt password hashing** — already implemented: admin-created users hashed at creation; plain-text legacy passwords auto-migrated to BCrypt on first login
- [x] **DB init script** — `config/database.sql` updated to full current schema (all 13 tables, correct column types, BCrypt-width password column)
- [x] **DB migration script** — `config/db-migrate-from-v1.sql` migrates from commit 00953d6 (3-table scratch schema) to current; runs in a transaction
- [x] **Preset save 404 fix** — `PatternPicker.jsx` was using relative fetch URL; fixed to use `BASE_URL` from `config.js`
- [x] **Image resize fix** — added `isResizingRef` to prevent controls disappearing when mouse leaves during drag
- [x] **Post name link in comment/reply/reaction notifications** — inbox and bell dropdown show clickable post title
- [x] **Infinite scroll: InboxPage notifications** — `IntersectionObserver` + paginated `GET_NOTIFICATIONS(limit, offset)`
- [x] **Infinite scroll: PostsViewer profile page** — `IntersectionObserver` + paginated `READ_POSTS_BY_USER`
- [x] **Centralize `baseUrl`** — `client/src/config.js` + `.env.development` / `.env.production`; all API files import `BASE_URL`
- [x] **Fix `vite.config.js`** — `resolve` block was outside `defineConfig`; moved inside
- [x] **CORS: localhost:5173** — added to `SecurityConfig.java` allowed origins
- [x] **Remove KeyRepeatPlugin** (buggy hold-key repeat)
- [x] **Fix EnsureLeadingParagraphPlugin** (was requiring Enter twice after heading/list)
- [x] **Rate limiting: login** — per-IP, 15 failures / 15 min window
- [x] **Rate limiting: messages, reactions** — `GenericRateLimiter`
- [x] **Server-side length limits** — title 255 chars, description 100 k chars
- [x] **Admin dashboard** — comment count + bytes + bg-pattern bytes per user
- [x] **Block DMs** — DB table, backend endpoints, frontend button on profile
- [x] **Activity page tab rename** — "Comments" → "Posts"
- [x] **Notification ownership** — `markRead` / `delete` return 404 for wrong user

---

## Security / Quality Backlog

- [ ] **Review all endpoints for missing auth/ownership checks**
- [ ] **Add integration tests for auth flows**

---

## Session — 2026-06-11 (continued)

### Completed
- [x] **Fix invite codes** — OffsetDateTime cast fixed (Timestamp→Instant); invalid code now 5-min block instead of 1hr; used/expired codes no longer block IP; username conflict no longer blocks IP
- [x] **External link dialog** — replaced `confirm()` with `linkWarning(url)` dialog variant; shows URL in monospace box, only "Continue →" button
- [x] **AvatarPopup component** — `Social/AvatarPopup.jsx` + CSS; glass popup with spring animation; clicking profile avatar in CommentItem and PostsViewer opens it
- [x] **Avatar bigger** — comment avatars 22→34px with border+shadow; profile header avatar 72→96px with glowing ring
- [x] **Online indicator** — glowing green dot (pulsing keyframe) overlaid on profile avatar + "Online" text; backend already provided `GET_USER_ONLINE`

---

## Session — 2026-06-12 / 2026-06-13

### Completed
- [x] **PatternPicker: scale/color load on refresh** — extended `useEffect([value])` to sync `customInput` via `inputDirtyRef`; scale and bg color now load correctly after page refresh
- [x] **PatternPicker: remove Apply button + preview bar** — custom input auto-applies on Enter/blur; removed "Previewing — save this wallpaper?" bar and `pendingPreset` system
- [x] **PatternPicker: scale slider live preview** — slider calls `onPreview` during drag, saves on pointer/key release via `commitScale`; fixed event-object bug (`typeof explicitScale === 'number'`)
- [x] **PatternPicker: save preset saves correct key** — `openSaveDialog` uses `findPresetByImage(v)` to detect built-in presets and saves the key (not raw CSS); user preset swatches render via `patternToStyle(css)`
- [x] **Recently online cards: bottom rim highlight** — replaced floating `inset 0 -14px 14px` glow with sharp `inset 0 -2.5px 0 rgba(255,255,255,0.58)` on Home.css and SearchPage.css
- [x] **Registration loopback 429 fix** — `InetAddress.getByName(ip).isLoopbackAddress()` handles IPv4-mapped IPv6 (`::ffff:127.0.0.1`); string-matching missed it
- [x] **Profile drag-and-drop: ungrouped posts above folders** — `closestCenter` was routing outer-list drags to folder inner contexts; redirect `overDispIdx` to folder container when active is outer but over lands in a folder post
- [x] **Group chat reactions** — `group_message_reactions` table (V013 migration); `POST /groups/{id}/messages/{msgId}/reactions` + `GET /groups/{id}/reactions` endpoints (rate-limited); frontend removes `!isGroup` guards; `TOGGLE_GROUP_REACTION` + `GET_GROUP_REACTIONS` in API
- [x] **Avatar in group chat messages** — `getGroupMessages` query now includes `u.avatar_path`; each non-mine group message shows a 22px circular avatar (with initial fallback) above the bubble
- [x] **Group owner cannot leave** — backend blocks `DELETE /groups/{id}/members/{username}` if user is the admin/owner; frontend hides "Leave" for owner row
- [x] **Group ownership transfer** — `PUT /groups/{id}/owner` endpoint; `transferGroupOwnership` in SocialRepository (sets all is_admin=FALSE then new owner=TRUE); `⇌` button in members panel (visible to owner only, not on own row); glass spring confirmation dialog
- [x] **Replace crown with "owner" badge** — `👑` replaced with an inline `owner` text badge (purple, styled with border + rounded)

### In Progress
- [ ] **Admin panel mobile** — needs responsive layout
- [ ] **Share post/comment to DM** — from share button
- [ ] **Post list/collection on profile** — horizontal slider block
- [ ] **View as visitor on own profile**
- [ ] **Homepage pizzazz** — blurb about the app, visual interest
- [ ] **Post font options** — font family picker in editor
- [ ] **Maintenance/migration landing page** — shown during deploy
- [ ] **UI polish** — more skeuomorphism/2.5D throughout
