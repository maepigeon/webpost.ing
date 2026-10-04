# SSO, recovery and account repair — plan

## What to do to switch it on (owner's checklist)

Built on 2026-10-03: **Google and Microsoft**. Both are off, and the site is
unchanged, until their values are in `deploy.env`. **Apple is not built** (see
"What is built" below). The console steps are from memory and were not
re-checked online; check each provider's current pages as you go. **[recheck]**

**Google** (free, about an hour)
- [ ] Google Cloud Console: create a project.
- [ ] "OAuth consent screen" (Google Auth Platform > Branding): app name
      webpost.ing, support email, authorised domain `webpost.ing`, link to the
      privacy page. Audience: External. Scopes: only `openid` and `email` (no
      review is needed for these).
- [ ] Publish it ("In production"). In "Testing" only the listed test users
      can sign in.
- [ ] Credentials > Create credentials > OAuth client ID > **Web application**.
      Authorised redirect URI, exactly:
      `https://webpost.ing/api/auth/sso/google/callback`
- [ ] Put the client ID and secret in `deploy.env` as `SSO_GOOGLE_CLIENT_ID`
      and `SSO_GOOGLE_CLIENT_SECRET` (never in chat or the repository).

**Microsoft** (free, about an hour)
- [ ] Microsoft Entra admin centre > App registrations > New registration.
      Supported account types: "Accounts in any organizational directory and
      personal Microsoft accounts" (so Outlook.com people can sign in).
- [ ] Redirect URI, platform **Web**, exactly:
      `https://webpost.ing/api/auth/sso/microsoft/callback`
- [ ] Certificates & secrets > New client secret. Copy its **Value** (shown
      once). Note the expiry (24 months at most) in your calendar: Microsoft
      sign-in stops the day it runs out, until a new one is put in.
- [ ] Put the Application (client) ID and the secret value in `deploy.env` as
      `SSO_MICROSOFT_CLIENT_ID` and `SSO_MICROSOFT_CLIENT_SECRET`. Leave
      `SSO_MICROSOFT_TENANT` unset (it defaults to `common`, which matches the
      account types above).

**Then**
- [ ] Check `APP_BASE_URL=https://webpost.ing` in `deploy.env` (the redirect
      addresses are built from it), and restart the server.
- [ ] Open the sign-in page: "Continue with Google" / "Continue with
      Microsoft" appear. Sign in with your own Google account: you are asked
      for a username (and an invite code while those are required), and land
      signed in. Sign out and in again with Google: straight in.
- [ ] To use Google with the account you already have: sign in with your
      password, Settings > Sign-in methods > Link.
- [ ] Decide whether a provider sign-up needs an invite code. Today it follows
      the same switch as password sign-up ("Invite code needed to sign up").

To switch a provider off again, remove its two values and restart. People who
only had that provider can then not sign in until it is back; one with a
confirmed email can get in with "Forgot password?" once mail is on, and an
admin can set a password for anyone (admin dashboard, Users).

Environment names and the local-testing addresses: [CONFIGURATION.md](CONFIGURATION.md),
"Sign in with Google and Microsoft".

### What is built, and what is not (2026-10-03)

Built and tested (`SsoFlowTest`, `SsoProviderClientTest`, `SsoOffTest`):
sections 3.1 (flow), 3.2 (`user_identities`, migration V021), 3.3 (linking
rules, never by email), 3.4 (choose a username; invite policy and sign-up
limits) and 3.5 (set a first password, unlink guard), for Google and
Microsoft. Differences from the text below:

- The page after a first sign-in is `/routes/ChooseUsername` (not
  `/sso/choose-username`): `routes` is already a reserved name, `sso` is not.
- No `users.has_password` column. An account made through a provider has
  `'!sso'` in `users.password`; having a password is "the value is a bcrypt
  hash". Reset by email and an admin setting a password therefore just work.
- State, nonce and the pending identity are kept in the server's memory (like
  sessions) and tied to the browser by an HttpOnly cookie; nothing is signed.
- Re-authentication for an account with no password is a provider sign-in in
  the last 5 minutes (Settings offers "Continue with ..." for it). The
  emailed-link alternative in 3.5 is not built.

