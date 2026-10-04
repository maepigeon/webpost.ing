# Accounts readiness — 2026-10-03

Mae asked: "make sure the password system works and is secure. get things
ready for users to be able to create accounts." This is what was proven, what
was fixed, and what she still has to do before sign-ups can open. Background:
[security-review-2026-10-03-open-signups.md](security-review-2026-10-03-open-signups.md),
[SECURITY.md](SECURITY.md), [EMAIL.md](EMAIL.md), [CONFIGURATION.md](CONFIGURATION.md)
("Opening sign-ups"), [SSO-PLAN.md](SSO-PLAN.md).

## Verdict

The password system works end to end and the checks below pass against a real
database. It is safe to **invite people one at a time with invite codes now**.
It is **not** ready for fully open sign-ups until mail is on (so addresses can
be confirmed) and either the bot check (Turnstile) or the verified-email rule
is working. Production still has mail off.

## What is verified, and by which test

All in `server/src/test/java/com/springbootprojects/webpostingserver/`. They run
the real application against the `webposting_test` database; mail goes to a
recording sender, so the emailed links are read back like a person would.

`AccountFlowsTest` (mail on):

| Flow | Test |
|---|---|
| Admin makes an invite, newcomer registers, code is spent, hash is bcrypt cost 12, confirmation mail is sent, address not trusted until used | `anInviteBuildsAnAccountThatCanSignInWithABcryptCost12Hash` |
| Bad passwords (short, no capital, no lower case, no digit, no symbol, over 72 bytes) refused with the reason; the invite code is not spent | `badPasswordsAreRefusedWithAReasonAndTheCodeIsKept` |
| Same name in another case: 409; reserved names: 400; neither spends the code | `aNameThatDiffersOnlyInCapitalsOrIsReservedIsRefusedWithoutSpendingTheCode` |
| No, used, expired and unknown codes refused (400, 410, 410, 403) | `missingUsedExpiredAndUnknownCodesAreAllRefused` |
| Invite switch off: no code needed, config says so, settings values validated | `withTheInviteSwitchOffNoCodeIsNeededAndTheConfigSaysSo` |
| Daily cap closes sign-up (503); one network gets one account an hour (429) | `theDailyCapAndTheNetworkLimitClosePublicSignUp` |
| Missing daily-limit row means 5, not unlimited | `anAbsentDailyLimitRowMeansFiveNotUnlimited` |
| Wrong passwords counted; account+address lockout (429) even with the right password; the owner elsewhere still gets in; same answer for unknown names; failure appears in the security log | `wrongPasswordsAreCountedAndLockOnlyThatAccountAtThatAddress` |
| Missing sign-in fields answer 400, never 500 | `aSignInWithMissingFieldsIsABadRequestNotAServerError` |
| Cookies: HttpOnly, SameSite=Lax, Path=/, Secure outside dev mode | `sessionCookiesAreHttpOnlyLaxAndSecureOutsideDevMode` |
| Sign out ends that session only | `signingOutEndsThatSessionOnly` |
| Change password: wrong current refused, weak refused, new one works, old refused, all sessions ended, logged, no password or hash in the server log | `changingThePasswordNeedsTheOldOneEndsEverySessionAndRetiresTheOldPassword` |
| Reset by email: link works once, a rejected password leaves it usable, sessions ended, old password refused, capitals in the address ignored | `aResetLinkWorksOnceSetsANewPasswordEndsSessionsAndIgnoresCapitalsInTheAddress` |
| Expired reset link refused | `anExpiredResetLinkIsRefused` |
| `forgot` answers the same for known, unknown and unconfirmed addresses; only the confirmed one is mailed | `forgotAnswersTheSameForKnownUnknownAndUnconfirmedAddressesAndMailsOnlyTheConfirmedOne` |
| Changing the confirmed address cancels open reset links | `changingTheConfirmedAddressCancelsAnOpenResetLink` |
| With `require_verified_email` on: an unconfirmed account is refused (403) on post, comment, follow, message and upload; reading works; admins are exempt; everything works after the mailed link is used; with the rule off everything works | `anUnconfirmedAccountCannotPostCommentFollowMessageOrUploadUntilItConfirms` |
| No hash or `password` field in any admin, export, settings, security-log or invite response | `noHashOrPasswordIsEverShownByTheApi` |
| Delete own account: wrong password refused; then posts, comments, follows, security log, mail tokens and sessions are gone; cookies cleared; cannot sign in again | `deletingTheAccountTakesTheirThingsAndTheirSessionsWithIt` |

`AccountsReadinessTest` (mail off, like production):

| Check | Test |
|---|---|
| New hashes are cost 12; salted | `newHashesUseCost12` |
| Which stored hashes count as "old" | `needsRehashOnlyForRealBcryptHashesOfALowerCost` |
| A cost 10 hash is upgraded to 12 at the next successful sign-in, not on a failed one | `anOlderHashIsUpgradedOnTheNextSuccessfulSignInAndNotBefore` |
| Null and over-long passwords refused without hashing | `nullAndOverlongPasswordsAreRefusedWithoutHashing` |
| With mail off, "forgot password" says so plainly and creates no token | `withMailOffForgotSaysSoAndCreatesNothing` |
| `require_verified_email` does nothing while mail is off, and also when `MAIL_ENABLED=true` but no SMTP host is set | `theVerifiedEmailRuleDoesNothingWhileMailIsOff`, `mailEnabledWithoutASenderDoesNotGateEither` |

