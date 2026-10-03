# Project structure — where things are

Map of the COMMITTED code at `5adaa1f` (2026-10-03). How to work: [WORKING-HERE.md](WORKING-HERE.md).
Files that were mid-edit when this was written are listed at the end, not described.
Everything below was checked against the code with grep; if you add a file, add a row.

## 1. Overview

- **Stack**: Spring Boot 3.4 (Java 21) + `JdbcTemplate` (no JPA) + PostgreSQL in `server/`; React 18 + Vite + Lexical + axios + react-router in `client/`; nginx in front; one 2 GB server.
- **Request path**: browser → nginx → static site from `client/dist` (SPA) or `/api/...` and `/uploads/...` → Spring Boot → PostgreSQL. nginx is not in the repo (see [DEPLOYMENT.md](DEPLOYMENT.md)); a release never changes it.
- **URLs (client routes, `client/src/App.jsx`)**: `/` Home, `/{username}` profile, `/{username}/{slug-or-id}` a post, `/{username}/{post}/discussion`, `/editor` and `/editor/:id`, `/inbox`, `/following`, `/discover`, `/messages`, `/search`, `/activity/:username`, `/settings`, `/customize`, `/stickers`, `/verify-email`, `/unsubscribe`, `/reset-password`, `/forgot-password`, `/routes/Login|Logout|AdminPanel|NewAccount`. Static routes win over `/:username` (reserved names: `ReservedUsernames.java` and `client/src/utils/reservedUsernames.js`, keep in step). API is all under `/api` (SEO under `/api/seo`).
- **Auth in two lines**: login sets two cookies, `username` and `authToken`; `JdbcLoginRepository` keeps sessions in a static in-memory map (token → `AuthSession`; lost on restart, capped per user and globally, idle + absolute expiry), passwords are bcrypt. Every controller reads both cookies with `@CookieValue` and calls `loginRepository.authorize(username, token)` (11 controllers have their own private copy of this helper); mutating routes also compare the cookie user with the `{username}` in the path.
- **Uploads**: files on disk under `app.upload-dir` (`UPLOAD_DIR`; dev default `server/uploads/`), served at `/uploads/**` by `WebConfig`; rows in `uploads` / `upload_variants` / `post_uploads`. Responsive variants (480/960/1600 px) are made by `ImageProcessingService`. Everything a user keeps counts toward a storage quota (`StorageAccountService`, default 50 MB).
- **Body size**: `RequestBodyLimitFilter` caps non-multipart bodies at 6 MB; multipart is `UPLOAD_MAX_SIZE` (50 MB); the image route allows 5 MB per file, audio 20 MB.
- **Tests**: server `server/src/test/java/.../*Test.java` (real `webposting_test` DB); client `client/src/test/*.test.js(x)`, vitest.

## 2. Server — `server/src/main/java/com/springbootprojects/webpostingserver/`

Auth marker: "owner" = cookie user must equal path `{username}` or post owner; "admin" = `loginRepository.isAdmin`; "public" = no cookie needed.

### 2.1 `posts/controller/` (all `@RequestMapping("/api")` unless noted)

