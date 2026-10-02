# Priority Task List

Last updated: 2026-10-01

---

## Session — 2026-10-02 — Toward deployment (Mae's list, in order of work)

Goal: 100% ready to deploy and user-ready. Keep going across sessions until done.

### Done today
- [x] Profile pictures compressed on upload (any size up to 25 MB → ≤512 px square).
- [x] One account of each user's storage (StorageAccountService), by section; header
      images recorded and charged; quota checks unified.
- [x] Empty profile: visitors no longer told to "create one".
- [x] Magic wand and pixel-perfect in the grid editor.

### Fonts
- [x] Choco Cooky, Comic Sans and Papyrus belong to the **post editor's** font list
      (Style row), not the grid editor's. Give the grid editor its own pixel versions
      instead, matching its design language.
- [x] All text in grids rendered at the grid's resolution (16×16 px a tile), never as
      smooth vector text over it.

### Grid editor: one design language, full featured
- [x] Every control in the grid editor as grid elements (pixel font labels, pixel
      icons, tile buttons); no system-styled text buttons, selects or number fields.
- [x] Symbol packs: an on-screen keyboard to click or tap symbols in.
- [ ] Full-featured: links (done), and audit for anything missing.

### Stickers
- [x] Sticker board insertion in all three places: profile, posts in text mode (done
      via Insert → Sticker), and on grid content.

### Posts and messages
- [ ] Audio (MP3) block in posts: upload, play/pause, restart, volume.
- [ ] Send grid posts in DMs.

