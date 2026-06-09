# Priority Task List

Last updated: 2026-06-09

---

## In Progress / Needs Verification

- [ ] **Preset save not persisting** — `saveUserPresets` now shows error message when server returns non-2xx (instead of silently failing). Need to determine exact error. Check `presetSaveError` in PatternPicker UI after attempting a save.
- [ ] **Image resize fix** — Added `isResizingRef` to prevent controls from disappearing during drag. Need user to verify.

---

## Pending

- [ ] **Infinite scroll: InboxPage notifications** — load notifications in pages, lazy-load on scroll (same IntersectionObserver pattern as PostsViewer)
- [ ] **Centralize `baseUrl`** — Three files hardcode `var baseUrl = "/api"`. Move to `client/src/config.js` + `.env.development`/`.env.production`. Fixes localhost dev setup.
- [ ] **Fix `vite.config.js` syntax error** — `resolve` block is outside `defineConfig`. Move inside.
- [ ] **CORS: add localhost:5173** — So the app can be run locally during development without CORS errors.
- [ ] **Rebuild + redeploy server** — All outstanding backend changes need a new JAR built and server restarted on prod.
- [ ] **Confirm analytics fix** — Admin dashboard comment_bytes / bg_pattern_bytes should now show non-zero after server rebuild (was 0 with old JAR).

---

## Completed (recent)

- [x] Remove KeyRepeatPlugin (buggy hold-key repeat)
- [x] Fix EnsureLeadingParagraphPlugin (was requiring Enter twice after heading/list)
- [x] Fix profile card transparency (0.38 → 0.54)
- [x] Fix Edit bio button styling (dark inline style → neo CSS class)
- [x] Fix "mae:" → "mae sent you a message:" in notifications + inbox
- [x] Fix activity page score position (between date and title)
- [x] Fix comment reaction button position (inline with Reply/Edit/Delete)
- [x] Add visible error feedback for wallpaper save failures
- [x] Infinite scroll: PostsViewer profile page
- [x] Rate limiting: login (per-IP, 15 failures/15min)
- [x] Rate limiting: messages, reactions (GenericRateLimiter)
- [x] Server-side length limits: title 255 chars, description 100k chars
- [x] Admin dashboard: comment count + bytes + bg pattern bytes per user
- [x] Block DMs: DB migration + backend + frontend
- [x] Activity page tab rename 'Comments' → 'Posts'
- [x] Notification ownership fix (markRead/delete return 404 for wrong user)

---

## Security / Quality Backlog

- [ ] BCrypt password hashing (passwords currently plain text in DB)
- [ ] Persistent sessions (survive server restart; currently in-memory only)
- [ ] CSRF protection review
- [ ] Review all endpoints for missing auth/ownership checks
- [ ] Add integration tests for auth flows
