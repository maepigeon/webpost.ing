# Session 4 Changes

## Features Implemented

### Copy-to-clipboard button in post viewer
- **File:** `client/src/components/Pages/Posts/PostRenderer/RichTextPost/Viewer.jsx`
- Replaced `registerMutationListener` (unreliable) with `registerUpdateListener` + `useRef(false)` one-shot flag.
- Runs `querySelectorAll('code.editor-code')` only until code blocks appear (1–2 cycles after `setEditorState`), then returns immediately on all future calls — so text selection has zero overhead.
- Copy button is now appended **inside** the `<code>` element and positioned `absolute` top-right, styled to blend with dark code block backgrounds.
- **File:** `client/src/components/Pages/Posts/PostRenderer/RichTextPost/Editor.css` — updated `.code-copy-bar` to `position: absolute; top: 6px; right: 8px`.

### Account deletion
- **Backend:** `DELETE /api/users/{username}` in `AuthController.java` — requires auth as the target user, deletes in correct order to avoid FK violations (junction rows → posts → user), then clears session and cookies.
- **Repo:** `deleteUser(String username)` added to `LoginRepository` interface and implemented in `JdbcLoginRepository`. Deletes `users_posts_junctions` rows first (no CASCADE), then posts, then user (cascades to follows, reactions, comments, notifications, uploads).
- **Frontend:** `DELETE_ACCOUNT(username)` added to `BasicTextPostServerApi.js`. "Delete Account" button added to owner's profile page (`PostsViewer.jsx`) with two confirmation dialogs. On success, clears localStorage and redirects to home.

## Security Fixes

### Draft post leakage (server-side)
Three endpoints were exposing unpublished posts to unauthenticated users.

**`GET /api/posts/{id}`** (PostController.java)
- Now accepts optional auth cookies.
- If post is not published: requires valid session AND ownership — returns 404 otherwise (not 403, to avoid confirming existence).

**`GET /api/user/{username}`** (PostController.java)
- Now accepts optional auth cookies.
- Non-owners see only published posts. Owner (authenticated) sees all posts.

**`GET /api/posts`** (PostController.java)
- Was returning ALL posts including drafts.
- Now always filters to `published=true` only (uses existing `findByPublished` query).

## Known Remaining Gaps
- No rate limiting on login endpoint (brute-force risk).
- Passwords stored in plain text — known, documented in main README.
- `users_posts_junctions` FK lacks `ON DELETE CASCADE` from users — handled in `deleteUser` by manual cleanup order.
- No pagination on posts or notifications.
- Comment editing endpoint exists (`PUT /api/comments/{commentId}`) but no frontend UI for it yet.
