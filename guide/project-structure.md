# Project Structure

## Overview

Full-stack blog/social platform. Frontend: React 18 + Vite. Backend: Spring Boot 3 + Java 21. Database: PostgreSQL (`testdb`). Deployed at webpost.ing via nginx reverse proxy.

---

## Directory Layout

```
webposting/
├── client/                    # React Vite frontend
│   ├── src/
│   │   ├── App.jsx/css        # Root component, global styles, routing
│   │   ├── config.js          # IMAGES_BASE_URL and other frontend constants
│   │   ├── components/
│   │   │   ├── Navbar/        # Top navigation bar + notification bell
│   │   │   ├── Pages/
│   │   │   │   ├── Auth/      # Login, Logout, AdminPanel
│   │   │   │   ├── Posts/     # Main post pages
│   │   │   │   │   ├── BasicTextPostServerApi.js   # ALL API calls (Axios)
│   │   │   │   │   ├── PostWindow.css              # Shared post page styles
│   │   │   │   │   ├── PostRenderer/
│   │   │   │   │   │   ├── BasicTextPost/   # Title-card post list item
│   │   │   │   │   │   └── RichTextPost/    # Lexical rich text editor + viewer
│   │   │   │   │   │       ├── Editor.jsx   # Full editor with toolbar plugins
│   │   │   │   │   │       ├── Editor.css
│   │   │   │   │   │       ├── Viewer.jsx   # Read-only post rendering
│   │   │   │   │   │       ├── ImageNode.jsx     # Lexical image decorator node
│   │   │   │   │   │       ├── MathNode.jsx      # LaTeX/KaTeX decorator node
│   │   │   │   │   │       └── CustomCodeNode.jsx # Syntax-highlighted code node
│   │   │   │   │   └── PostsViewer/         # Profile page + post list
│   │   │   │   │       └── PostsViewer.jsx
│   │   │   │   └── Activity/  # User activity page (comments + reactions)
│   │   │   ├── PatternPicker/ # Background pattern picker UI
│   │   │   │   ├── PatternPicker.jsx
│   │   │   │   ├── PatternPicker.css
│   │   │   │   └── patterns.js   # Preset definitions + isValidPattern()
│   │   │   └── Social/        # Comments, reactions, inbox, follow, notifications
│   │   │       ├── CommentItem.jsx
│   │   │       ├── DiscussionPage.jsx
│   │   │       ├── InboxPage.jsx
│   │   │       ├── NotificationBell.jsx
│   │   │       └── Social.css
│   │   └── test/              # Vitest unit tests
└── server/                    # Spring Boot backend
    └── src/main/java/.../
        ├── controller/
        │   ├── AuthController.java    # Login, logout, user profile, presets, background
        │   ├── PostController.java    # CRUD for posts, image uploads
        │   ├── SocialController.java  # Follows, DMs, reactions, notifications
        │   ├── DiscussionController.java  # Comments, comment reactions, votes
        │   └── AdminController.java   # Admin dashboard, user management
        ├── model/
        │   ├── Post.java
        │   ├── Notification.java
        │   └── AuthSession.java
        ├── repository/
        │   ├── JdbcLoginRepository.java   # User auth + in-memory session map
        │   ├── JdbcPostRepository.java    # Post CRUD + uploads
        │   └── SocialRepository.java     # Follow/DM/notification queries
        ├── validator/
        │   ├── PatternValidator.java     # CSS background pattern allowlist
        │   ├── EmojiValidator.java       # Reaction emoji allowlist
        │   ├── LoginRateLimiter.java     # Per-IP rate limiter for login
        │   └── RateLimiter.java          # Generic rate limiter
        └── config/
            └── SecurityConfig.java       # Spring Security + CORS config
```

---

## Auth System

- HTTP-only cookies: `username` (plain) + `authToken` (random UUID)
- **In-memory session map** (`loginMap` in `JdbcLoginRepository`): cleared on server restart
- After restart, users must re-login (cookies remain but session is gone → 401)
- `authorize(username, token)` returns `AuthSession` or null; throws `TokenExpiredException` if token expired
- All write endpoints check auth via `@CookieValue` + `loginRepository.authorize()`

---

## API Endpoints (key ones)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/login` | — | Sets cookies |
| POST | `/api/logout` | — | Clears cookies |
| GET/POST | `/api/posts` | POST requires auth | List/create posts |
| GET/PUT/DELETE | `/api/posts/{id}` | PUT/DELETE require ownership | Post CRUD |
| PUT | `/api/users/{u}/background` | Owner only | Profile wallpaper |
| GET/PUT | `/api/users/{u}/presets` | Auth + owner only | Saved pattern presets |
| GET/PUT | `/api/users/{u}/bio` | PUT: owner only | User bio |
| GET | `/api/users/{u}/storage` | Owner only | Storage usage |
| POST/DELETE | `/api/follow/{u}` | Auth | Follow/unfollow |
| GET | `/api/users/{u}/followers` | — | Follower list |
| GET/POST | `/api/messages/{u}` | Auth | DMs |
| GET | `/api/notifications` | Auth | Paginated notifications |
| POST | `/api/reactions/{postId}` | Auth | Toggle post reaction |
| POST | `/api/comments/{postId}` | Auth | Add comment |
| POST | `/api/comments/{id}/vote` | Auth | Vote on comment |

---

## Frontend API Layer

All API calls go through `BasicTextPostServerApi.js` using Axios with `withCredentials: true`. Key patterns:

- Axios rejects on non-2xx → `.catch(err => err.response.data)` to get error messages
- `fetch` (in PatternPicker) does NOT reject on non-2xx — must check `r.ok` explicitly
- `baseUrl` is hardcoded as `"/api"` (or `""` prefix) — see the open plan to centralize this

---

## Key Frontend State Patterns

- `localStorage.getItem('userName')` — logged-in username (set on login, cleared on logout)
- `useParams()` — URL params like `:username`, `:postId`
- IntersectionObserver for infinite scroll (sentinel div + `rootMargin: '200px'`)
- Lexical editor state: JSON blob stored in post `description` field

---

## PatternPicker / Background System

- Patterns stored as: `presetKey`, `paw-print:COLOR`, `stars:COLOR1:COLOR2`, `linear-gradient(...)`, or any of the above + `|#hexcolor` suffix
- `PatternValidator.java` validates before DB storage; same rules mirrored in `isValidPattern()` (patterns.js)
- Presets stored in `users.pattern_presets` as JSON `{ name: cssString }`
- Profile wallpaper stored in `users.background_pattern`

---

## Lexical Editor Nodes

| Node | File | Purpose |
|------|------|---------|
| `ImageNode` | ImageNode.jsx | Uploaded image with resize/align/move controls |
| `MathNode` | MathNode.jsx | KaTeX inline/block math |
| `CustomCodeNode` | CustomCodeNode.jsx | Syntax-highlighted code block |
