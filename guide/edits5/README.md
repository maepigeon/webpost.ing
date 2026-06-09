# Session 5 Changes

## Security

### Rate limiting on login endpoint
- **File:** `server/src/main/java/.../validator/LoginRateLimiter.java` (new)
- In-memory per-IP limiter: 5 failures within 15 min → 15-min lockout. State clears on server restart (acceptable trade-off; no persistence needed).
- **File:** `server/.../controller/AuthController.java`
  - `loginSessionAttempt` now injects `HttpServletRequest`, checks `LoginRateLimiter.isBlocked(ip)` before processing, calls `recordFailure(ip)` on 403, `recordSuccess(ip)` on 200.
  - Returns HTTP 429 with message when IP is blocked.

### Emoji validation on reactions
- **File:** `server/.../validator/EmojiValidator.java` (new)
  - Allowlist of permitted emoji strings. Must stay in sync with frontend REACTION_EMOJIS / REACTIONS constants.
- **Files:** `SocialController.java` (post reactions) and `DiscussionController.java` (comment reactions)
  - Both now call `EmojiValidator.isValid(reaction)` and return 400 Bad Request on invalid emoji.
  - Previous checks were length-only (vulnerable to arbitrary emoji/text).

### Delete account restricted to admin-only
- Removed the "Delete Account" button from the user profile page (`PostsViewer.jsx`).
- Backend `DELETE /api/users/{username}` now requires `is_admin = true` in the database. Uses a direct `jdbc.queryForObject` check.
- Admin-panel's `DELETE /api/admin/users/{username}` (via `AdminController`) remains the correct path for account deletion.

## UI

### Reactions: show only reacted emojis + expand button
- **Files:** `CommentItem.jsx` and `ReactionBar.jsx`
- **Before:** All 6 emojis always shown to logged-in users.
- **After:**
  - Only emojis with `count > 0` (or that the current user has reacted) are shown.
  - Logged-in users see a `+` button that expands to show the remaining emojis as a picker.
  - Clicking a picker emoji adds the reaction and collapses the picker.
- **CSS:** Added `.comment-reaction-expand`, `.reaction-expand`, `.comment-reaction-picker-item`, `.reaction-picker-item` to `Social.css`.

### Paws pattern color regression fix
- **File:** `PatternPicker.jsx`, `extractParameterizedKey` function
- **Bug:** When a background color was set alongside the paws preset, the stored value becomes `'paw-print|#xxxxxx'`. The `isPaw` check used raw `v` instead of `stripBgColor(v)`, so `v.startsWith('paw-print:')` failed and the full 20-gradient CSS was saved as the value. This caused `patternToStyle` to render the pattern with `backgroundSize: '20px 20px'` instead of `152px 152px`, completely breaking the paw tile layout.
- **Fix:** Use `const base = stripBgColor(v)` before the `isPaw`/`isStars` checks.

## Documentation

### Database schema
- **File:** `guide/edits5/DATABASE_SCHEMA.md` (new)
- Full schema for all 14 tables with column types, constraints, cascade rules, and common SQL queries for admin operations.

## Session 5b additions

### BCrypt password hashing
- `users.password` column widened from `VARCHAR(32)` to `VARCHAR(72)` via `ALTER TABLE`.
- `JdbcLoginRepository.authenticate()` now does dual-check migration: if stored hash starts with `$2a$`/`$2b$`/`$2y$`, verify with BCrypt; otherwise compare plain text — if it matches, rehash and update the DB row automatically (transparent migration on next login).
- `AdminController.createUser()` now hashes new passwords with BCrypt before INSERT.
- Existing accounts migrate lazily on next login; no batch migration needed.

### User search (`/search`)
- **Backend:** `GET /api/users/search?q=` in `AuthController` — case-insensitive `ILIKE %query%`, returns up to 20 usernames. Added `SocialRepository.searchUsers()`.
- **Frontend:** `SearchPage.jsx` + `SearchPage.css` at `/search`. Debounced input (300ms), updates URL query param, shows clickable user list. Linked from navbar ("Search" button).

### Following/followers popup on profile
- **Backend:** `GET /api/users/{username}/follow-counts` added (returns `{followers: n, following: n}`). Existing `/followers` and `/following` list endpoints reused for popup content.
- **Frontend API:** Added `GET_FOLLOW_COUNTS`, reused `GET_FOLLOWERS`/`GET_FOLLOWING` (already existed).
- **FollowListModal.jsx + FollowListModal.css** — modal with blurred overlay, closes on Escape or click-outside, shows list of usernames as links.
- **PostsViewer.jsx** — loads follow counts on mount, shows "X followers / X following" buttons at the bottom of the bio card. Clicking opens the modal.

### Activity page (`/activity/:username`) — private
- **Backend:** `GET /api/users/{username}/activity` in `AuthController` — requires auth as the path username, returns `{comments: [...], reactions: [...]}`.
  - Comments include: `id, content, created_at, score, parent_id, post_id, post_title, post_owner`
  - Reactions include: `reaction, post_id, post_title, post_owner`
- **Frontend:** `ActivityPage.jsx` + `ActivityPage.css` at `/activity/:username`. Tabs for Comments and Reactions. Comments show post context, score, reply badge, timestamp. Reactions show emoji + post link. If not the owner, shows "This page is private." Linked from navbar ("Activity" link, logged-in only).

### Neoskeuomorphic buttons on profile glass card
- **PostWindow.css** — `.follow-count-btn` with dual-layer shadow: outset dark + outset light highlight + inset highlight. Creates the raised-glass-on-glass appearance.
- Broad CSS rule targeting `button` inside `.profile-header-card` (excluding pattern swatches, reaction buttons) applies the same neoskeuomorphic shadow effect to all profile action buttons (Wallpaper, Message, Edit bio, etc.).

## Known Remaining Gaps

- Password hashing (BCrypt) — currently plain text in `users.password VARCHAR(32)`
- Pagination for posts list and notifications
- Block DMs from specific users (`blocks` table not yet created)
- `EmojiValidator.ALLOWED` must be manually kept in sync with frontend emoji lists