Not built: **Apple** (step 6: it posts the callback from another site, which
needs a change to the cross-site check in `OriginCheckFilter` and a
`SameSite=None` state cookie, plus the paid account; `SSO_APPLE_*` values are
ignored and Apple answers 404), security emails and "This wasn't me" (4.2),
`locked_at`, the new-device notice, the admin tools in 4.2, the "set a
password" banner, identities in the data export, and the Help and privacy page
text (step 7).

---

Status of the rest of this document: proposal, 2026-10-03. Provider console
steps and Apple/Microsoft requirements are from memory and were not re-checked
online. Re-check each provider's current docs before registering. **[recheck]**

---

## 1. Straight answer

**How hard?** Medium. The sign-in code is about 3-5 days of work. The
provider setup is an afternoon each for Google and Microsoft, and a day for
Apple (paid account, more steps). Account linking, recovery and the security
log are the larger part and are what keep the feature safe. Email must be on
first: linking, "set a password", recovery and "this wasn't me" all depend on
it.

**What exists now** (read from the code): username plus bcrypt password
(`AuthController`, `JdbcLoginRepository`); sessions are cookies `username` +
`authToken` backed by an **in-memory** map, capped per user, rotated on login,
all of a user's sessions dropped on password change or reset
(`evictSession`); invite codes at registration; optional **verified** email
(address is held on a token until confirmed, so `users.email` with
`email_verified = TRUE` is trustworthy); `POST /api/password/forgot` and
`/reset` (confirmed addresses only, rate-limited, same answer whatever the
address); a `frozen` role with zero limits. Mail is built but off in
production (`MAIL_ENABLED`, `guide/EMAIL.md`).

Two consequences: sessions vanish on server restart (fine, users sign in
again; but a security log needs a table, not memory), and `register` requires
a password, so SSO sign-up needs its own path.

## 2. What Mae must do herself

| Provider | Steps (yours alone) | Cost |
|---|---|---|
| Mail first | Pick an SMTP service, add SPF/DKIM/DMARC DNS records, run `enable-mail.sh`, send a test reset | Free tiers are enough |
| Google | Google Cloud Console: create project, OAuth consent screen (app name, logo, authorised domain `webpost.ing`, privacy policy URL, support email), then Credentials > OAuth client ID > Web application. Add redirect URI. Publish the consent screen to "In production" (Testing mode limits to listed users and expires tokens). Scopes: `openid email profile` only, so no review is needed. | Free |
| Microsoft | Entra admin centre > App registrations > New. Supported account types: "Accounts in any organizational directory and personal Microsoft accounts" (so Outlook.com users can sign in). Add Web redirect URI. Certificates & secrets > new client secret (note the expiry; max 24 months, put a reminder in your calendar). | Free |
| Apple | Paid Apple Developer Program account. Identifiers: an App ID with "Sign in with Apple" enabled, then a **Services ID** (this is the client id) with `webpost.ing` as domain and the return URL. Keys: create a Sign in with Apple key, download the `.p8` once (cannot be re-downloaded), note Key ID and Team ID. Domain verification: host Apple's file at `/.well-known/apple-developer-domain-association.txt` (we add a nginx location; you give us the file). If you want users' real email relayed, register your sending domain and SPF in "Email Sources". | $99/year |

### Values in `deploy.env` (names only)

```
SSO_GOOGLE_CLIENT_ID      SSO_GOOGLE_CLIENT_SECRET
SSO_MICROSOFT_CLIENT_ID   SSO_MICROSOFT_CLIENT_SECRET   SSO_MICROSOFT_TENANT   # "common"
SSO_APPLE_CLIENT_ID       # the Services ID
SSO_APPLE_TEAM_ID         SSO_APPLE_KEY_ID              SSO_APPLE_PRIVATE_KEY  # .p8 contents or path
```
A provider with no id configured is simply not offered on the sign-in page.
Reuse `APP_BASE_URL` for building redirect URLs.

### Redirect URLs to register (exactly, https, no trailing slash)