| Class | For | Endpoints and must-know |
|---|---|---|
| `PostController` | Posts: read, create, edit, delete, order, search | `GET /users/{username}/resolve/{segment}` (slug or id → post), `GET /posts/{id}/canonical`, `GET /posts/{id}/card`, `GET /posts/{id}`, `GET /UserFromPostID/{id}`, `GET /user/{username}` (paged list, `?section&limit&offset`), `GET /user/{username}/sections` (tab counts), `POST /posts`, `PUT /posts/{id}`, `PUT /posts/{id}/visibility`, `DELETE /posts/{id}`, `GET/PUT/DELETE /users/{username}/pinned-post`, `GET /hashtags/{tag}/posts`, `GET /hashtags/suggest`, `GET /search/posts`, `PUT /users/{username}/posts/order`. Create/update run `PostContentValidator.clean` and `WallpaperValidator.normalise`, check quota (`storage.fitsQuota`), and create enforces `role_limits.max_posts_per_day` (429). Publishing notifies followers (`EmailNotificationService`, `SocialRepository.notifyFollowers`). Drafts are only returned to the owner. |
| `AuthController` | Sign in/out, register, profile data (bio, links, avatar, background, presets), search users, export, delete user | `POST /loginSessionAttempt`, `POST /logoutSessionAttempt`, `POST /authorizeSession`, `POST /register` (needs an invite code; per-IP limits `MAX_REG_PER_IP_PER_DAY`), `GET/PUT /users/{username}/background`, `bio`, `bio-links`, `presets`; `GET /users/{username}/storage`, `GET|POST /users/{username}/avatar` (512 px square), `POST /users/{username}/heartbeat`, `GET /users/{username}/online`, `GET /search/users`, `GET /users/{username}/follow-counts`, `GET /users/{username}/activity`, `GET /users/{username}/export`, `GET /users/recently-active`, `PUT /users/{username}/password`, `DELETE /users/{username}`. Login limits via `LoginRateLimiter` (per IP, per account, per account across IPs); password change limited too. Owner-or-admin checks inline (`SELECT is_admin`). |
| `AccountController` (`/api/account`) | The member's own security log, devices, self-delete (V018) | `GET /security-events`, `GET /sessions`, `POST /sessions/end-others`, `POST /delete`. Uses `SecurityLog`. |
| `AdminController` (`/api/admin`) | Admin panel back end | `GET /me`, `GET|POST /users`, `DELETE /users/{u}`, `PUT /users/{u}/admin`, `/role`, `/password`, `GET /users/{u}/storage`, `GET /users/{u}/export`, `POST /users/{u}/import`, `GET|PUT /role-limits[/{role}]`, `GET|POST /invite-codes`, `DELETE /invite-codes/{code}`, `GET /stats`, `GET /flagged`, `DELETE /uploads/orphans`, `POST /import`, `GET /admin/settings`, `PUT /admin/settings/{key}` (only key `max_daily_registrations` is editable). Every route: `authorize` + `isAdmin`. |
| `SocialController` | Follows, post reactions/views/votes, notifications, DMs, group chats | `GET/POST/DELETE /users/{u}/follow`, `GET /users/{u}/followers`, `/following`, `GET/POST /posts/{id}/reactions`, `POST /posts/{id}/view`, `GET /posts/{id}/views`, `GET/POST /posts/{id}/vote`, `POST /users/{u}/message`, `GET/POST/DELETE /users/{u}/block-messages`, `GET /notifications`, `/notifications/unread-count`, `PUT /notifications/{id}/read`, `/notifications/read-all`, `DELETE /notifications[/{id}]`, `GET /conversations`, `POST /users/{u}/conversation`, `GET|POST /conversations/{id}/messages`, `PUT /conversations/{id}/messages/read`, `GET /conversations/unread-count`, `POST /conversations/{c}/messages/{m}/reactions`, `GET /conversations/{c}/reactions`, groups: `GET|POST /groups`, `PUT /groups/{g}`, `GET|POST /groups/{g}/members`, `DELETE /groups/{g}/members/{u}`, `GET|POST /groups/{g}/messages`, `PUT /groups/{g}/messages/read`, `POST /groups/{g}/messages/{m}/reactions`, `GET /groups/{g}/reactions`, `PUT /groups/{g}/owner`. Rate limits: `MSG_LIMITER` 20/h, `REACTION_LIMITER` 60/5 min; groups max 50 members, 10 created/day, 50 owned. Reactions checked with `EmojiValidator`. DMs honour `dm_blocks`. |
| `DiscussionController` | Per-post settings and comments | `GET /posts/{id}/features`, `PUT /posts/{id}/reactions/enabled`, `/votes/enabled`, `/card-grid`, `GET|PUT /posts/{id}/discussion`, `PUT /posts/{id}/discussion/style`, `GET|POST /posts/{id}/comments`, `PUT|DELETE /comments/{id}`, `POST /comments/{id}/reactions`, `POST /comments/{id}/vote`. `COMMENT_LIMITER` 5 per 5 min (admins exempt). Settings are owner-only. `@name` mentions notify via `Mentions.extract` + `SocialRepository.findMentionRecipients`. |
| `FeedController` | Post feeds | `GET /feed/following` (paged, `MAX_PAGE` 50), `GET /feed/discover`, `GET /feed/people` (both added with the Discover page). Drafts never appear. |
| `UploadController` | Image and audio uploads | `POST /upload` (image: 5 MB, 16 MP budget, metadata stripped, variants made, quota-checked), `POST /upload/audio` (20 MB, `MAX_AUDIO_BYTES`), `GET /uploads/mine` (`?limit`, max 200, for the image picker). Quota check and row insert are done under one lock. |
| `EmailSettingsController` | Email, preferences, password reset, site background, code display | `GET /users/{u}/settings`, `PUT .../settings/preferences`, `PUT .../settings/email`, `POST .../settings/email/resend`, `PUT .../settings/site-background`, `PUT .../settings/code-display`, `POST /email/verify`, `POST /email/unsubscribe`, `POST /password/forgot`, `POST /password/reset`. `VERIFY_LIMITER`/`RESET_LIMITER` 3 per 15 min; the forgot/reset path has its own per-key limiter class. Email is optional (see [EMAIL.md](EMAIL.md)). |
| `PageThemeController` | Profile and post themes | `GET|PUT /users/{u}/theme`, `GET|PUT /posts/{id}/theme`. Always passes through `ThemeValidator.normalise`; owner only. |
| `ProfileBannerController` | Profile banner grid | `GET|PUT /users/{u}/banner`. `GridValidator.normalise(in, 32 cols, 12 rows)`. |
| `ProfileHeaderController` | Profile header image | `GET /users/{u}/header` (public), `POST /users/{u}/header` (upload, 4 MB, quota, variants), `PUT /users/{u}/header` (ink setting / remove). |
| `StickerController` | The member's sticker library | `GET|POST /users/{u}/stickers`, `PUT|DELETE /users/{u}/stickers/{id}`. Max 200 stickers, 8x8 tiles, quota-counted; grid via `GridValidator`. |
| `StickyController` | Stickers placed on a profile/post ("stickies") | `GET|POST /users/{u}/stickies`, `PUT|DELETE /users/{u}/stickies/{id}`. Max 30. |
| `PixelFontController` | The member's own pixel fonts for grids | `GET|POST /users/{u}/fonts`, `PUT|DELETE /users/{u}/fonts/{id}`. Max 20 fonts, 1024 glyphs; `GridValidator.cleanGlyphs`. |
| `SharedPackController` | Share sticker/font packs in DMs | `POST /packs`, `GET /packs/{id}`, `POST /packs/{id}/save`. `SHARE_LIMITER` 30/h; max 50 stickers per pack, 100 packs per user. |
| `FontController` | Admin-uploaded site web fonts | `GET /fonts`, `GET /fonts.css`, `POST|GET /admin/fonts`, `PUT|DELETE /admin/fonts/{id}` (admin; 2 MB per font). Table `custom_fonts`. No client caller (see end). |
| `ReportController` | Reporting posts | `POST /posts/{id}/report` (`REPORT_LIMITER` 10/h), `GET /admin/reports`, `PUT /admin/reports/{id}` (admin). |
| `SeoController` (`/api/seo`) | Crawler-facing output | `GET /sitemap.xml`, `/robots.txt`, `/llms.txt`, `/feed/{username}.atom`, `/page` (HTML shell with meta tags for crawlers). Uses `PostTextExtractor`. nginx routes crawlers here. |
| `HealthController` | Liveness | `GET /health`. |