Older tests that already covered parts: `ChangePasswordTest`, `AccountControllerTest`,
`SignupGateTest`, `EmailTokenServiceTest` (hashed tokens, single use, parallel
redeem), `OpenSignupHardeningTest`, `SecurityLogTest`.

## Bugs found and fixed

1. **Sign-in with a missing username or password crashed (500).** Now 400.
   `JdbcLoginRepository.login`.
2. **A missing daily-limit row meant "no limit"**, not the documented 5: the
   lookup threw and the surrounding catch let the sign-up through.
   `AuthController.register`. The admin settings call now also reports the
   default of 5.
3. **"Forgot password" missed addresses typed with other capitals** (sign-up
   lower-cases the address, the settings page did not). It now compares in lower
   case, and the settings page stores lower case. An address confirmed on two
   accounts now resets both instead of an arbitrary one.
   `EmailSettingsController`.
4. **"Forgot password" promised a link while mail was off** and filled the
   token table. It now says "Email is not switched on yet, so passwords cannot
   be reset by email. Ask the site admin to set a new one." and creates nothing.
5. **An open reset link survived a change of address.** Confirming a new
   address or removing the address now cancels open reset links.
6. **The verified-email rule could lock everyone out.** `PostingGate` looked only
   at `MAIL_ENABLED`; with that on but no `MAIL_HOST` no mail can be sent, yet new
   accounts would have been refused everywhere with no way to confirm. It now uses
   the same test as `EmailService.isEnabled()`.
7. **Password hashes used bcrypt's default cost 10.** All new hashes (sign-up,
   change, reset, admin) are cost 12 through one method
   (`JdbcLoginRepository.hashPassword`); older hashes are rewritten at the next
   successful sign-in. The timing pad for unknown names uses cost 12 as well.
8. Sign-in refuses passwords over 128 characters without hashing them (no real
   password is that long; it only cost CPU).

## Password storage review

- bcrypt, cost 12, salted; upgrade at sign-in; at most 72 bytes enforced on every
  path that sets a password (sign-up, change, reset, admin create/change).
- No plaintext or hash in logs: grep of every log statement found none;
  `LoginInfo.toString()` prints `***`; the change-password test captures the
  server output and checks it. (MockMvc's own request printing is switched off in
  these tests; it is the test harness, not the server.)
- No hash in any API response: `noHashOrPasswordIsEverShownByTheApi`; the only
  `SELECT *` on `users` is the sign-in lookup, and nothing from it is returned.
- Comparisons: session tokens use `MessageDigest.isEqual`. Mail links are stored
  as SHA-256 and looked up by hash, so timing cannot reveal a token. The
  unsubscribe token and invite codes are looked up with a plain database
  comparison; they are long random values and the unsubscribe token can only
  turn mail off, so this is accepted.
- Client: passwords live only in the form field. Nothing password-like is in
  `localStorage`, `sessionStorage` or a URL (grep). Fields use
  `autocomplete="current-password"` / `"new-password"`.

## What remains before opening sign-ups

1. **Mail is off in production.** Without it: no address confirmation, no reset
   by email, and `require_verified_email` does nothing. Until then, a person who
   forgets a password must ask the admin to set a new one (admin dashboard, Users).
2. **A bot barrier.** Either Turnstile keys, or the verified-email rule (which
   needs mail). Invite codes are the barrier meanwhile.
3. Open items from the security review that this task did not cover: the in-memory
   limits reset on restart; sessions are in memory (restart signs everyone out);
   no Content-Security-Policy yet (nginx, DEPLOYMENT.md section 8).
4. The password-reset page (`Settings/EmailActionPage.jsx`) still needs two
   placeholders, "New password" and "Confirm new password", now that field labels
   are visually hidden on the shared sign-in styles.
5. Nothing here was seen in a browser by the worker that wrote it: look at
   Sign in, Create account and the admin Settings tab at desktop and 390 px.

## Checklist for Mae, in order

1. **Mail service.** Pick an SMTP service, add its SPF, DKIM and DMARC DNS records
   (DMARC `p=none` to start), then on the server `sudo bash enable-mail.sh
   /path/to/deploy.env` (details in [EMAIL.md](EMAIL.md)). Check: sign in, Settings,
   add your address, the confirmation arrives; then use "Forgot your password?"
   from a signed-out window and complete a reset.
2. **Optional bot check.** Create a Cloudflare Turnstile widget, put
   `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in `deploy.env`, add the CSP
   lines from DEPLOYMENT.md section 8, restart. The sign-up page then shows the
   check and the server verifies it (fails closed).
3. **Flip the switches** in the admin dashboard, Settings tab, one at a time,
   trying a sign-up in a private window after each:
   1. "Confirm email before posting" **on** (needs step 1; the tab warns if mail
      is off).
   2. Keep "Sign-ups per day" low (5 to 20) while you watch the first days.
   3. "Invite code needed to sign up" **off** last. The tab warns if neither a bot
      check nor the email rule is protecting sign-up.
   To close again, turn the invite switch back on; nothing else needs undoing.
4. **Meanwhile, inviting the first people safely:** admin dashboard, Invite codes,
   make a code (valid 24 hours, works once), send it to the person privately.
   They create an account at `/routes/NewAccount`. Make a new code for each
   person; delete unused codes. A person who is locked out can be given a new
   password by an admin (Users).