```
https://webpost.ing/api/auth/sso/google/callback
https://webpost.ing/api/auth/sso/microsoft/callback
https://webpost.ing/api/auth/sso/apple/callback        (Apple POSTs here: form_post)
```
For local testing add `http://localhost:<port>/...` variants (Google and
Microsoft allow localhost over http; Apple does not, so Apple is tested on a
staging domain or not at all locally).

## 3. Design

### 3.1 Flow
OpenID Connect **authorization code with PKCE**, plus `state` and `nonce`, run
on the server:

1. `GET /api/auth/sso/{provider}/start?intent=signin|link` creates `state`,
   `nonce`, PKCE verifier; stores them in a short-lived (10 min) signed,
   `HttpOnly`, `SameSite=Lax` cookie (or a small table); redirects to the
   provider.
2. Provider redirects to the callback with `code` and `state`. Server checks
   `state` against the cookie, exchanges the code (client secret; Apple: a JWT
   signed with the `.p8` key as secret), validates the **ID token**:
   signature against the provider's JWKS, `iss`, `aud`, `exp`, `nonce`.
3. Reads `sub`, `email`, `email_verified`. Apple POSTs the callback and sends
   the user's name only on the first sign-in; use `SameSite=None; Secure` for the
   state cookie for Apple's POST, or carry state in the table instead.
4. Applies the linking rules below and either creates the usual session
   cookies via the existing `login` path (so rotation, caps and logging stay in
   one place) or sends the user to choose a username.

**Library choice: hand-write a small flow, do not use
`spring-boot-starter-oauth2-client`.** Reason: that starter wants to own the
security filter chain, `HttpSession` and `SecurityContext`, but this app has its
own cookie sessions and no Spring Security session model; fitting them
together is more code and more surprise than the flow itself. What we need
is small: build a URL, POST to a token endpoint, verify a JWT. Use the
`nimbus-jose-jwt` library (already pulled in by Spring Security
transitively if present; otherwise add it) for JWKS signature checks and
Apple's client-secret JWT. Do **not** hand-roll JWT verification. Use
`java.net.http.HttpClient` with timeouts for the token call. If the team later
adopts Spring Security sessions, revisit.

### 3.2 Tables

```sql
CREATE TABLE user_identities (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider    VARCHAR(16) NOT NULL,        -- 'google' | 'microsoft' | 'apple'
  subject     VARCHAR(255) NOT NULL,       -- the provider's stable "sub"
  email       VARCHAR(255),                -- as the provider reported it, informational
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  UNIQUE (provider, subject)
);
CREATE INDEX ON user_identities(user_id);

CREATE TABLE security_events (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       VARCHAR(32) NOT NULL,   -- sign_in, sign_in_failed, password_changed, password_reset,
                                     -- email_changed, identity_linked, identity_unlinked,
                                     -- sessions_ended, account_locked, account_restored
  provider   VARCHAR(16),
  ip         INET, user_agent VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON security_events(user_id, created_at DESC);

-- users: allow SSO-only accounts
ALTER TABLE users ADD COLUMN has_password BOOLEAN NOT NULL DEFAULT TRUE;  -- FALSE until one is set
ALTER TABLE users ADD COLUMN locked_at TIMESTAMPTZ;  -- see 4.2
```
Identity is matched on `(provider, subject)`, **never on email**. For SSO-only
accounts, store an unusable password hash (random, never shown), and refuse
password sign-in while `has_password` is false.

### 3.3 Linking rules (the safe part)

| Situation at callback | Action |
|---|---|
| `(provider, sub)` already linked | Sign in that user. |
| Not linked; user is **signed in** and used `intent=link` | Link to the signed-in user after a fresh check (see below). |
| Not linked; not signed in; provider says `email_verified` AND a local account has the same email with `email_verified = TRUE` | Do **not** auto-link. Show "An account with this email exists. Sign in with your password, then link this provider in Settings." Reason: a local account may be sitting on that address, and a provider's email claim is only as strong as that provider (Microsoft accounts in particular can carry unverified emails). |
| Not linked; no local match | Create a new account (3.4). |
| Provider email unverified or missing (Apple private relay is fine, it is verified) | Create account without a verified email; ask for and verify an email later. Never match on it. |