### 2.2 `posts/repository/`

| Class | For |
|---|---|
| `LoginRepository` (interface) / `JdbcLoginRepository` | Users, passwords (bcrypt), the static session map. Public: `login`, `authorize` (throws `TokenExpiredException`), `logout`, `evictSession`, `countSessions`, `endOtherSessions(username, keepToken)`, `isAdmin`, `touchLastVisited`, `deleteUser`, get/update of background, bio, bio links, presets (`getPresetsStorageBytes`), cookie helpers `expireCookies`/`deleteCookie`; static `storeSession`, `sessionCountFor`, `clearSessions`. |
| `PostRepository` (interface) / `JdbcPostRepository` | Posts: `getPostsFromUsername`, `getPostsPage`, `countSections`, `getUsernameFromPostId`, `save`, `update`, `findById`, `reorder`, `deleteById`. Row mapping for every post column lives here (add new columns here). |
| `SocialRepository` (1200 lines, concrete) | All social SQL: follows, reactions, discussion settings, comments/votes/comment reactions, notifications, DM block, `findMentionRecipients`, notification storage bytes. Controllers call it directly; no interface. |

### 2.3 `posts/service/`

| Class | For |
|---|---|
| `StorageAccountService` | Quota: `usage(userId)`, `fitsQuota(userId, addBytes, freedBytes)`, `fileLimitBytes`, `filesChargedBytes`. Counts uploads, post bodies, stickers, notifications etc. |
| `ImageProcessingService` | Image checks and variants: `readDimensions`, `isWithinPixelBudget`, `stripJpegMetadata`, `decodesCleanly`, `compressSquare` (avatars), `writeVariants`; limits concurrent work (`BusyException`). |
| `PostTextExtractor` | Lexical JSON → plain text / blocks (`extract`, `.plain()`, `.excerpt()`). Switch on node type; keep in step with node types. Used by `SeoController`. |
| `EmailService` | SMTP sending and message texts (`send`, `sendVerification`, `sendPasswordReset`, alerts, digest). `isEnabled()` is false when mail is off. |
| `EmailNotificationService` | Decides who gets which email (`notifyDirectMessage`, `notifyNewFollower`, `notifyFollowersOfPost`, `sendPublishReceipt`, `flushDigests` scheduled). Daily cap `DAILY_LIMIT` 3. |
| `EmailTokenService` | Single-use hashed tokens for verify / reset / unsubscribe: `issue`, `redeem`, `unsubscribeTokenFor`. |
| `SecurityLog` | Writes and lists `security_events` (kinds in `KINDS`; IP shortened, user agent cut; pruned to 200 rows / 90 days): `record`, `recordForUsername`, `list`. |
| `Mentions` | `Mentions.extract(text)` — up to 5 distinct `@names` from a comment. |

### 2.4 `posts/validator/` (static helpers; all server input for rich data goes through these)

| Class | For |
|---|---|
| `PostContentValidator` | `clean(json)`: whitelists every Lexical node type (`image`, `audio`, `button`, `math`, `tilegrid`, `link`...), limits depth/nodes/strings, checks upload paths, URLs (`safeLink`), button targets, inline styles (`cleanStyle`), embedded grids (64x48). Throws `InvalidPostContentException`. |
| `GridValidator` | The grid format: `normalise(json, maxCols, maxRows)`, `cleanGlyphs`, links, layers, text-style fonts (its `FONTS` set mirrors `FONT_NAMES` in `tileGrid.js`). Shared by posts, banner, stickers, themes, wallpapers, fonts. |
| `WallpaperValidator` | Wallpaper JSON (tile grid + tiling + scale): `normalise`, `isValid`. |
| `ThemeValidator` | Theme JSON: preset names, `FONTS`, borders, shadows, cases, colours, sticker grid. `normalise`, `parse`. |
| `RateLimiter` | Generic in-memory limiter: `new RateLimiter(maxUses, windowMs, lockoutMs)`, `isBlocked(key)`, `recordUse(key)`, `reset(key)`. |
| `LoginRateLimiter` | Static limiter for sign-in/register/password guesses: `isBlocked`, `recordFailure(key[, max])`, `recordSuccess`. |
| `EmojiValidator` | `isValid(emoji)` against an allowed set (reactions). |
| `ReservedUsernames` | `isReserved(username)`; keep in step with the client list. |

### 2.5 `config/`, `migration/`, `model/`, root

| Class | For |
|---|---|
| `WebpostingServerApplication` | Spring Boot entry; `@EnableScheduling`, `@EnableAsync`. |
| `config/SecurityConfig` | Spring Security: CORS from `app.allowed-origins`, CSRF disabled (cookies are SameSite=Lax, plus `OriginCheckFilter`); authorisation is done in controllers. |
| `config/OriginCheckFilter` | Rejects state-changing requests whose `Origin`/`Referer` is not allowed (CSRF defence). |
| `config/RequestBodyLimitFilter` | 6 MB cap on non-multipart bodies. |
| `config/ApiExceptionHandler` | Missing cookie → 401 ("Sign in to do that."); too-large upload → 413; incomplete requests answered by `incomplete`. |
| `config/WebConfig` | Serves `/uploads/**` from `app.upload-dir`. |
| `config/DatabaseSocketConfig` | Hikari datasource; connects over the Unix socket when `DB_SOCKET_DIR` is set (passwordless). |
| `config/ProductionConfigCheck` | Refuses to start in `prod` with unsafe settings. |
| `migration/DatabaseMigrator` | Runs `db/migrations/V*.sql` in order with checksums and a tracking table (`migrate`, `pendingScripts`, `detectChecksumMismatches`). See [MIGRATIONS.md](MIGRATIONS.md). |
| `migration/DatabaseMigrationService` | Runs the migrator at start-up. |
| `model/Post` | Post bean: id, title, description (the Lexical JSON), published, date, backgroundPattern, folder, slug, summary, section, sortOrder, cardGrid. |
| `model/Comment`, `Notification`, `LoginInfo`, `AuthSession` | Beans for comments, notifications, login input, and the in-memory session (username, token, expiry, userId, role). |

