# Security review for open sign-ups, 2026-10-03

Read-only code audit of `server/` and `client/` (nothing was run, no server or database touched).
Threat model: anyone can register, then attack the site or other users. Items already fixed
today (case-insensitive unique usernames, atomic invite claim, login rate limits, change-own-password,
`isAdmin` on `/api/admin/*` and `/admin/fonts`) and the FIXED items in `guide/SECURITY.md` are not repeated.

## Summary

1. Not yet safe to open. I found no SQL injection, no authentication bypass, no stored script execution and no privilege escalation, but one ordinary account can take the site down (H2, H3, H4), and sign-ups have no real bot barrier (H1).
2. Must fix first: H1 (sign-up gate: email verification or CAPTCHA, and IPv6 limits), H2 (session flood locks everyone out of login), H3 (profile, feed and search endpoints load full post bodies), H4 (no total storage cap and unbounded JSON bodies).
3. Fix in the same release if possible: M1 (post content is never validated on the server), M2 and M3 (DM block bypass, reactions on strangers' private messages), M5 and M6 (notification and email spam), M7 (anyone can lock any account out of login).
4. Everything in Low can wait, but M8 (post owners cannot remove abusive comments) matters on day one of public use.
5. Keep the daily cap, the IP block and the invite code until H1 to H4 ship; they are currently the only things limiting how many accounts exist.

Verified clean: every SQL statement is parameterized; drafts, post themes and stickies are author-only; DM and group reads check membership; comment edit and delete check ownership; no endpoint can set `is_admin` or `role` outside the admin controller.

---

## High

### H1. Sign-up has no bot barrier once the invite code goes away
- Where: `AuthController.java:54-56` (IP block map), `507-614` (register), `554-569` (global daily cap), `603-604` (email stored unverified).
- Wrong: the only controls are the invite code, a per-IP block (`REG_BLOCK`, keyed by `getRemoteAddr()`, so one IPv6 /64 gives 2^64 "different" IPs), and a global `max_daily_registrations` (default 5, V001 line 698). The email is written to `users.email` with no verification and no uniqueness constraint. `REG_BLOCK` is never purged. Every per-user limit in the app (20 posts a day, 50 MB, 5 comments per 5 minutes) is multiplied by the number of accounts an attacker can make.
- Attack: a script registers thousands of accounts over IPv6 or rotating IPv4 (any email string works). Or, if the invite requirement is simply removed, the global cap is burned through in seconds, which shuts out real people while the attacker keeps going from fresh addresses. With the cap raised, the attacker fills disk (H4) and spams follows and messages (M5).
- Fix:
  1. Require a verified email before an account may post, comment, follow, message, upload or share: add `if (!emailVerified(session.userId)) return 403` in a shared helper called from those controllers, and send the verification mail at registration using `EmailTokenService.issue(userId, email, PURPOSE_VERIFY)` (the code path already exists in `EmailSettingsController.java:297-314`).
  2. Add a CAPTCHA (Cloudflare Turnstile or hCaptcha) verified server-side in `register`.
  3. Key `REG_BLOCK` and the login limiters on `ip` for IPv4 and on the /64 prefix for IPv6; purge entries older than their block time (a scheduled `removeIf`).
  4. Make the daily cap per IP/prefix instead of global, or at least add a separate per-IP counter, so an attacker cannot exhaust it for everyone.
  5. Add a unique index: `CREATE UNIQUE INDEX users_email_verified_key ON users (lower(email)) WHERE email_verified;`

### H2. One account can fill the session table and lock everyone out of login
- Where: `AuthController.java:779-780` (success clears the rate limit), `JdbcLoginRepository.java:94` (`MAX_SESSIONS = 10_000`), `330-335` (login refuses with 503 when full), `133-137` (purge only removes expired sessions).
- Wrong: successful logins are not rate limited at all (`recordSuccess` wipes the IP counter), there is no per-user session cap, and a full table rejects every new login, including admins. Idle timeout is 12 h, so the attacker's unused sessions stay for 12 to 24 h.
- Attack: attacker registers one account and runs 10,000 `POST /api/loginSessionAttempt` with the right password (about 70 ms of bcrypt each, so a few minutes). From then on nobody else can sign in until the sessions expire; the attacker repeats as needed. The same loop is a CPU drain.
- Fix: in `login()` cap sessions per user (e.g. 5) and evict that user's oldest instead of refusing: before `sessionsByToken.put`, collect the user's sessions, sort by `idleExpiresAt`, remove until fewer than the cap. Never return 503 because of other users' sessions. In `loginSessionAttempt`, add a `RateLimiter(30, 15 min, 15 min)` keyed by IP that counts successful and failed attempts (do not call `recordSuccess` on it).

### H3. Public endpoints load and return full post bodies (memory and CPU denial of service)
- Where:
  - `PostController.java:312-341` with `JdbcPostRepository.java:67-87`: `GET /api/user/{username}` loads every post of the user including `description` (up to 5,000,000 chars each, `PostController.java:369`), then slices the page in memory. Unauthenticated.
  - `FeedController.java:49`: `/api/feed/following` returns `p.description` for up to 50 posts per call.
  - `PostController.java:639-681`: `GET /api/search/posts` runs `description ILIKE '%q%'` over every published post body. Unauthenticated, no rate limit.
  - `AuthController.java:382-388`: `/api/users/recently-active` returns every user, unbounded.
- Attack: attacker creates one account, saves 20 posts a day of 5 MB each (the daily limit counts posts, not bytes). After a few days `GET /api/user/<attacker>` (no login) pulls hundreds of MB into the JVM heap per request; ten parallel requests exhaust memory. The search endpoint lets anyone force full scans of every post body with a 3-letter query. A large following list plus the feed endpoint multiplies the same effect.
- Fix:
  - `getPostsFromUsername`: add `LIMIT ? OFFSET ?` to the SQL (pass `safeLimit`, `safeOffset`) and select `left(description, N)` or no description for list views; the card needs only the first grid, so store a small `card_preview` column at save time.
  - Feed: drop `p.description`; return the same preview column.
  - Search: search `title` and `summary` only (or add a `tsvector`/trigram index) and wrap it in `RateLimiter(30, 60_000, 60_000)` keyed by IP.
  - `recently-active`: add `LIMIT 100`.

### H4. No overall storage cap, and request bodies are not size-limited
- Where:
  - `StorageAccountService.java:177-183`: the quota (`usedBytes`) counts only rows in `uploads`; posts, stickers, fonts, shared packs, wallpapers, themes, comments, messages are listed in `usage()` but never limited.
  - `PostController.java:369`: 5 MB per post, 20 posts a day (`role_limits` in V001 line 693), no per-user total.
  - `StickerController.java:28-30` (200 stickers × 800,000 chars) and `SharedPackController.java:34,62-110` (30 packs an hour, each up to 50 stickers, a full copy of the data each time, no count cap).
  - `application.properties:52-54` and `README.md:152`: 50 MB request bodies; JSON endpoints read the whole body before checking length (`StickerController.java:67`, `AuthController.java:233`, `PostController.java:369`, `ThemeValidator.java:53`).
- Attack: one account fills the database: 30 packs an hour × about 40 MB is about 1.2 GB an hour; posts add 100 MB a day; any request can carry a 50 MB JSON body that Jackson parses entirely in memory. With H1 this multiplies by the number of bots. Disk full takes down Postgres and the site.
- Fix:
  - Make `fitsQuota` use `usage(userId).get("totalBytes")` (already computed at `StorageAccountService.java:177`) and call it from post create/update, sticker, font, pack and wallpaper writes; reject with 413.
  - Cap shared packs per user (e.g. 20) and reject when the same sticker set was already shared.
  - Add a servlet filter rejecting `Content-Length` over 6 MB for every `/api` request that is not multipart (return 413 before parsing), and in nginx use `client_max_body_size 6m;` on `/api/` with a separate `location ~ ^/api/(upload|users/[^/]+/(avatar|header))` that allows 50m.

---

## Medium

### M1. Post content is never validated on the server (stored remote loads, CSS injection, PNG bombs)
- Where: `PostController.java:351-377` (only title, summary, 5 MB length and wallpaper are checked); `GridValidator.java:19-23` documents rules that apply to stickers, wallpapers, themes and banners but not to post bodies (comment at `PostController.java:367-368` says the client does it). Client side: `ImageNode.jsx:231-238` and `:177` (`IMAGES_BASE_URL + src`, empty in production), `AudioNode.jsx:143-144,95`, Lexical `TextNode` style applied raw (`node_modules/lexical/Lexical.dev.js:4396`), `TileGrid/tileGrid.js:202` (paint only checked with `startsWith`).
- What I verified: links are safe. Lexical's `LinkNode.sanitizeUrl` turns `javascript:` and `data:` into `about:blank`, tile-grid links are cleaned again on load (`tileGrid.js:255-285`), bio links are `http(s)` only on the server (`AuthController.java:188`), and KaTeX runs with default `trust: false` (`MathNode.jsx:93`). I found no way to run script.
- Wrong: an attacker who writes the JSON directly to `POST /api/posts` can store:
  - an image or audio node with `src` or `srcset` set to `https://attacker.example/pixel.gif` (loads in every reader's browser; tracking and IP capture, also hotlinked abuse);
  - text nodes with an arbitrary inline `style` such as `position:fixed;inset:0;z-index:99999;background:#fff;...`, covering the whole page (and the navbar) with attacker text and fake "session expired, click here" content, or `background-image:url(...)` for tracking;
  - a tile-grid layer whose `paint` is a tiny PNG declaring a huge size, which freezes or crashes the tab of anyone opening the post (`drawImage` allocation).
- Fix: add `PostContentValidator.normalise(String lexicalJson)` called from `validatePost` (`PostController.java:369`): walk the Lexical tree; for `image` and `audio` nodes require `src` to match `^/uploads/[A-Za-z0-9._/-]{1,200}$` without `..` and drop `srcset` unless every entry matches the same pattern; for `text` nodes keep `style` only if every declaration is in an allowlist (`color`, `background-color`, `font-weight`, `font-style`, `text-decoration`) with `#hex` or named-colour values, else remove it; for `tilegrid` nodes run `GridValidator.normalise` and decode each PNG header (IHDR bytes 16-24) to require width and height at or below `cols*16` by `rows*16`; unknown node types are removed. Apply the same IHDR check inside `GridValidator.PNG` handling so stickers and themes get it too. Optionally add a CSP (see M10) so even a missed case cannot load remote images.

### M2. A blocked user can still message through the conversation endpoints
- Where: `SocialController.java:335-350` (`getOrCreateConversation` ignores `dm_blocks`) and `367-399` (`sendConversationMessage` never calls `isMessageBlocked`); compare `158-187` which does. Line 395 also writes a `message` notification to the blocker.
- Attack: A harasses B; B blocks A; A calls `POST /api/users/B/conversation`, then `POST /api/conversations/{id}/messages` and B still receives the messages and a notification each time.
- Fix: in `sendConversationMessage`, after the participant check, compute `otherId = social.getOtherParticipant(id, session.userId)` and `if (social.isMessageBlocked(otherId, session.userId)) return 403`; make `getOrCreateConversation` refuse when blocked; skip the notification at line 395 when blocked.

### M3. Reactions can be added to private messages in conversations you are not in
- Where: `SocialController.java:429-453` (checks participation in `convId`, then uses `msgId` unchecked) and `638-662` (same for groups); `SocialRepository.java:855-865` and `988-997` insert by `message_id` only. FKs exist (V001 lines 619 and 641).
- Attack: member of any conversation sends `POST /api/conversations/<own>/messages/<victim message id>/reactions`; an emoji appears under a stranger's private message (harassment), and a 200 versus 500 tells the attacker whether message id N exists.
- Fix: before toggling, run `SELECT 1 FROM direct_messages WHERE id=? AND conversation_id=?` (groups: `group_messages ... AND group_id=?`) and return 404 when absent.

### M4. Anyone can be added to a group without consent; groups are unlimited
- Where: `SocialController.java:480-503` (members list from the request, no cap, no block check, unchecked cast), `505-524` (`addGroupMember`).
- Attack: create group after group, add every user (found via `/api/users/recently-active`), post spam; victims see the group and unread counts until they leave each one.
- Fix: cap members per request and per group (e.g. 50), cap groups created per user per day (e.g. 5, `RateLimiter`), skip users who have blocked the creator (`isMessageBlocked(uid, creator)`), and only add users who follow the creator or have an existing conversation with them (otherwise create a pending invite).

### M5. Notification and email spam by repeating cheap actions
- Where: `SocialController.java:83-86` (follow creates a notification and an email every call, even if already following); `PostController.java:511-515` and `473-478` (unpublish then publish again notifies every follower each time, with no limit; the 20-a-day limit is only on create, `397-414`); `SocialController.java:147-152` (each reaction toggle notifies); `EmailNotificationService.java:161` (digest queue row per event, never trimmed).
- Attack: loop `POST /api/users/V/follow` or toggle a post's visibility: V's inbox fills with thousands of rows and V's digest queue grows without bound; a bot swarm following one target does the same. (The 3 per day email cap, `EmailNotificationService.java:143`, protects the mailbox but not the inbox or database.)
- Fix: only notify when `follow()` actually inserted (`jdbc.update(...) == 1`); notify followers only the first time a post is ever published (store `first_published_at`); add `RateLimiter` for follow (60 an hour) and for visibility toggles (10 an hour per user); cap `email_digest_queue` per user (delete oldest beyond 100) and `notifications` per user.

### M6. Verification and reset mail can be used to email-bomb any address
- Where: `EmailSettingsController.java:56-59` (3 per 15 minutes, keyed only by IP), `206-258` (`setEmail` sends to any address typed), `364-389` (`forgotPassword`).
- Attack: with many accounts or IPs (H1) an attacker sends unlimited "confirm your email" mails to a victim's address (and uses your sending domain's reputation), or floods a victim account's owner with reset mails.
- Fix: add per-recipient (`email`) and per-account limits (e.g. 3 verification mails per address per day; 3 per account per day; 3 reset mails per account per day) using `RateLimiter` keyed `"v:"+lower(email)` and `"u:"+userId`; keep the IP limit.

### M7. Anyone can lock any account (including admin) out of login
- Where: `AuthController.java:767-768, 775-776`; `LoginRateLimiter.java:13-15, 39-48`.
- Wrong: the per-account key counts failures from all addresses, so 15 wrong passwords against `admin` from anywhere lock that account for 15 minutes, repeatable forever. Also the limiter map is keyed by attacker-chosen usernames and entries are removed only when that same key is checked again, so it grows without bound.
- Fix: key account failures by `account + ip` (so the owner on another IP is unaffected) and keep a separate, higher global per-account threshold that only adds a delay (e.g. exponential backoff of the response) instead of a hard lock; add a periodic `state.entrySet().removeIf(expired)`.

### M8. Post owners cannot remove abusive comments, and users cannot report comments or users
- Where: `DiscussionController.java:250-263` (only the comment's author can delete), `ReportController.java:56-99` (posts only). The only remedy is turning off the whole discussion (`DiscussionController.java:140-157`) or an admin acting by hand.
- Attack: any account posts slurs or spam under any post that has discussion on; the post's author cannot delete it.
- Fix: allow the post owner to delete comments on their own post (`DELETE FROM comments WHERE id=? AND discussion_id IN (SELECT d.id FROM discussions d JOIN users_posts_junctions j ON j.post_id=d.post_id WHERE j.user_id=?)`), and add `POST /api/comments/{id}/report` and `POST /api/users/{u}/report` reusing the `ReportController` limiter and reasons.

### M9. Image decoding can exhaust memory, and the upload quota check has a race
- Where: `ImageProcessingService.java:60` (40 megapixels, about 160 MB decoded per image), `UploadController.java:148,186-187,222-223` (decode plus up to three variants per upload; real size limit is 50 MB, `application.properties:54`, though the message at `UploadController.java:149` says 5 MB), `AuthController.java:680-682,741` (avatar up to 25 MB). `UploadController.java:195` checks the quota and `213-217` records the file later.
- Attack: a handful of concurrent uploads (each from a different bot account) of 40 MP images exhausts the heap (`OutOfMemoryError` takes the server down); 100 parallel uploads started before any is recorded all pass the quota check and exceed it by 100×.
- Fix: lower `MAX_PIXELS` to 16,000,000; wrap decode and variant generation in a global `Semaphore(2)` with a timeout (503 when busy); do the quota check and the `uploads` insert in one transaction guarded by `SELECT ... FROM users WHERE id=? FOR UPDATE`; set `UPLOAD_MAX_BYTES` to 8 MB for post images. Uncertain: whether Tomcat spools the multipart body to disk before the auth check runs (`UploadController.java:136-147`); if so unauthenticated clients can write up to 50 MB of temp files per request, so cap `client_max_body_size` on those routes at the real limits.

### M10. No Content-Security-Policy anywhere, and the security headers only reach API responses
- Where: `SecurityConfig.java:63-69` sets `X-Frame-Options`, `nosniff` and `Referrer-Policy` on responses from Spring only; the documented nginx config (`README.md:129-165`) serves the SPA HTML and `/uploads/` itself and adds no headers; `grep` found no `Content-Security-Policy` in the repository.
- Uncertain: I cannot see the production nginx file. If it matches the README, the page that matters (`index.html`) can be framed (clickjacking) and has no CSP, and files under `/uploads/` carry no `nosniff`.
- Fix: in nginx add `add_header X-Frame-Options "DENY" always; add_header X-Content-Type-Options "nosniff" always; add_header Referrer-Policy "strict-origin-when-cross-origin" always; add_header Strict-Transport-Security "max-age=31536000" always; add_header Content-Security-Policy "default-src 'self'; img-src 'self' data: blob:; media-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" always;` (the app uses inline styles for Lexical, hence `unsafe-inline` for styles only), and repeat the `nosniff` header inside `location /uploads/`.

### M11. Public lists reveal every user and when they were last online
- Where: `AuthController.java:382-388` (all usernames and `last_active_at`, unbounded, unauthenticated), `747-760` (per-user online status), `SocialController.java:38-50` (followers and following lists, unbounded).
- Impact: with open sign-ups this is a full user directory with activity timestamps, usable for stalking and for seeding the group and follow spam in M4 and M5.
- Fix: require login for `recently-active`, add `LIMIT 100`; add a "hide my activity" flag honoured by `/online` and `recently-active`; page the followers and following endpoints (`LIMIT 100 OFFSET`).

---

## Low

- L1. Email tokens are not redeemed atomically (`EmailTokenService.java:114-129`): check then `UPDATE`. Two simultaneous requests with one token can both succeed. Fix: `UPDATE email_tokens SET used_at=NOW() WHERE id=? AND used_at IS NULL` and require 1 row updated. (256-bit tokens, 1 h reset expiry, hash storage, session eviction on reset at `EmailSettingsController.java:416`, and always-same forgot response at `364-389` are all fine.)
- L2. `validatePassword` (`AdminController.java:599-613`) runs four regex scans before the length check, on unbounded input; move `length() > 128` to the top. bcrypt only reads the first 72 bytes, so a 128-character passphrase is effectively cut; either document or pre-hash with SHA-256.
- L3. Post titles go unsanitised into email subjects and bodies (`EmailService.java:124,136-150`). Newlines in a title could inject headers (uncertain; depends on the Jakarta Mail version) and a hostile title is phishing text sent from your domain to followers. Fix: strip control characters (`replaceAll("\\p{Cntrl}", " ")`) in `validatePost` and when building the subject.
- L4. Error text leaks server paths: `UploadController.java:128,234` return `"Failed to store file: " + e.getMessage()`. Return a fixed string and log the exception.
- L5. Drafts are not fully private by id. These are public or open to any signed-in user without checking `published`: `/api/posts/{id}/features`, `/discussion`, `/views`, `/vote`, `/reactions` (`DiscussionController.java:42-80`, `SocialController.java:108-121,723-752`), comments of a draft whose discussion is on (`DiscussionController.java:161-177`), writing reactions, votes and comments to a draft (`SocialController.java:124-154,754-767`), and the report endpoint answers 404 versus 200 for draft ids (`ReportController.java:83-85`). No draft title or content leaks; the leak is existence, counts and who commented. Fix: one `isVisibleTo(postId, username)` helper, same rule as `PostController.canSee` (`:96-104`), used by all of them.
- L6. Login for an unknown username skips bcrypt (`JdbcLoginRepository.java:245`), so response time reveals which usernames exist. Fix: compare against a dummy hash when the user is missing. (Registration returning 409 for a taken name is normal.)
- L7. Uploaded originals keep their EXIF data including GPS (`UploadController.java:208` writes the raw bytes). Fix: re-encode JPEGs through `ImageIO` or strip APP1 segments.
- L8. No self-service account deletion; admin deletion leaves the user's files on disk (`AuthController.java:437-453`, `JdbcLoginRepository.java:348-362` only delete database rows). Fix: add `DELETE /api/users/me` (password re-entry) and delete `uploads/` files for the user's `uploads` rows before the cascade.
- L9. Several inputs cause 500s instead of 4xx and log noise: unchecked casts (`DiscussionController.java:192,215`, `SocialController.java:495-496,762`), `login()` on a missing username (`JdbcLoginRepository.java:307`), `deletePost` with an unknown id (`PostController.java:529-530`, `getUsernameFromPostId` throws on no row), negative `limit` on message lists (`SocialController.java:364,575`). Add a `@ExceptionHandler` for `ClassCastException`, `NullPointerException`, `EmptyResultDataAccessException` returning 400/404, and `Math.max(limit,1)`.
- L10. CSRF defence rests entirely on `SameSite=Lax` cookies (`SecurityConfig.java:56-62`). That is sound today, but several endpoints take `@RequestBody String` (stickers, fonts, presets) and would accept `text/plain` form posts if a cookie were ever sent cross-site. Defence in depth: a filter rejecting non-GET requests whose `Origin` (or `Referer`) host is not in `app.allowed-origins`.
- L11. Upload renditions are not charged to the quota (`StorageAccountService.java:130-132,181-183`), so disk use is about 1.5 to 2.5 times what the quota shows. Fix: include `upload_variants` bytes in `filesChargedBytes`.
- L12. `fileLimitBytes` returns "no limit" when a user's role has no `role_limits` row (`StorageAccountService.java:97-101`); fall back to the `user` row's limit instead of null.
- L13. Rate limiter state is in memory and resets on restart; `RateLimiter` keys are per user so they are bounded, but add a periodic purge (`RateLimiter.java:28`).
- L14. Admin tooling note: `GET /api/users/{u}/export` (`AuthController.java:346-379`) builds the whole export in memory with no rate limit; limit it to once an hour per user.

---

## Checked and found fine

- SQL injection: every `jdbc.*` call in `posts/repository/*.java`, `posts/controller/*.java`, `posts/service/*.java` binds values with `?`. The only concatenated SQL is a fixed constant: comment order (`SocialRepository.java:185-190`, chosen from two literals), `PROFILE_ORDER` (`JdbcPostRepository.java:54,186`), the unsubscribe column (`EmailSettingsController.java:336-348`, from a `switch`), report filter (`ReportController.java:119-140`), and migration table names (`DatabaseMigrator.java:79,101,178`). `LIKE` patterns are bound parameters (`PostController.java:649`, `SocialRepository.java:803-808`).
- Draft and private post access: `PostController.java:271-296`, `47-198` (resolve, canonical, card, UserFromPostID all use `canSee`), `312-341` (profile list filters), `562-580` (pinned), `PageThemeController.java:84-115` (post theme), `StickyController.java:60-84` (hides unpublished anchors), `FeedController.java:55` (published only), `PostController.java:622-681` and `SocialRepository.java:787-800` (search and hashtags published only). Writes need the owner: `PostController.java:451-454,503-504,529-533`, `DiscussionController.java:63-64,92-94,111-113,131-133,150-152`.
- DMs and groups: reads and writes check `isConversationParticipant` or `isGroupMember` (`SocialController.java:352-413,455-466,550-576,587-615,648-675`); only admins add, rename and transfer (`505-634,679-704`). Notifications are scoped by `recipient_id` (`SocialRepository.java:393-407`). Email settings and preferences are owner-only (`EmailSettingsController.java:95-190`).
- Comments: edit and delete are `WHERE id=? AND user_id=?` (`SocialRepository.java:273-281`). Stickies, stickers, pixel fonts, banner, header, themes, bio, presets, background: path username must equal the authenticated user (`StickyController.java:44-53`, `StickerController.java:42-50`, `PixelFontController.java:46-54`, `ProfileBannerController.java:68-75`, `ProfileHeaderController.java:80-83`, `AuthController.java:97,133,164,204,225`). Shared packs are saved only for the sender's own stickers and fonts, with unguessable UUID links (`SharedPackController.java:62-110`).
- Mass assignment and privilege escalation: `is_admin` and `role` are written only in `AdminController.java:171,293`, each behind the admin check; `Post` updates copy named fields only (`PostController.java:459-468`); the settings endpoints read named keys only.
- Stored script injection: no `dangerouslySetInnerHTML` except KaTeX output with `trust: false` (`MathNode.jsx:93,106`); no `innerHTML`, `eval`, `srcdoc`, or `document.write` in `client/src`; usernames are limited to `[A-Za-z0-9_-]` (`AuthController.java:542`); comments, messages and bios render as React text, with only `https?://` linkified (`linkifyText.jsx:12-46`, `PostsViewer.jsx:29-56`); `document.title` is set as text (`usePageTitle.js`); bio-link URLs must start with `http://` or `https://` on the server (`AuthController.java:188`).
- Uploads: extension allowlist excludes SVG and HTML (`UploadController.java:49,156`, `AuthController.java:45,662`, `ProfileHeaderController.java:43,93`); file names are UUIDs so no path traversal (`UploadController.java:206-208`, `AuthController.java:707-708`); magic bytes plus full decode for PNG, JPEG and GIF (`ImageProcessingService.java:119-130`), pixel budget checked from the header before decoding (`:97-110`); avatar re-encoded to 512 px; audio capped at 20 MB with MP3 magic bytes. The quota call is no longer wrapped in a catch, so SECURITY.md item 11 (quota fails open) appears fixed (`grep` finds no "allow the upload" handler; a database error now surfaces as a 500). Separate gap: L12.
- Sessions, cookies, CORS: tokens are 192-bit `SecureRandom`, constant-time compared, fresh per login, idle and absolute expiry (`JdbcLoginRepository.java:111-131,264-288,327`); cookies are `HttpOnly`, `SameSite=Lax`, `Secure` outside dev (`AuthController.java:781-794`); CORS lists exact origins, no wildcard, startup check refuses localhost in production (`SecurityConfig.java:41-55`, `ProductionConfigCheck.java:55-63`); error output hides messages and stack traces in the prod profile (`application-prod.properties`). Password change and reset evict all sessions of the user (`AuthController.java:500`, `EmailSettingsController.java:416`).
- Rate limits present: login per IP and account, registration per IP, comments (5 per 5 min plus 15 s gap, `DiscussionController.java:26,202-213`), DMs, group messages and reactions (`SocialController.java:23-24`), reports (`ReportController.java:34`), pack shares, verification and reset mail per IP, notification email 3 per day per recipient.
- Account lifecycle: reset and verification tokens are single-purpose, hashed, expiring (1 h and 24 h), old tokens replaced on issue (`EmailTokenService.java:87-104`); an unverified address is never used for reset or notification mail (`EmailSettingsController.java:376-379`, `EmailNotificationService.java:60-61`); forgot-password always answers the same. Client service worker never caches `/api` or `/uploads` (`client/public/sw.js:19-23`).
- Privacy: emails, IP addresses and draft titles are not returned by any public endpoint I read; settings, storage, activity and export are owner-only (admin for the last three).

## Not verified

- The production nginx file, so M10 and the 50 MB body limit are inferred from `README.md` and `guide/DEPLOYMENT.md`.
- `SocialRepository.buildUserExport` and `restorePostsFromExport` (`SocialRepository.java:554-632`) and the admin import path were not read in detail; admin-only.
- Whether Jakarta Mail neutralizes CR/LF in `setSubject` (L3).
- Whether Tomcat spools multipart bodies before the auth check (M9).
- Whether `users.background_pattern` and similar columns are `text` after the V002 migration (the V001 definition is `varchar(2000)`); the validators allow up to 600,000 characters.
