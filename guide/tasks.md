# Priority Task List

Last updated: 2026-06-11

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