## 3. Database

Migrations, `server/src/main/resources/db/migrations/` (applied in order at start-up; never edit one that has shipped):

| File | What |
|---|---|
| `V001__schema.sql` | Whole base schema (users, posts, social, messaging, email, uploads, settings). |
| `V002__wallpapers_as_grids` | `background_pattern`, `site_background`, `page_theme` become `text` (grid JSON). |
| `V003__backfill_post_slugs` | Slugs for old posts. |
| `V004__profile_grids` / `V006__drop_profile_grids` | Created then dropped; no table left. |
| `V005__pixel_fonts` | `pixel_fonts`. |
| `V007__post_votes_setting` | `posts.votes_enabled`. |
| `V008__post_views_key` | `post_views` primary key (post, user). |
| `V009__post_themes` | `posts.page_theme`. |
| `V010__post_card_grid` | `posts.card_grid`. |
| `V011__profile_banner_grid` | `users.banner_grid`. |
| `V012__stickers` | `stickers`, `stickies`. |
| `V013__shared_packs` / `V014__shared_pack_saves` | `shared_packs`, `shared_pack_saves`. |
| `V015__usernames_unique_whatever_the_case` | Unique index on `LOWER(username)`. |
| `V016__post_summary` | `posts.summary` (300 chars). |
| `V017__post_section` | `posts.section` (`profile` / notes; check constraint). |
| `V018__security_events` | `security_events` (member's own security log). |

Main tables (columns: [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)): `users` (login, role, bio, background, theme, banner), `posts` + `users_posts_junctions` (owner link), `discussions`, `comments`, `comment_votes`, `comment_reactions`, `post_reactions`, `post_votes`, `post_views`/`post_view_totals`, `hashtags`/`post_hashtags`, `follows`, `notifications`, `conversations`/`direct_messages`/`dm_reactions`/`dm_blocks`, `group_*` (group chats), `uploads`/`upload_variants`/`post_uploads`, `invite_codes`, `role_limits` (per-role limits), `system_settings`, `email_*` (preferences, tokens, send log, digest queue), `post_reports`, `custom_fonts`, `pixel_fonts`, `stickers`, `stickies`, `shared_packs`, `shared_pack_saves`, `security_events`, `activity_deletions`.

## 4. Client — `client/src/`

API client: all axios calls are in `components/Pages/Posts/BasicTextPostServerApi.js` (`baseUrl` from `config.js`). Auth is the cookie pair; calls use `withCredentials`. `utils/session.js` installs an interceptor that clears local state on 401.
Entry: `main.jsx` (React root, `installClickFlash`, `installTips`, `DialogProvider`) → `App.jsx` (lazy routes, `Fresh` wrapper remounts pages on URL change, navbar, `MiniPlayer`, `SiteBackground`, `PageTheme`).

### 4.1 Shared components

| Path | What |
|---|---|
| `components/Navbar/` | `Navbar.jsx` (bar; items array with `priority`, includes Discover), `NavMenu.jsx` (overflow menu), `Navbutton/Navbutton.jsx`, `overflow.js` (`chooseHidden`, `isActiveRoute`), `useBarFit.js` (measures width), `useUnreadCounts.js` (polls notifications/messages). |
| `components/Dialog/Dialog.jsx` | `DialogProvider`, `useDialog()`: themed alert/confirm/prompt replacing `window.*`. Used almost everywhere. |
| `components/Icon/Icon.jsx` | `Icon`: inline SVG icon set by name. |
| `components/AudioPlayer/` | `MiniPlayer.jsx` (the floating player), `useAudioPlayer.js` (hook over `utils/audioPlayer.js`). |
| `components/InstallApp/InstallApp.jsx` | "Install app" button via `utils/installApp.js` (PWA prompt). |
| `components/ImageCrop/ImageCropDialog.jsx`, `components/ImagePicker/ImagePicker.jsx` | Crop dialog; picker over `LIST_MY_UPLOADS`. |
| `components/ErrorBoundary/AppErrorBoundary.jsx`, `ScrollToTop/`, `CursorGlow/`, `SiteBackground/SiteBackground.jsx` | Crash screen; scroll reset; pointer glow; the per-user site background (`ownsItsOwnBackground`). |

### 4.2 Pages (`components/Pages/`)

| Path | What | Depends on |
|---|---|---|
| `Home/Home.jsx`, `WaterTitle.jsx` | Landing page; animated title; grid text via `gridText.js`. | `TileGrid`, `usePageTitle` |
| `Auth/Login`, `Logout`, `Registration/Registration.jsx` (also exports `PasswordRequirements`), `Userdata/Userdata.jsx` | Sign in/out, sign up (invite code), name in navbar. | axios calls made directly in these files to `/api/loginSessionAttempt`, `/api/register` |
| `Auth/AdminPanel/AdminPanel.jsx`, `BuildStatus.jsx` | Admin dashboard (users, roles, invite codes, stats, flagged, reports, settings, import/export). | all `ADMIN_*` functions, `utils/build.js` |
| `Posts/PostsViewer/*` | The profile page. See 4.5. | |
| `Posts/PostRenderer/BasicTextPost/BasicTextPost.jsx` | The post card used in lists (title, summary, grid thumbnail, edit/delete). | `postUrl`, `gridPost`, `TileGrid` |
| `Posts/PostRenderer/RichTextPost/*` | Editor and viewer. See 4.3, 4.4. | |
| `Posts/PostWindow.css`, `RichTextBox.css` | Shared CSS only. | |
| `Activity/ActivityPage.jsx` | A member's activity history. | `GET_USER_ACTIVITY` |
| `Search/SearchPage.jsx` | Search people and posts, hashtags. | `SEARCH_USERS`, `SEARCH_POSTS` |
| `Discover/DiscoverPage.jsx` | Discover feed and people (`nextBefore` helper exported for tests). | `GET_DISCOVER_FEED`, `GET_DISCOVER_PEOPLE`, `BasicTextPost`, `FollowButton` |
| `Settings/SettingsPage.jsx` | Folded sections: Email, Password, Security, App, Site background, Code blocks, Delete account (`Section id=...`; add a section there). | |
| `Settings/ChangePassword.jsx`, `SecuritySection.jsx` (+`securityEvents.js` label helpers), `DeleteAccount.jsx`, `EmailActionPage.jsx` (verify/unsubscribe/reset by `mode`), `ForgotPasswordPage.jsx` | Settings parts and email-link landing pages. | `CHANGE_MY_PASSWORD`, `GET_SECURITY_EVENTS`, `GET_MY_SESSIONS`, `END_OTHER_SESSIONS`, `DELETE_MY_ACCOUNT`, `VERIFY_EMAIL`... |
| `Settings/CustomizePage.jsx`, `PixelFontsSection.jsx` | Customize: theme, wallpaper, pixel fonts, stickers. | `ThemeEditor`, `WallpaperEditor`, `StickersSection` |

### 4.3 Editor — `Posts/PostRenderer/RichTextPost/`

| File | What |
|---|---|
| `Editor.jsx` (2250 lines) | `RichTextEditor`. Lexical composer; `EDITOR_NODES` array (top of file) lists node classes. Plugins are local functions: `*ToolbarPlugin` for each button (`ListToolbarPlugin`, `ImageToolbarPlugin`, `AudioToolbarPlugin`, `ButtonToolbarPlugin`, `CodeToolbarPlugin`, `MathToolbarPlugin`, `TileGridToolbarPlugin`, `StickerToolbarPlugin`, `PostLinkToolbarPlugin`, `LinkToolbarPlugin`, `BackgroundToolbarPlugin`, `FeatureTogglePlugin`), field components (`PostSlugPlugin`, `PostSummaryField`, `PostSectionField`), `SaveToolbarPlugin` (publish/save; calls `CREATE_POST`/`UPDATE_POST` with title, state JSON, published, background, folder, slug, summary, section; autosaves with idle/backoff), `PostAutosavePlugin` (local drafts via `useAutosave`), behaviour plugins (Enter, code escape, decorator delete, image drag/paste). The toolbar is assembled in `ToolbarPlugin` as rows (`ToolRow` label + children): add a button there. `insertBlock(editor, createNode)` inserts a decorator node. |
| `Viewer.jsx` | `RichTextViewer`: read-only render of a post (`VIEWER_NODES` array), title bar, reactions, report/share dialogs, post theme, page meta. |
| `TitleBar.jsx`, `buttonTarget.js` | Title/dateline; button-target validation shared with the server rules (`validateTarget`, `normaliseButton`, `BUTTON_ACTIONS`, `BUTTON_STYLES`). |
| Node files | `ImageNode.jsx`, `AudioNode.jsx` (+`.css`), `ButtonNode.jsx` (+`.css`), `MathNode.jsx` (KaTeX), `CustomCodeNode.jsx`; each exports `Class`, `$createXNode`, `$isXNode`; decorator nodes render a React component and serialise to JSON via `exportJSON`/`importJSON`. |
| `exampleTheme` | Lexical CSS class map. |
| `Editor.css`, `Viewer.css`, `Title.css` | Styles. |

### 4.4 Grid — `RichTextPost/TileGrid/`

Format: [GRID-FORMAT.md](GRID-FORMAT.md) (v3: tiles, layers, text slots, links, `ext`). Server twin: `GridValidator`.

| File | What |
|---|---|
| `tileGrid.js` (1100 lines) | Pure grid logic, no React: constants (`TILE`, `SCALE`, `LIMITS`, `FONT_NAMES`, `TYPEFACES`, `GRID_VERSION`), `defaultGrid`, `normaliseGrid` (client twin of the validator), layer builders (`pixelLayer`, `photoLayer`), text slots (`writeChar`, `writeSlot`, `setTileWidths`, `mergeText`, `resizeLayerText`), links (`setLink`, `linkAt`), selection helpers (`floodTiles`, `lassoTiles`, `rectTiles`, `floodPixels`, `linePixels`, `rectPixels`, `ellipsePixels`), photo helpers, and `renderGrid(ctx, data, assets, opts)`, the only place a grid is drawn to canvas; `drawLayerText`. |
| `TileGrid.jsx` (1640 lines) | `TileGrid` component: viewer and editor in one (`editing` prop). `TOOL_KEYS` (Alt+key → tool: text, select, wand, lasso, move, pixel, tile, erase, fill, bucket, line, rect, ellipse, pick, link); tool buttons are `Tile` components with `PixelIcon`; pointer handling in `onPointerDown/Move/Up`; the hint line under the canvas is `hint` (near line 1330); `SHORTCUTS` array feeds the shortcuts panel; layers panel, photo resize, stickers, export. |
| `TileGridNode.jsx` | Lexical node wrapping `TileGrid` (`$createTileGridNode`). |
| `GlyphEditor.jsx`, `SymbolPalette.jsx`, `bitmapFonts.js`, `tileFont.js`, `symbols.js` | Pixel font glyph editing; symbol picker; built-in bitmap fonts (`BITMAP_FONTS`, `bitmapGlyph`); the UI's own 5x7 font (`pixelGlyph`); basic symbols. |
| `textures.js` | Procedural textures (`TEXTURES`: cork, sand, oak, newsprint, halftone, wood, mat, night, notebook, graph, dots, sticky, scanlines, neon, paws), `fillTexture`, `texturePreview`, paw layout options. |
| `PixelIcon.jsx`, `PixelText.jsx`, `GridButton.jsx`, `GridUI.jsx` | Pixel-art UI kit used across the app: 8x8 icons (`ICONS` table), text in pixel font, button, `PixelWords`/`GridSelect`/`GridStepper`. |

### 4.5 Profile — `Posts/PostsViewer/`

| File | What |
|---|---|
| `PostsViewer.jsx` (650 lines) | `PostsViewer`: the `/{username}` page. Loads user data (bio, links, banner, header, theme, storage, follow counts, online) and posts (`READ_POSTS_BY_USER` paged by section), owner tools (edit bio/links/banner, arrange stickies, upload header), follow/message buttons. State is many `useState`s at the top. |
| `ProfileTabs.jsx` + `profileTabs.js` | Tabs (Posts, Notes, and for the owner Drafts, Subscribers): `TAB_IDS`, `sectionForTab`, `visibleTabs`, `destinationLabel`. |
| `ProfilePostList.jsx`, `ProfileArrange.jsx`, `profileOrder.js` | Post list with folders and drag-arrange; pure ordering logic (`sortPosts`, `moveToFolder`, `toRows`...) saved with `UPDATE_POST_ORDER`. |
| `ProfileBanner.jsx`, `BannerEditor.jsx`, `bannerGrid.js` | The info banner (a grid with joined/posts text) and its editor. |
| `ProfileStickies.jsx` (`StickyArt`), `PostStickies.jsx` | Placed stickers on profile and on a post. |
| `StorageSummary.jsx` | Quota line (`fmtBytes`). |

### 4.6 Other component folders

| Path | What |
|---|---|
| `components/Social/` | `FollowButton`, `FollowListModal`, `FollowingPage` (feed of followed), `InboxPage` (notifications), `MessagesPage` (DMs + groups, 750 lines), `DiscussionPage` + `CommentItem` (threaded comments with `MentionTextarea`), `ReactionBar`, `ReportDialog`, `SharePostDialog` (share to DM), `PostMessageCard`, `AvatarPopup`, `MentionTextarea` (@name suggestions, uses `utils/mentions.jsx`). `Social.css` is shared. |
| `components/PageTheme/` | `theme.js`, `themes.css`, `PageTheme.jsx`, `ThemeEditor.jsx`. See 4.7. |
| `components/TileArt/` | Wallpaper, sticker and pack tooling: `wallpaper.js` (`sanitiseWallpaper`, `renderGridImage`, `composeTiling`, `wallpaperStyle`, `useWallpaperStyle`, `useBodyWallpaper`), `WallpaperEditor.jsx`, `stickers.js` (`STICKERS` built-ins), `StickersSection.jsx`, `StickerCenter.jsx` (page `/stickers` + dialog), `PackCard`/`PackThumbs`/`SharePackDialog` (packs in DMs), `ColourPicker.jsx`, `PawOptions.jsx`, `NewGridPost.jsx` (start a post that is one grid). |

### 4.7 Themes — `components/PageTheme/`

- `theme.js`: `FONTS` (id → label, css family, kind), `BORDERS`, `SHADOWS`, `CASES`, `EFFECTS`; `buildPresets()` → `getPresets()` (newspaper, sticky, notebook, corkboard, neon, paw, sand, oak, custom); `sanitiseTheme(raw)` is the client twin of `ThemeValidator`; `contrast`/`readableOn(colour, card, fallback)` enforce a 2.5 contrast ratio between ink and card (`READABLE`); `themeVariables(theme, images)` turns a theme into an object of CSS custom properties (`--th-*`); `applyThemeToDocument` sets them on `<html>`.
- `themes.css` consumes the variables: `.th-backdrop`, `.th-overlay`, cards (`.theme-preview` etc.), the sticker, buttons. Cards never rotate or tilt.
- `PageTheme.jsx`: hooks `useAuthorTheme`, `usePostTheme`, `useThemeImages`, components `ThemeLayers`, `DocumentThemeLayers`, `ThemePreview`.
- `ThemeEditor.jsx`: preset picker and steps (`Steps`); saves with `SET_PAGE_THEME` / `SET_POST_THEME`.

### 4.8 `utils/`

| File | What |
|---|---|
| `audioPlayer.js` | Singleton player: `play`, `toggle`, `pause`, `seek`, `setVolume`, `subscribe`, `getState`, `formatClock`. |
| `autosave.js`, `useAutosave.js` | localStorage drafts (`saveDraft`, `loadDraft`, `listDrafts`, caps), hooks `useAutosave`, `useTextDraft`. |
| `build.js` | Build id and compare with GitHub main (`compareWithMain`) for the admin panel. |
| `clickFlash.js`, `tips.js` | Global click effect; hover tips. |
| `codeDisplay.js` | Code block font/size settings (`applyCodeDisplay`). |
| `colours.js` | Hex/HSL helpers, palette rows, recent colours. |
| `errorMessage.js` | `errorMessage(err)`: readable text from an axios error. Use for every catch. |
| `gridPost.js`, `gridText.js` | Post that is a grid (`firstGridOfPost`, `gridPostContent`); text to grid (`wrapWords`, `textGrid`). |
| `installApp.js` | PWA install state. |
| `linkifyText.jsx`, `mentions.jsx` | Plain text with links; `@mention` finding/rendering (`findMentions`, `renderComment`, `activeMention`). |
| `packMessage.js`, `postMessage.js` | Encode packs/posts inside DM text and split them back. |
| `pageMeta.js`, `usePageTitle.js` | Title and meta tags per page. |
| `postDate.js`, `postSummary.js`, `postUrl.js` | Dateline; summary cap (`SUMMARY_MAX`, 300, matches V016); URLs (`slugify`, `effectiveSlug`, `postPath`, `parsePostId`). |
| `reservedUsernames.js` | Twin of the server list. |
| `responsiveImage.js` | `srcset` helpers, upload response normalising, `describeUploadError`. |
| `session.js` | `isSignedIn`, `clearLocalSession`, `handleExpiredSession`, `installSessionInterceptor`. |
| `useResolvedPostId.js`, `useUnsavedGuard.js`, `viewAs.js` | Slug → id hook; leave-page guard; owner "view as visitor" filter (`visiblePostsFor`). |

### 4.9 `BasicTextPostServerApi.js` function groups

Posts: `READ_POST`, `RESOLVE_POST`, `READ_POSTS_BY_USER`, `GET_POST_SECTIONS`, `GET_POST_CARD`, `CREATE_POST`, `UPDATE_POST`, `DELETE_POST`, `SET_POST_VISIBILITY`, `UPDATE_POST_ORDER`, pin (`GET/SET/UNPIN_POST`), hashtags, `SEARCH_POSTS`, `SEARCH_USERS`.
Features/social: `GET_POST_FEATURES`, `SET_REACTIONS_ENABLED`, `SET_VOTES_ENABLED`, `SET_CARD_GRID`, `SET_DISCUSSION_*`, reactions, votes, views, comments (`GET/ADD/EDIT/DELETE_COMMENT`, `VOTE_COMMENT`, `SET_COMMENT_REACTION`), follows, feeds (`GET_FOLLOWING_FEED`, `GET_DISCOVER_FEED`, `GET_DISCOVER_PEOPLE`), notifications, conversations, groups, DM block, `REPORT_POST`.
Profile: bio, bio links, background, avatar, header (`GET/UPLOAD/UPDATE_PROFILE_HEADER`), banner, theme (`GET/SET_PAGE_THEME`, `GET/SET_POST_THEME`), pixel fonts, stickers, stickies, packs (`SHARE_PACK`, `GET_SHARED_PACK`, `SAVE_SHARED_PACK`), storage, activity, export.
Account: `AUTHORIZE_SESSION`, `GET_SETTINGS`, email (`UPDATE_EMAIL_*`, `RESEND_VERIFICATION`, `VERIFY_EMAIL`, `UNSUBSCRIBE_EMAIL`, `FORGOT_PASSWORD`, `RESET_PASSWORD`), `CHANGE_MY_PASSWORD`, `UPDATE_SITE_BACKGROUND`, `UPDATE_CODE_DISPLAY`, security (`GET_SECURITY_EVENTS`, `GET_MY_SESSIONS`, `END_OTHER_SESSIONS`, `DELETE_MY_ACCOUNT`), uploads (`UPLOAD_AUDIO`, `LIST_MY_UPLOADS`). Image upload is done with axios directly in the editor/picker.
Admin: `ADMIN_*` (status, users, roles, limits, stats, flagged, orphans, invite codes, settings, export/import, reports, change password).

### 4.10 Styles and tests

`styles/tokens.css` (design tokens), `styles/touch.css` (touch targets); `index.css`, `App.css` global; each component has its own `.css` beside it. Look rules: [style-guide.md](style-guide.md) (grayscale, springy controls, no glass cards, never tilt posts). `test/setup.js` plus one test file per module (`tileGrid.test.js`, `postUrl.test.js`, `profileOrder.test.js`, `navbar.test.jsx`, `wallpaperTheme.test.js`, `noGradients.test.js` guards the style rule, ...). Run: `cd client && npx vitest run`.

## 5. Recipes

**Add a field to a post** (as `summary` was, commit `8c7cc1e`): 1) migration `V0NN__post_x.sql` (`ADD COLUMN IF NOT EXISTS`); 2) `model/Post.java` field + getter/setter; 3) `JdbcPostRepository` select/RowMapper/`save`/`update`; 4) `PostController` create/update (validate or clean the value); 5) `BasicTextPostServerApi.js` `CREATE_POST`/`UPDATE_POST` arguments and callers; 6) `Editor.jsx` state, a field component, `SaveToolbarPlugin` and `PostAutosavePlugin` (`getFields`/`applyFields`); 7) show it in `BasicTextPost.jsx` / `Viewer.jsx`. Add the column to the schema test (`DatabaseSchemaTest`) and [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).