Auto-linking is deliberately never done in v1. Linking costs the user one
extra step once. Revisit only if Mae wants it, and only under the exact rule
"provider-verified email equals a locally verified email".

Linking from Settings requires re-authentication: the user's password (or, for
an SSO-only account, a fresh sign-in with an already-linked provider within
5 minutes). Linking sends a security email and writes `identity_linked`.

### 3.4 First sign-in creates an account
- Redirect to `/sso/choose-username` holding a short-lived signed "pending
  identity" token (10 min, single use, server side; contains provider, sub,
  email, no secrets).
- Username rules identical to `register` (3-32 chars, `[A-Za-z0-9_-]`, reserved
  names, case-insensitive uniqueness).
- **Invite code policy:** follow whatever `register` requires at that time.
  If invite codes are required, ask for the code on that screen. If sign-up is
  open, SSO is allowed and the daily cap and per-network limits still apply
  (shared with `register`, one counter).
- Account is created with `has_password = FALSE`. If the provider gave a
  verified email, set `email` and `email_verified = TRUE` directly (no mail
  needed, the provider proved it). Otherwise leave it empty.
- A banner on the first visits: "Set a password so you can sign in without
  Google" with a button to Settings.

### 3.5 Set a password, change, unlink
- **Set a password** (Settings, SSO-only accounts): needs a recent SSO sign-in
  (within 5 min) or an emailed confirmation link; same `validatePassword`
  rules; sets `has_password = TRUE`; ends all other sessions; writes
  `password_changed`; sends a security email.
- **Unlink** a provider only when another sign-in method remains: a password
  (`has_password`) or another linked provider. Otherwise the button is disabled
  with the reason shown. Writes `identity_unlinked` and emails.
- **Changing email** keeps the existing flow (token first, write on confirm).
  The security email goes to the **old** address as well.

## 4. Recovery and repair

### 4.1 What already works
Email reset (confirmed addresses only), all sessions ended on reset and on
password change, always-the-same answer to `forgot`, rate limits. Keep.

### 4.2 To add

| Item | Detail |
|---|---|
| **"This wasn't me" link** | Every security email (new sign-in from new device, password changed, email changed, provider linked) carries a one-use link, valid 7 days. Opening it (confirm button, POST, not a bare GET so link scanners cannot trigger it): sets `locked_at`, ends all sessions, unlinks identities added within the last 7 days, cancels pending email change, and sends a reset link to the **verified** email on file (the old address if the email was just changed). Writes `account_locked`. |
| **Locked state** | While `locked_at` is set, sign-in (password and SSO) is refused with "Reset your password to unlock", content stays public and unchanged. Completing a reset clears it. |
| **Security log** | Settings > Security: last 50 `security_events` (when, what, provider, approximate place from IP prefix is optional and skipped in v1, browser name), plus "Sign out everywhere". Retention: 90 days, pruned nightly. |
| **New-device notice** | Email on sign-in from a browser not seen before (cookie `device` with a random id, hashed in the table). Only when the user has a verified email. Rate-limit per user per day. |
| **Admin tools** | In the admin panel: **Freeze** (existing `frozen` role, plus `evictSession`), **Restore** (previous role, writes `account_restored`), **Force reset** (locks and mails a reset), **End all sessions**, view a user's security log. Admin actions are logged with the admin's name. |
| **Hacked account's content** | Freeze first, never delete. Admin can hide posts created after a given time (a `hidden_by_admin` flag) so the owner can review and restore them after recovery. Remove messages and follows the attacker sent only on the owner's request. Owner gets the list of changes in the security log. Mae-only manual path for a user with no verified email: prove control by messaging from a linked provider, or accept loss. State this plainly in the Help page. |

## 5. Abuse and privacy

- **Bot barrier.** SSO sign-ups are tied to a real Google, Microsoft or Apple
  account, which is a better barrier than a CAPTCHA. Open sign-ups (security
  review H1) can therefore offer: SSO with no CAPTCHA, or username+password
  with email verification before posting and/or a CAPTCHA. Keep the per-network
  limits for both. Do not assume SSO accounts are trustworthy: a throwaway
  Microsoft account is cheap, so keep post/upload limits per new account.
