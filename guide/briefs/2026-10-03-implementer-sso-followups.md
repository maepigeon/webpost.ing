# implementer-sso-followups (Sonnet, `implementer`)

Sign in with Google and Microsoft is committed (`93b59cf`) and off until its
keys are set. Its builder left insertions for files outside its list. Apply
them. Read first: the top of `guide/SSO-PLAN.md` (built / not built) and
`guide/DESIGN-RULES.md`.

A build of HEAD is being tested right now from a clean copy, so editing the
worktree is safe; just do not run `vite build` or start a server.

## Server
1. `posts/service/SecurityLog.java` `KINDS`: add `"identity_linked"`,
   `"identity_unlinked"`; then `SsoAccounts.logIdentityEvent` calls
   `securityLog.record` instead of writing the rows itself. Keep its tests
   passing.
2. `JdbcLoginRepository.authenticate`: a provider-only account stores `'!sso'`
   as its password. After the `stored == null` check add
   `if (!stored.startsWith("$2")) { bcrypt.matches(password, DUMMY_HASH); return -1; }`
   so a password attempt on such an account takes the same time as any other
   failure and Spring does not log a warning per attempt. Use the dummy hash
   the class already has for unknown usernames (if it has none, add one,
   computed once at class load with the same cost). Test: refused, and no
   exception.
3. One sign-up limiter. `AuthController.register` keeps per-network counters
   (1 an hour, 3 a day) in private maps and provider sign-up has its own copy,
   so one network can make one of each per hour. Move the counters into one
   small class both use (`SignupLimiter`, same numbers, same messages), with a
   test that a password sign-up followed by a provider sign-up from the same
   network within the hour is refused.
4. `SocialRepository.buildUserExport`: include the member's `user_identities`
   rows (provider, email, linked date; never the provider subject id) in the
   data export. Test.
5. `AccountController.deleteOwn` asks for a password, so a provider-only
   account cannot delete itself. Accept, for an account with no password, the
   same "fresh provider sign-in" mark that setting a first password uses
   (`SsoFlowStore`); an account with a password is unchanged. Tests for both.

## Client
6. `components/Pages/Settings/securityEvents.js` `LABELS`:
   `identity_linked: 'Sign-in method linked'`,
   `identity_unlinked: 'Sign-in method unlinked'`.
7. `components/Pages/Settings/SettingsPage.jsx`: when
   `GET /api/auth/sso/methods` says `hasPassword: false`, the "Password"
   section (current / new password) is not shown; the "Sign-in methods"
   section already offers "Set a password". When no provider is configured the
   request is skipped or its 404 is quiet, and the Password section shows as
   today. Test both.
8. Delete account for a provider-only account (pairs with 5): the form asks
   them to confirm through their provider instead of asking for a password
   they do not have. Keep the wording to one short line.

## Config and guides
9. `config/deploy.env.example`: a commented block for `SSO_GOOGLE_CLIENT_ID`,
   `SSO_GOOGLE_CLIENT_SECRET`, `SSO_MICROSOFT_CLIENT_ID`,
   `SSO_MICROSOFT_CLIENT_SECRET`, `SSO_MICROSOFT_TENANT`, `SSO_REDIRECT_BASE`.
   Placeholders only.
10. `guide/WORKING-HERE.md`: latest migration is V021.
    `guide/project-structure.md`: rows for the `Sso*` classes,
    `SsoController`, `ProfileSummaryController`, `SignInMethods.jsx`,
    `ChooseUsername.jsx`, `SsoButtons.jsx`, `inboxModel.js`,
    `PreviewLine.jsx`.

## Checks
Server: `SsoFlowTest`, `SsoOffTest`, `SsoProviderClientTest`, the account and
auth test classes you touched, and your new tests. Client: `npx vitest run`.
Then, because these are sign-in files, run the full server suite once
(`./mvnw -q test`); another worker may be running a suite at the same time on
the same test database, so a strange failure outside your files gets one
rerun before you report it.

## Report
Per item done / not done and why, files, test counts. No commit, no
`vite build`, no servers, no migration.