**Add a block type to posts** (see audio `1592eb8`, button `f83ef33`): 1) `XNode.jsx` next to `AudioNode.jsx` (class, `$createXNode`, `$isXNode`, `exportJSON`/`importJSON`); 2) add to `EDITOR_NODES` in `Editor.jsx` and `VIEWER_NODES` in `Viewer.jsx`; 3) `XToolbarPlugin` in `Editor.jsx` and list it in `ToolbarPlugin` rows (icon via `PixelIcon`/`Icon`); 4) server: a `case "x"` in `PostContentValidator.clean` (whitelist fields, check paths/URLs); 5) `PostTextExtractor.extract` `case "x"` (or ignore); 6) tests in `PostContentValidatorTest`, `client/src/test/XNode.test.js`.

**Add a theme preset or font**: client `theme.js` (`FONTS` entry, or `buildPresets()`), keep `PRESET_KEYS` in `sanitiseTheme`; server `ThemeValidator.FONTS` / `PRESETS`; load the web font in `client/index.html` (Google Fonts `<link>`). For grid text fonts: `tileGrid.js` `FONT_NAMES` + `TYPEFACES`, and `GridValidator.FONTS`.

**Add a texture**: `TileGrid/textures.js` entry in `TEXTURES` (`draw(ctx, w, h, options)` plus preview); it appears in the wallpaper editor and the grid `fill` tool. The server stores only the name; check `WallpaperValidator` if textures are whitelisted there.