### Settings
- [x] Collapse the Settings sections ("Your profile's look", "Site background", "Code
      blocks").
- [x] Put email notifications and email sign-up together.
- [x] Rewrite the clumsy explanations (e.g. "These are saved, but nothing is sent while
      email is off", "Turning this off silences everything below, whatever they are set
      to"). Plain, short, kind.

### UI quality (check regularly)
- [ ] Iconography clear, affordances obvious, UI consistent across pages.

### Deployment
- [ ] Everything organized and user-ready; deploy checklist green (guide/DEPLOYMENT.md).

## Session — 2026-10-01 — Backlog from Mae's requests

Status: [x] done (branch named), [~] in progress, [ ] to do.
**[needs decision]** = Mae's answer changes the build. See also
guide/HANDOFF-2026-09-30.txt for production state and open server work.

### P0 — Security and shipping
- [x] **Drafts readable by anyone through address lookups**: `/posts/{id}/canonical`,
      `/users/{u}/resolve/{slug}` and `/UserFromPostID/{id}` returned a draft's title,
      slug and author to anyone; ids are sequential, so every draft title was
      listable. Fixed on `claude/hotfix-draft-privacy` (branched from main;
      deploy first). Remaining, low: `/posts/{id}/discussion|features|reactions|views|vote`
      still answer for drafts with settings and counts (no content).
- [x] **Deploying is easy for Mae** (`tools/release.sh`, rehearsed; guide/DEPLOYMENT.md): one local `tools/release.sh` (test, build,
      upload) plus one server script she runs with sudo (back up, swap, restart,
      health-check, roll back). Health endpoint `/api/health`. Rewrite
      guide/DEPLOYMENT.md around it. Never build on the server.
- [~] **Vulnerability review**: done: draft leak, X-Forwarded-For trust, upload 500 → 400/401,
      write endpoints all authenticate, no SQL injection, profile links http(s) only.
      Open: upload orphan on failure, read-endpoint rate limits, draft metadata endpoints,
      CSRF (relies on SameSite=Lax cookies).
- [x] **Review tests for faked tests**: none found. Gap: most server tests mock the
      database, so SQL is untested (the sort_order bug passed them all). Add DB-backed
      repository tests (see ProfileOrderTest for the pattern).

### P1 — Bugs and quick fixes
- [x] **Profile arrangement**: order never stuck, posts repeated across pages, folders
      could not be moved past posts, posts could not leave folders.
      `claude/profile-drag-arrange` (arrange mode, keyboard dragging).
- [x] **Arrange mode "i" button** listing keyboard commands.
- [x] **Notifications button** goes to the notifications page; the sidebar one is
      smaller than the other buttons.
- [x] **Terminal theme**: remove the scanline overlay.
- [x] **Stickers cut off on posts** (pushpin, tape, heart, star).
- [x] **Avatars are squircles everywhere.**
- [x] **Theme editor Cards section** overflows its container; restyle its controls in
      the grid editor's pixel style (Colour, Opacity, Border, Border colour,
      Corners, Shadow, Texture).
- [x] **Pawprint texture**: tile in an ordered pattern, not scattered; paw colour
      options: one colour, random, downward rainbow, custom gradient with
      several colour stops.
- [ ] **Water title** burns CPU while idle; see HANDOFF §4. **[ask Mae first]**: she asked how it
      works, not for a change; don't modify it unless she asks.

### P2 — Grid editor
- [x] **Per-tile width** (single/double characters change only at the cursor or
      selection): grid v3, each text layer lists its `wide` tiles; older grids upgrade
      on load and in GridValidator. Written here from the handoff's description, so
      grid-fixes.patch on the server is superseded: don't apply it.
- [x] **Typing on a photo layer** (HANDOFF §3a) goes on a text layer above it.
- [x] **Typing lost after clicking a toolbar button or layer** (focus bug, HANDOFF §3b).
      Buttons no longer take focus; clicking a layer selects it (double-click or F2
      renames); a printable key with another tool picked switches to Text and types.
- [x] **Cursor in select mode**: arrows move it, Shift+arrows extend the selection.
- [x] **Skip occupied tiles while typing**: an Insert-key-style toggle button (and the
      Insert key) that makes typing jump over tiles that already hold a character.
- [x] **Keyboard shortcuts** for tools (⌥ + letter), undo/redo/copy/cut/paste, and a
      "Show shortcuts" panel (⌘/ or the keyboard button).
- [x] **Organise the panel**: Draw / Text / Image / Edit / Size rows, each named.
- [x] **Save grid as image** (PNG, 4 image pixels per grid pixel; Image row).
- [x] **Antialiasing option** (for smooth fonts and photos): the grid's Edges,
      Smooth or Pixel (`edges` in the grid; absent keeps the original look).
- [x] **Bake a photo layer** at the grid's pixel resolution ("Bake to pixels").
- [x] **Links in grids**: a run of tiles can carry a link; external links ask first.
      Select tiles, then Link (Edit row). Readers get a real link per tile (one tab
      stop per link); off by `linksActive={false}` inside profile cards. Links don't
      move with tiles yet.
- [~] Fewer sliders: buttons and dropdowns instead, across the UI. Done: theme
      editor, wallpaper pixel size, code block sizes. The grid editor's photo scale slider is gone too.

### P2 — Post editor
- [x] **Toolbar as a tidy grid**: headings in one "Heading" dropdown (H1/H2/H3),
      OL UL Link Image Code Math Grid, Post link, Style, Page grouped.
- [x] **Image resize by handles** on the image, not a percentage: post images
      (four corners, touch, arrow keys) and grid photo layers (corner handles,
      − / + buttons; the percentage slider is gone).

### P3 — Features **[needs decision]** before building
- [x] **Per-post themes** (V009): posts keep their own theme; changing the profile
      theme no longer restyles every post; the editor's Page menu opens the same
      tool. Existing posts kept today's look (the profile theme was copied onto each).
- [x] **Profile customisation page** (`/customize`), separate from Settings, opened from a button
      on your own profile.
- [x] **Profile banner as a grid** (V011, `users.banner_grid`): rows 1–4 fixed (user:
      name / n followers k following / joined date / public posts), avatar on the
      right spanning those rows, the rest editable with the grid editor on Customize.
      The header image stays, renamed "Card background image" (behind the bio).
- [x] **First grid shown on profile cards** (V010) for any post containing one, up to
      50% of the card's width in height (a taller grid shows its top above a dashed
      cut line), with a per-post switch in the editor's Page menu, "Grid on card".
