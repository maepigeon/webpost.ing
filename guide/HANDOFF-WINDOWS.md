# Handoff to the Windows session (written 2026-10-03, late evening, by the Mac session)

For the Claude session on Mae's Windows PC. Read this, then
`guide/WORKING-HERE.md`, `guide/DESIGN-RULES.md` and
`guide/briefs/BATCH-STATUS.md` (items 20 onward are tonight; it is the Mac
session's file: read it, do not edit it). No passwords, keys or server details
are in this file or may be put in any file.

## 1. State

- **Branch:** all current work is on `claude/ui-fixes-2026-10-01-clean`, about
  88 commits ahead of `main`. `main` is still `b6ef771` on purpose.
- **Not released.** Suites passed on a clean copy of `0bede03` (client 580,
  server 679, `tools/menu.test.mjs` 17). A five-area visual gate then failed
  every area; reports are `guide/visual-gate-2026-10-03-*.md`. Fixed since,
  not yet looked at on screen: the Button block's form, the top bar after a
  session ends, the accounts and admin items. Still open: dialogs (Report
  button unreadable on a Neon post page, Report dialog partly off-screen,
  share menu off the edge on a phone, confirm dialogs ignore Escape), profile
  (arrange view on a phone, delete reloads the page), editor (autosave Restore
  brings back only the start of the title), Activity tabs. Comment
  notifications have not been seen in a browser.
- **New this branch:** migrations V019, V020, V021 (all additive); list
  payloads without post bodies; profile summary in one request; sign-in with
  Google and Microsoft (off without keys; must not be switched on before a
  second security read); notifications that name and link their subject;
  backups tooling; `tools/menu.mjs` and Windows / Linux launchers;
  `tools/visual/` (recorded flows and frame sheets).
- **Pull request:** none yet (the GitHub CLI on the Mac is installed but not
  signed in).

## 2. Who owns what

| | Mac session | Windows session |
|---|---|---|
| webpost.ing | branch `claude/ui-fixes-2026-10-01-clean`, merges and releases to `main`, everything under `client/src` and `server/src`, `guide/briefs/BATCH-STATUS.md` | branches named `pc/<topic>` only; its own notes in `guide/briefs/PC-STATUS.md` |
| Deploys | Mae, from her Mac | never |
| webpaint.ing | `shell/`, `tools/`, `guide/` on `main` | `pc/<topic>` branches; later the engine build under a new top-level folder |

Rules for both: never commit to `main` or to the other session's branch; no
force pushes; no Co-Authored-By or "Generated with" lines; no downloads
without Mae's yes; nothing goes to Mae that has not been looked at on screen;
say plainly what was and was not run. Before touching a file under
`client/src` or `server/src`, tell the Mac session which files (a message),
because fix workers will be editing there. Messages are for nudges; work
travels through git.

## 3. Running and checking on Windows

Nothing in this repository has ever been run on Windows. Expect to find
problems; reporting them is useful work.

- **Needs:** Java 21, Node 20.19+ (the Mac uses the same React 18 / Vite /
  Vitest), PostgreSQL 15, Git for Windows (Git Bash) for the `tools/*.sh`
  scripts.
- **Menu:** `tools\webposting.cmd`, `tools\webposting.ps1` or
  `node tools/menu.mjs` (`--actions` prints the table). Untested on Windows:
  the bash search order, `taskkill` stop path, `cygpath` data folder, ssh
  without connection sharing.
- **Local site:** `tools/run-local.sh` (ports 5174 and 8090; `status`, `stop`).
- **Suites:** `client`: `npx vitest run`. `server`: `./mvnw -q test`, against
  a test database that is never the development one; one suite at a time
  (they share the database and `target/`). Environment names are in
  `guide/CONFIGURATION.md`.
- **Smoke:** `node tools/smoke/run.mjs --base http://localhost:5174`.
- **Visual:** `tools/visual/README.md`. Baselines are not in git yet.
- **Database changes** only as new files in
  `server/src/main/resources/db/migrations/` (latest V021). Never edit one
  that exists.

## 4. Only on the Mac (not in git) and what to use instead

| On the Mac | On Windows |
|---|---|
| `client/vite.arrange-check.config.js` (a vite preview config: port 5175, `/api` proxied to 8081) | not needed; use `run-local.sh` or your container setup |
| `client/public/fonts/*.woff2` (licensed; must never be committed) | leave absent; the site falls back |
| `release.env`, any `deploy.env` | Mae's; a Windows session has no use for them |
| Local accounts in the Mac's `testdb` | make your own through sign-up or the admin create-user route; passwords need 12+ characters with mixed case |
| `tools/mac-app/` | `tools/webposting.cmd` / `.ps1` / `node tools/menu.mjs` |
| `tools/visual/baselines/` (provisional, uncommitted) | will be re-taken and committed after the next build |

## 5. Next tasks, in order

Mac session (after its usage limit resets):
1. Gate fix wave (four workers: dialogs, profile, editor, small screens),
   rebuild, recheck the failed flows, release to `main`, Mae deploys.
2. Mac app: rows for webpaint.ing's server setup; never show "AppleEvent
   timed out".
3. Held work: Settings / Customize and auth page design fixes, sign-in
   follow-ups, sessions in the database, then `guide/PLAN-OCTOBER.md`.

Windows session, suggested:
1. `pc/windows-dev`: the container development setup under a new folder
   (`tools/docker/`), documented in a short guide; the `.cmd` line-ending fix
   you already have.
2. Run the Windows launchers and `run-local.sh` under Git Bash; report what
   breaks, fix what is inside `tools/` on your branch.
3. Run both suites in your container and report the numbers against the ones
   in section 1.
4. Only when Mae says go: the Godot WebGPU engine work, planned in
   `guide/webpaint-godot-webgpu-plan.md` (milestone 0 research, then 1
   toolchain). Each download needs her yes.

Mae's target, for scale: 100 users on webpost.ing by 2026-11-03.