**Add a grid tool**: `TileGrid.jsx` `TOOL_KEYS` (Alt+key) and `SHORTCUTS`; a `Tile` button with an icon added to `ICONS` in `PixelIcon.jsx`; branches in `onPointerDown/Move/Up`; the hint text (`hint`); pure helpers in `tileGrid.js` with a test in `test/tileGrid.test.js`. A new stored property needs `normaliseGrid` and `GridValidator` + [GRID-FORMAT.md](GRID-FORMAT.md).

**Add a Settings section**: `SettingsPage.jsx` `<Section id="x" title="X">` (open state is remembered by id), body as its own component in `Pages/Settings/`; API function in `BasicTextPostServerApi.js`; endpoint in `EmailSettingsController` or `AccountController`.

**Add a rate limit**: server `new RateLimiter(max, windowMs, lockoutMs)` as a `static final` in the controller; `isBlocked(key)` before the work (429), `recordUse(key)` after. Key by username (and IP for anonymous routes, see `rateKey` in `AuthController`). For sign-in style failures use `LoginRateLimiter`. Tests: `SocialAbuseGuardsTest`, `EmailRateLimitTest`.

**Add an admin-only endpoint**: in `AdminController` (class path `/api/admin`): `@GetMapping("/x")` with `@CookieValue username/authToken` and `if (authorize(username, token) == null || !isAdmin(username)) return forbidden();` as every method there does. Add `ADMIN_X` in the API client and a test in `AdminControllerTest`.