- **Apple private relay.** Users may share a relay address
  (`…@privaterelay.appleid.com`). It forwards only from sources registered in
  Apple's "Email Sources", so register the sending domain or mail will vanish.
  Treat a relay address as an ordinary verified email; do not special-case it,
  but never use it for matching.
- **What is stored.** Provider, subject id, the email the provider reported,
  verified flag, timestamps. **Not stored:** access tokens, refresh tokens, ID
  tokens, profile photo, or name. We call the token endpoint once and discard
  everything but those fields. Scopes: `openid email` (and `profile` for Google
  only if we want a default username suggestion).
- **Security log privacy.** IP stored as given by the proxy (never from
  `X-Forwarded-For` except as the trusted proxy sets it, as `getClientIp`
  already does). 90-day retention.
- **Deletion.** Account deletion (`DELETE /users/{u}`) removes identities and
  security events through `ON DELETE CASCADE`. Add them to the data export
  (`/users/{u}/export`), minus the log if Mae prefers. Update the privacy page:
  which providers, what is kept, how to unlink.
- **Rate limits.** `start` and `callback` limited per network; callback errors
  never reveal whether an email has an account.

## 6. Phased steps

| # | Step | Size | Tests |
|---|---|---|---|
| 0 | Switch mail on in production; send a real reset to yourself. Blocker for all else. | Mae, 1-2 h | manual |
| 1 | Migrations: `user_identities`, `security_events`, `users.has_password`, `users.locked_at`. Security events written from existing flows (sign-in, password change/reset, email change). Security log page. | 1-2 days | log written per flow; log hidden from other users; pruning |
| 2 | Security emails and "this wasn't me" lock + locked state + admin freeze/restore/force reset. | 2-3 days | lock ends sessions; locked refuses sign-in; reset unlocks; link single-use; link requires POST |
| 3 | Google sign-in (hand-written OIDC, PKCE, state, nonce, JWKS validation), choose-username, SSO-only accounts, banner, set password in Settings, unlink guard. | 3-5 days | bad state, bad nonce, wrong `aud`, expired token, replayed code, wrong signature all rejected; same `sub` signs in same user; username rules shared with `register`; invite policy honoured; unlink last method refused |
| 4 | Linking rules (no auto-link) and Settings > link with re-auth. | 1-2 days | existing verified email match does not log in; link needs fresh auth; two accounts cannot link one `sub` |
| 5 | Microsoft (same code, different endpoints and issuer handling for `common`). | 1 day | issuer validation for personal vs work accounts |
| 6 | Apple (client secret JWT, form_post callback, first-time-only name, relay email, domain-association file). | 2-3 days | callback via POST; secret JWT claims; no name on second login handled |
| 7 | Help and privacy page text, abuse limits, docs in `guide/`. | 1 day | none |

Use a fake OIDC provider in tests (a local JWKS and token endpoint in the test
class) so tests never need a network.

## 7. Mae's checklist

- [ ] Mail provider chosen; SPF, DKIM, DMARC set; `enable-mail.sh` run; a real reset mail received.
- [ ] Decide: do SSO sign-ups need an invite code, or are they open?
- [ ] Google Cloud project, consent screen in production, web client created, redirect URI added; send me the client id and secret (into `deploy.env`, not chat).
- [ ] Microsoft Entra app registered (any directory + personal accounts), redirect URI added, secret created, expiry in calendar.
- [ ] Apple Developer Program paid ($99/year); Services ID, key (.p8 saved safely), Team ID, domain file; sending domain registered for relay mail.
- [ ] Put the `SSO_*` values in `deploy.env` and restart.
- [ ] Write or approve the privacy page text and a contact address for recovery help.

## 8. Questions for Mae

1. Is Apple needed for v1, or Google and Microsoft first (Apple is $99/year and the most work)?
2. SSO sign-ups: invite code required, or open?
3. Should open sign-ups also keep a CAPTCHA for password sign-ups, or require verified email before posting?
4. OK that a user with no verified email can only be recovered by you by hand (or not at all)?
5. Is a 90-day security log OK, and should it show IP addresses to the user?
