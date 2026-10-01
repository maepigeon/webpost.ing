# Security Review — 2026-09-08

A pass over authentication, authorization, input handling, secret management and
repository hygiene. Findings are ordered by severity. Everything marked
**FIXED** was fixed in this session and is covered by tests; everything marked
**OPEN** still needs a decision or work.

The short version: there was no SQL injection, no missing-authorization hole in
the API, and upload handling was already solid. The real exposure was in secret
management, session lifecycle, and CSRF.

---

## Critical

### 1. Two database passwords are committed in git history — **OPEN, needs you**

Nine commits contain a `server/src/main/resources/application.properties` with a
live credential:

| Commit(s) | Value |
|---|---|
| `5f1936e5`, `87f7bb37`, `92fbc3d3`, `bda8340` … | `spring.datasource.password=…` (user `postgres`, the **superuser**) |
| `74a203e7`, `8a71fa24`, `8ddf14b3`, `95c1dbb1` … | `spring.datasource.password=…` |

*(2026-10-01: the values themselves used to be written out in this table,
so this document was publishing them too. The repository is public, so
assume both passwords are known: rotation is not optional.)*

The file is gitignored *now*, but ignoring a file does not remove its history.
**Publishing this repository publishes both passwords**, and credential
scanners index new public repos within minutes.

Two things must happen, in this order:

1. **Rotate both passwords on every machine that ever used them.** Do this
   first and regardless — assume they are already compromised. Especially the
   `postgres` superuser one.