**Add a migration**: new `V0NN__name.sql` wrapped in `BEGIN; ... COMMIT;`, idempotent (`IF NOT EXISTS`); never edit shipped ones; update `DATABASE_SCHEMA.md` and `MIGRATIONS.md`.

## 6. Tools and guides

- `tools/run-local.sh` — build and run locally (client 5174, server 8090); `stop` to stop.
- `tools/release.sh` — test, build, upload and install a release from the owner's computer; `tools/install-release.sh` runs on the server as root.
- `tools/deploy.sh` — put the checked-out code on GitHub and the live site (`--setup` to re-enter settings).
- `tools/backup.sh` — database and uploads backup. `tools/reset-schema.sh` — move an old database onto V001.
- `tools/mac-app/` — `Webposting.applescript` + `build.sh`: the small Mac menu app (`~/Applications`).
- `tools/server/` — run on the server as root: `enable-mail.sh`, `remove-stale-secrets.sh`, `use-passwordless-db.sh`.
- `tools/smoke/` — Playwright smoke checks: `run.mjs`, `lib.mjs`, `checks/auth.mjs`, `editor-text.mjs`, `nav.mjs`.
- Repo root: `deploy.sh` (retired stub), `server-start.sh` (starts the JAR from systemd, reads `deploy.env`), `config/*.env.example`, `.claude/agents/ui-reviewer.md` (headless UI reviewer), `package.json` (root scripts).

