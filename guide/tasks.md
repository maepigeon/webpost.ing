# Priority Task List

Last updated: 2026-06-13

---

## Pending

- [ ] **Persistent sessions** — sessions are in-memory; server restart logs everyone out. Fix by storing tokens in the DB.
- [ ] **CSRF protection review** — cookies + CORS cover the common cases, but worth an explicit audit.
- [ ] **Integration tests for auth flows** — no automated coverage of login, token expiry, or ownership checks.

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
