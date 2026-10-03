# integrator-build-serve (Sonnet, general worker)

Prove the committed code, build it once, and put it on the local site so the
visual gate can run. You test and build **what is committed (HEAD)**, not the
working tree: the sign-in worker has half-finished, uncommitted files in the
tree (`pom.xml`, `AuthController`, `JdbcLoginRepository`, `LoginRepository`,
`Sso*.java`, V021, `Login.*`, `Registration.jsx`, `SettingsPage.jsx`,
`App.jsx`) and none of that may be in this build. Do not touch those files.

Scratchpad:
`/private/tmp/claude-501/-Users-mae-workspace-webposting--claude-worktrees-kind-driscoll-e5fb5f/87be1c04-857d-4336-9a7a-4bd52c5ce943/scratchpad`

## 1. Clean copy
`git archive HEAD | tar -x -C <scratchpad>/build-<short sha>` (a fresh folder).
In the copy, `client/` needs `node_modules`: symlink the worktree's
`client/node_modules`. Copy the worktree's `client/vite.arrange-check.config.js`
into the copy's `client/` (it is deliberately not committed).

## 2. Suites, in the copy
- `client`: `npx vitest run`. Record files / tests / failures.
- `server`: `./mvnw -q test` once, alone. It uses the shared test database
  `webposting_test`, which already has V021 applied by another worker's run
  while this copy only knows up to V020. If the migrator refuses to start
  because of that, do **not** drop or edit anything: report it and stop the
  server suite there. Otherwise record classes / tests / errors / failures
  from `target/surefire-reports` of the copy. A failure: rerun that class once
  alone; if it fails again, report it with the assertion message. Do not fix
  code.
- `node --test tools/menu.test.mjs`.

## 3. Build, in the copy
`npx vite build` in the copy's `client/` (never in the worktree), then
`./mvnw -q -DskipTests package` in the copy's `server/`. Copy the jar to
`<scratchpad>/run/app.jar` (keep the old one as `app.prev.jar`).

## 4. Restart the local site (only if section 2 has no real failures)
The local site is API port 8081 on database `testdb`, and a preview on 5175.
Find how they were started before (`<scratchpad>/run/`, any `*.sh` or log
there) and do the same with the new jar and the new `dist`: environment
`APP_PROFILE=dev DB_NAME=testdb SERVER_PORT=8081
ALLOWED_ORIGINS=http://localhost:5175`, preview with
`npx vite preview --config vite.arrange-check.config.js` from the copy's
`client/`. Stop the old two processes first (by the ports they listen on;
nothing else). Never print or read secrets; the dev profile needs none.
Confirm: `/api/build` (or the health route) answers; the log shows V019 and
V020 applied to `testdb`; http://localhost:5175 serves the new build.

## 5. Accounts for the gate
Through the local site's sign-up (or the admin panel's create-user as
`test`), make two local accounts `vt4` and `vt5` (password the same as the
name, like the other local test accounts) if they do not exist. If sign-up
needs a confirmed email locally, say what you did instead.

## 6. Smoke
`node tools/smoke/run.mjs` against the new site. Record pass / fail per check.

## Report
Commit built (sha), suite numbers, smoke numbers, whether the site is up on
the new build, the two accounts, anything refused or skipped. No commit, no
push, nothing on production, no edits to source.