`guide/` files:

| File | What |
|---|---|
| `README.md` | Index of this folder. |
| `WORKING-HERE.md` | How to work here (read first). |
| `project-structure.md` | This map. |
| `backlog-2026-10-03.md` | Mae's queue, ordered. |
| `tasks.md` | Older priority list (2026-10-01). |
| `GRID-FORMAT.md` | The grid JSON format v3. |
| `style-guide.md` | UI look rules. |
| `DATABASE_SCHEMA.md`, `MIGRATIONS.md` | Columns per table; how migrations run. |
| `CONFIGURATION.md`, `DEPLOYMENT.md`, `EMAIL.md`, `SEO.md` | Environment variables; releasing; email; indexing. |
| `SECURITY.md`, `security-review-2026-10-03-open-signups.md` | Security audits (2026-09-08; open sign-ups). |
| `ui-review-2026-10-01-profile.md`, `ui-review-2026-10-02-consistency.md` | UI review reports. |
| `SSO-PLAN.md`, `animator-design.md` | Proposals, nothing built. |
| `RECOMMENDATIONS.md`, `code-smells.txt` | Older suggestions and quality notes (2026-09-08). |
| `fonts-dafont-licences.md` | Licence check of requested fonts. |
| `HANDOFF-2026-09-30.txt` | Older handoff, partly out of date. |
| `notes to AI swe.txt` | Mae's original note asking for this file. |
| `edits1`...`edits7` | Directories (screenshots/scratch from earlier edit rounds). |

## 7. In progress on 2026-10-03 (not described above)

Modified: `client/.../Auth/Registration/Registration.jsx`, `client/.../Home/Home.jsx`, `Home.css`, `server/.../controller/AuthController.java`, `PostController.java`, `UploadController.java`, `guide/CONFIGURATION.md`, `guide/DEPLOYMENT.md`.
Untracked: `client/.../Auth/Registration/Registration.css`, `client/src/test/home.test.jsx`, `server/.../service/PostingGate.java`, `server/.../service/SignupGuard.java` (the open-sign-up hardening work: see `security-review-2026-10-03-open-signups.md`). The committed `AuthController`/`PostController`/`UploadController` rows above describe the committed versions; endpoints and limits there may change.
