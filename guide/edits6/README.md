# Session 6 Changes

## New Features

### Liquid-glass dialog system (replaces window.alert / window.confirm)
- **`client/src/components/Dialog/Dialog.jsx`** (new) — `DialogProvider` + `useDialog()` hook. Returns promise-based `confirm(message)` and `alert(message)` functions. A single modal overlay is rendered at the app root; resolvers are stored in a ref so the same dialog instance handles all calls.
- **`client/src/components/Dialog/Dialog.css`** (new) — Glass popup: `rgba(255,255,255,0.78)` bg, `backdrop-filter: blur(28px)`, pop-in animation, Continue/Cancel buttons.
- **`client/src/main.jsx`** — Wrapped `<App>` with `<DialogProvider>`.
- **Migrated all `window.confirm` calls** in: `AdminPanel.jsx`, `CommentItem.jsx`, `InboxPage.jsx`, `BasicTextPost.jsx`, `PatternPicker.jsx`, `Editor.jsx` (FeatureTogglePlugin, SaveToolbarPlugin), `PostsViewer.jsx` (external link confirm), `Viewer.jsx` (external link confirm).
- **Exception:** The unsaved-changes navigation guard in `Editor.jsx` intentionally stays as `window.confirm` — it runs in a capture-phase event listener where async dialogs can't block navigation.

### Post upvote / downvote
- **`config/migrations/V009__post_votes.sql`** (new) — `post_votes(post_id, user_id, vote SMALLINT)` table. `CHECK (vote = ANY (ARRAY[1, -1]))`, cascading FKs to `posts` and `users`.
- **`SocialRepository.java`** — Added `votePost(postId, userId, vote)` (upsert/delete), `getPostScore(postId)`, `getUserPostVote(postId, userId)`.
- **`SocialController.java`** — `GET /api/posts/{postId}/vote` (auth optional, returns `{score, userVote}`), `POST /api/posts/{postId}/vote` (auth required, `{vote: -1|0|1}`).
- **`BasicTextPostServerApi.js`** — Added `GET_POST_VOTE(postId)` and `VOTE_POST(postId, vote)`.
- **`Viewer.jsx`** — Vote bar in post footer (▲ score ▼), vote state loaded on mount, active-state classes `.post-vote-btn--up` / `.post-vote-btn--down`.
- **`Viewer.css`** — Added `.post-vote-bar`, `.post-vote-btn`, `.post-vote-score` styles.

### Wallpaper preset preview (no auto-save)
- **`PatternPicker.jsx`** — Added `onPreview` prop. Clicking a preset calls `onPreview(cssValue)` for live preview without saving. A "Previewing — save this wallpaper?" bar appears with Apply/Cancel buttons. Cancel reverts to saved value.
- **`PatternPicker.css`** — Added `.pattern-swatch--pending`, `.pattern-picker-pending-bar`, `.pattern-picker-pending-label`.
- **`PostsViewer.jsx`** — Added `savedBgRef` to track last-saved wallpaper. `handleBgPreview` updates visual state only; `handleBgChange` saves to backend. `closeBgPicker` reverts preview to saved value.

### Avatar counts toward storage quota
- **`AuthController.java`** — Avatar upload now queries for existing `uploads` records with `filename LIKE 'avatar/%'`. Quota check uses `effectiveUsed = currentUsed - oldAvatarBytes + newFileSize`. Old avatar file + DB record deleted before inserting new record. Avatar filename stored as `"avatar/" + filename`.

### Comment rate limit (15-second minimum)
- **`DiscussionController.java`** — After the existing burst rate-limiter check, queries the user's most recent comment timestamp. If fewer than 15 seconds have passed, returns HTTP 429. Admins bypass this check.

### React button hidden on own comments
- **`CommentItem.jsx`** — React button conditional now includes `me !== comment.authorUsername`.

### Hashtag highlighting in editor
- **`Editor.jsx`** — `HashtagHighlightPlugin` uses `registerUpdateListener` + `TreeWalker` to find `#word` text nodes and wrap them in `<span class="editor-hashtag-token">`. 150ms debounce prevents thrashing on each keystroke.
- **`Editor.css`** — Added `.editor-hashtag-token` CSS (blue color, rounded background).

### Mobile navbar (hamburger menu)
- **`Navbar.jsx`** (rewritten) — Desktop items hidden at ≤860px. Hamburger (logged-in) or Login button (logged-out) appears at that width. Hamburger popup: fixed right panel with glass blur, slide-in animation, X close button, welcome greeting, simple Navbutton links (no dropdowns inside the panel).
- **`Navbar.css`** — Added `.nav-mobile-login`, `.nav-mobile-popup-welcome`, responsive breakpoint changed from 600px → 860px. `.nav-hamburger-wrap` only shown when logged in.

### Mobile post editor toolbar
- **`Editor.jsx`** — `ToolbarPlugin` split into `.toolbar-desktop` (desktop) and `.toolbar-mobile` (mobile). Mobile shows Format hamburger + Save controls. Format button opens a glass panel overlay with all toolbar sections. `mobileOpen` state + click-outside ref for the panel.
- **`Editor.css`** — Added `.toolbar-desktop`, `.toolbar-mobile`, `.toolbar-mobile-hamburger`, `.toolbar-mobile-panel-overlay`, `.toolbar-mobile-panel` and related styles.

### Deleted posts appear in My Activity
- **`PostController.java`** — `deletePost()` now captures title and calls `social.logDeletion(authorId, "post", info)` before deleting the row. `item_type = "post"`, summary = post title.
- **`ActivityPage.jsx`** — Deletions tab now renders comment deletions (link to discussion) and post deletions (title label + "(deleted)" badge) based on `d.item_type`.

### Login page: invite code link
- **`Login.jsx`** — Added "Have an invite code? Create an account" link below the form pointing to `/routes/NewAccount`.
- **`Login.css`** — Added `.login-submit-btn`, `.login-have-code`, `.login-register-link` styles. Submit button margin-top increased to 32px.

### Footer spacing
- **`Home.jsx`** — Footer padding increased from `16px 0 24px` → `24px 0 36px` (~50% taller).

---

## Bug Fixes

- **AdminPanel.jsx wrong import path** — `Dialog.jsx` import path was `'../../Dialog/Dialog.jsx'`; fixed to `'../../../Dialog/Dialog.jsx'` (3 levels up from `Pages/Auth/AdminPanel/`).
- **NotificationBell in mobile popup styling mismatch** — replaced the dropdown `<NotificationBell>` component in the mobile popup with a plain `<Navbutton label="Notifications" route="/inbox">`. Consistent styling; dropdown-inside-sidebar UX problem also eliminated.
- **`save` function not async in SaveToolbarPlugin** — had `const save = (published)` but called `await confirm()`. Fixed to `async`.

---

## Database Migrations

| Version | File | Change |
|---------|------|--------|
| V009 | `V009__post_votes.sql` | `post_votes` table with `post_id`, `user_id`, `vote SMALLINT` |

---

## API Endpoints Added

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/posts/{postId}/vote` | Optional | Returns `{score, userVote}` |
| POST | `/api/posts/{postId}/vote` | Required | Body `{vote: -1\|0\|1}`, returns updated `{score, userVote}` |

---

## Files Created

| File | Purpose |
|------|---------|
| `client/src/components/Dialog/Dialog.jsx` | Promise-based glass dialog provider + hook |
| `client/src/components/Dialog/Dialog.css` | Glass dialog styles |
| `config/migrations/V009__post_votes.sql` | Post votes DB migration |
| `server/.../resources/db/migrations/V009__post_votes.sql` | Server copy of migration |