2. **Scrub them from history** before pushing publicly, with
   [`git-filter-repo`](https://github.com/newren/git-filter-repo):

   ```bash
   git filter-repo --path server/src/main/resources/application.properties --invert-paths
   ```

   This rewrites every commit, so it changes every hash. Fine for a repo only
   you clone; coordinate if anyone else has a copy.

If you would rather not rewrite history, the alternative is to publish a fresh
repository with no history (`rm -rf .git && git init`). Rotating the passwords
is not optional either way.

I have not run either command — rewriting your history is your call.

### 2. `node_modules` was committed — **FIXED**

14,292 of 14,490 tracked files were dependencies, including
`client/node_modules` and a root `node_modules`. Beyond a 44 MB `.git` and
unusable diffs, publishing vendored dependencies means shipping third-party
code under assorted licenses as if it were yours, and any known-vulnerable
version stays pinned in history.

Untracked, and `.gitignore` rewritten to cover `node_modules/`, build output,
dumps, uploads, logs, keys and `*.env` (with `*.env.example` re-included). Also
removed a stray compiled `BOOT-INF/…/AuthController.class` from an unzipped JAR.

Tracked file count: **14,490 → 197**.

---

## High

### 3. Session tokens never rotated — **FIXED**

`login()` reused the existing token when a session was already present:

```java
if (loginMap.get(username) != null) {
    authToken = loginMap.get(username).token;   // same secret, new expiry
}
```

Each login pushed the expiry forward without changing the secret, so a token
captured once stayed valid indefinitely as long as the user kept logging in —
and a password change did nothing to invalidate it. Every login now mints a
fresh token via `SecureRandom`.

### 4. CSRF was fully open in production — **FIXED**

CSRF protection was disabled (`csrf.disable()`) *and* cookies were issued
`SameSite=None` in production. That combination means a third-party page could
make credentialed state-changing requests to the API on a logged-in user's
behalf. CORS does not help: it restricts *reading* the response, not sending
the request.

`SameSite=None` was never needed. Same-site is decided by registrable domain,
not port, so `localhost:5173 → localhost:8080` is same-site in development, and
in production nginx serves the SPA and proxies the API from one origin. Cookies
are now `SameSite=Lax` in both profiles, which closes this without CSRF tokens.
`SecurityConfig` documents that if cookies ever must go cross-site again, real
CSRF tokens have to come back with them.

### 5. Session map was not thread-safe — **FIXED**

```java
private static HashMap<String, AuthSession> loginMap = new HashMap<>();
```

Static state written by every request thread. Concurrent writes to a plain
`HashMap` can corrupt its internal table during a resize, losing or duplicating
entries — meaning sporadic spurious logouts, or a session surviving a logout.
Now a `ConcurrentHashMap`.

---

## Medium

### 6. Sessions leaked memory and were capped at one per user — **FIXED**

Sessions were only removed on logout or when someone happened to touch an
expired one, so abandoned sessions accumulated for the process lifetime — a slow
unauthenticated memory drain, since anyone can create sessions by logging in.

The map was also keyed by *username*, so a second login replaced the first:
signing in on your phone signed you out on your laptop.

Now keyed by token, with expired entries purged on each login and a
`MAX_SESSIONS` ceiling of 10,000. One account can hold concurrent sessions;
logging out ends only that device's session. `authorize()` checks that the
token's session actually belongs to the username presented, so a valid token
cannot be replayed against a different account name — verified by test.

### 7. Session expiry was date-granular with no idle timeout — **FIXED**

`expires = LocalDate.now().plusDays(1)` compared with `LocalDate.compareTo`
meant "valid until the end of some day": a session created at 23:59 lasted a
minute, one created at 00:01 lasted nearly two days. An abandoned session
stayed usable for the rest of the day however long it sat idle.

Replaced with two `Instant` deadlines — an absolute lifetime and a rolling idle
timeout refreshed on each authorized request — configurable via
`SESSION_LIFETIME_MINUTES` (default 24h) and `SESSION_IDLE_MINUTES` (12h).
Eight unit tests cover the boundaries, including that idle refresh can never
outlive the absolute deadline.

### 8. Plaintext passwords could reach the log file — **FIXED**

```java
return "LoginInfo [username=" + username + ", password=" + password + " …]";
```

`LoginInfo` is the request body of `/api/loginSessionAttempt`. Any debug
statement, exception message or Spring binding error that stringified it would
write a user's plaintext password to `/tmp/webposting.log`. Now prints `***`,
with a test asserting the password does not appear.

### 9. Token comparison leaked timing — **FIXED**

`authSession.token.equals(token)` returns as soon as it finds a differing
character. Now `MessageDigest.isEqual`. Low practical risk against a 192-bit
token, but free to fix.

### 10. `authorize()` logged a line per authorized request — **FIXED**

`System.out.println("Authorized user " + username + " to do something")` on
every authenticated call: an unbounded log of user activity, plus synchronous
I/O on the request path. All `System.out` calls in the repository replaced with
SLF4J at appropriate levels, none of which log credentials.

---

## Low

### 11. Upload quota check fails open — **OPEN**

`UploadController` wraps its storage-quota lookup in
`catch (Exception e) { /* allow the upload */ }`. A database hiccup lets a user
exceed their quota. Deliberate and commented, and the file-size and
magic-byte checks still apply, so the impact is bounded — but a failed quota
check should probably reject rather than admit.

### 12. Response headers were unset — **FIXED**

Added `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and
`Referrer-Policy: strict-origin-when-cross-origin`. CORS allowed headers were
narrowed from `*` to the three the client actually sends, and `ALLOWED_ORIGINS`
now filters out `*` explicitly — a wildcard origin on a credentialed endpoint
would let any site read a logged-in user's data.

---

## Checked and clean

Worth recording so the next review can skip them:

- **SQL injection.** Every query in every repository is parameterized. The only
  string-concatenated SQL is `DatabaseMigrator`'s tracking-table name, which is
  an internal constant, never request data.
- **Missing authorization.** Endpoint-by-endpoint audit against `authorize()`
  calls found no gap. `AdminController` checks `authorize(...) != null &&
  isAdmin(username)` on all 21 mappings, and `isAdmin` reads the database rather
  than trusting anything from the client. `PostController` looked short on
  checks only because a `deleteAllPosts` endpoint is commented out (see
  `guide/code-smells.txt`).
- **Upload handling.** Extension allowlist, magic-byte verification, UUID
  filenames, size cap, and SVG correctly excluded (it is an XSS vector). Files
  are served through Spring's resource handler, which resolves traversal.
- **Password storage.** BCrypt, with legacy plaintext rows upgraded on first
  successful login. Verified working locally.
- **Wallpaper CSS injection.** `PatternValidator` (33 tests) rejects `url()`,
  `expression()`, `javascript:`, `data:`, `@import`, `var()`, `env()`,
  `attr()`, angle brackets, backslash escapes and semicolons, and caps length.
- **PII in history.** No user emails, password hashes, database dumps or
  personal data in any commit. The only email addresses are in vendored
  dependency licenses.

---

## Before making the repository public

- [ ] **Rotate both old database passwords from item 1** everywhere they were used (the `postgres` superuser's first).
- [ ] **Scrub `application.properties` from history** (finding 1), then verify:
      `git log --all -p -- server/src/main/resources/application.properties`
      should return nothing.
- [x] Untrack `node_modules` and build artifacts.
- [x] Move every environment-specific value into `deploy.env` (gitignored) and
      confirm the committed `application*.properties` hold no secrets.
- [ ] Confirm `deploy.env` is absent from `git ls-files` after the rewrite.
- [ ] Add a LICENSE file, and decide whether the schema (`db/migrations/V001__schema.sql`) should ship
      with the `role_limits` seed only (it currently creates no users, which is
      correct).