- [ ] **Stickies, stickers and pixel fonts made with the grid editor**; place
      stickies anywhere on a profile or post; react to comments with stickers;
      save a post as a sticky; turn a sticky into a sticker.
      *Decide:* is a "sticky" a note pinned on a page and a "sticker" a reaction
      image, or the same thing in two sizes? Who may place stickies on whose page?
- [ ] **Forward/share grid posts**. *Decide:* forward = send in a DM, share = a link
      or copy onto your own profile?
- [ ] **More UI customisation built from grid mechanisms.**

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
- [x] **Remove the logout wait timer; detect and handle stale sessions** —
      `authorizeSession` now returns 401 rather than 200-with-empty-body, and one
      axios interceptor signs the user out and explains why. Logout is immediate.
- [ ] **Vulnerability audit** — full pass over endpoints for missing auth and
      ownership checks; report findings to Mae. See `guide/code-smells.txt`.
- [ ] **Clean up smelly code** — running list in `guide/code-smells.txt`.
- [x] **Named post URLs** — `/users/{author}/{id}-{slug}`. Leading with the id
      keeps lookups on the primary key and keeps every existing link working.

### P2 — Product features
- [ ] **Set the real logo; remove the React logo** everywhere (favicon, PWA icons,
      any leftover Vite asset).
- [x] **Logo: drop the on-load splash and the droplets**, keep the hover/click
      animation.
- [x] **Report post** — closed reason list plus optional detail; queue in a new
      admin tab with resolve/dismiss/reopen. One report per person per post.
- [x] **Admin fonts directory** — admin-only upload with an extension allowlist,
      magic-byte verification, a 2 MB cap and CSS-safe family names; served via a
      generated `/api/fonts.css`. Disabling is preferred over deletion.
- [ ] **Post font options** — font-family picker in the editor, sourced from the
      fonts directory above.
- [x] **Preferences area** — `/settings`, linked from the navbar.
- [x] **Email: connect and verify an address** — token-based double opt-in; see
      `guide/EMAIL.md`. Off by default (`MAIL_ENABLED`), and degrades cleanly
      when off rather than offering a verification that cannot arrive.
- [x] **Email notifications** — per-type toggles (DMs, new followers, posts from
      people you follow, publish receipts) plus one-click unsubscribe that works
      without logging in.
- [x] **Password reset by email** — confirmed addresses only, no account
      enumeration, single-use 1-hour tokens, ends every session on success.
- [ ] **Email as a *login* option** — signing in with an address instead of a
      username. The reset half is done; this is the remaining piece.
- [ ] **Account deletion and data download** from Preferences (export already
      exists at `GET /api/users/{u}/export` — wire it up and add a copy-to-admin).
- [x] **Responsive images** — 480/960/1600px variants generated at upload (V014),
      served via `srcset`; the `sizes` hint is capped on save-data and 2G.
- [x] **Image crop before upload** — dependency-free canvas dialog.
- [x] **Server-side upload verification** — decode-based, with a 40MP ceiling.
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

### Added this session
- [x] **Root error boundary** — a render error used to blank the page with no
      explanation, which is exactly how the wallpaper crash presented.
- [x] **`tools/backup.sh`** — database *and* uploads, verified. `pg_dump` alone
      would restore every post with its images broken.
- [x] **Post creation is transactional** — it was two statements, and a failure
      between them left an authorless post. 48 of 97 posts in the dev database
      are in that state.
- [ ] **Clean up the 48 orphaned posts** — see `guide/RECOMMENDATIONS.md` item 7.
- [ ] **CI** — `guide/RECOMMENDATIONS.md` item 3. Would have caught four separate
      breakages in this session before they reached a built artefact.
- [ ] **Rate-limit read endpoints** — writes are limited, reads are not.

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
