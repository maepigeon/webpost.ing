# Working on webpost.ing — a guide for the next AI session

Read this first. It says how work is done here, so a new session can pick up
without Mae having to explain it again. Last updated 2026-10-03.

## Who and what

- **Mae** owns the project and is the only human on it. She writes short,
  fast messages, often several while you work; treat each as a request and
  keep a list (see Backlog). She deploys herself.
- **The site**: webpost.ing. Spring Boot 3.4 + JdbcTemplate + PostgreSQL
  (`server/`), React 18 + Vite + Lexical (`client/`), nginx in front, on one
  2 GB server. Code map: [project-structure.md](project-structure.md). Grid
  format: [GRID-FORMAT.md](GRID-FORMAT.md). Look: [style-guide.md](style-guide.md).

## How Mae wants the work done

1. **Keep going.** Work through the backlog without stopping to ask, unless a
   decision is truly hers (money, accounts, anything on the live server,
   rewriting git history). Report briefly and continue.
2. **The lead session plans, delegates and checks.** Do only high-level work
   yourself: split tasks, write briefs, review, test, look at the result in a
   browser, commit. Give implementation to cheaper subagents (Sonnet mostly,
   Haiku for small mechanical edits). Launch as many as have separate files
   to work on.
3. **Be frugal with tokens.** Short briefs with exact file lists; one combined
   build and browser check per batch rather than one per change; contact
   sheets instead of many screenshots; grep before reading whole files.
4. **Deploy breaks.** At the usage level Mae names (lately 85–96% of the
   5-hour limit), push everything to `main`, pull her local checkout, tell her
   it is ready, and summarise what the deploy adds. Resume when she says.
5. **Write things down in `guide/`**, not in private memory: decisions,
   reviews, plans, the backlog.

## Briefing a subagent (what has worked)

- Name the **only files it may edit**, and say other agents are editing other
  files at the same time. Two agents never share a file.
- Always include: do **not** commit, do **not** run `vite build` (it
  overwrites the shared `client/dist` that the preview serves), do **not**
  start servers, no new dependencies or migrations unless asked.
- Tell it how to verify: `cd client && npx vitest run`; for the server only
  its own test classes while others are mid-edit
  (`./mvnw -q test -Dtest='A,B'`).
- Quote Mae's own words for the feature, then the design you chose.
- Ask for a final report: files changed, test numbers, what needs a browser.
- Afterwards **you**: run the full suites, build, browser-check, commit by
  file list (`git add <files>`), never `git add -A` while agents are running.
- Read-only audits (UI review, security) are good parallel work; they write
  one report file in `guide/`.

## Checking work

- Server tests: `cd server && ./mvnw -q test` (uses the local
  `webposting_test` database). Count errors as well as failures:
  `cat target/surefire-reports/*.xml | grep -h "<testsuite " | sed -E 's/.*tests="([0-9]+)".*errors="([0-9]+)".*failures="([0-9]+)".*/\1 \2 \3/'`
- Client: `cd client && npx vitest run`, then `./node_modules/.bin/vite build`.
- Local run for browser checks: build the jar (`./mvnw -q -DskipTests package`),
  start it with `APP_PROFILE=dev DB_NAME=testdb SERVER_PORT=8081
  ALLOWED_ORIGINS=http://localhost:5175`, and serve `client/dist` with
  `vite preview` proxying `/api` and `/uploads` to 8081 (a small config file,
  `client/vite.arrange-check.config.js`, is kept untracked for this). Test
  accounts on the local database only: `test`/`test`, `test2`/`test2`,
  `test3`/`test3`. Drive it with Playwright (headless) from a scratch folder.
- Mae's own way to run it: `tools/run-local.sh` (ports 5174 and 8090) or the
  Webposting app in `~/Applications`.
- Always look at UI changes on screen, at desktop and phone width, and on a
  dark theme as well as a light one. Tests alone have missed real bugs here.

## Rules that are not negotiable

- **Commits:** no `Co-Authored-By`, no "Generated with" lines (Mae's global
  rule). Plain messages that say what changed for the user.
- **Production:** never build, test or run extra processes on the server
  (that crashed it once). Never log in to it, never ask for or store
  passwords. Server details live only in her local `release.env` and the
  server's `deploy.env`; the repository is public.
- **Deploying** is Mae's: the Webposting app's Deploy button, or
  `tools/deploy.sh` → `tools/release.sh` (build on her Mac, upload, install
  with backup and rollback). See [DEPLOYMENT.md](DEPLOYMENT.md). nginx is
  never changed by a release; give her snippets.
- **Database:** changes only through numbered migrations in
  `server/src/main/resources/db/migrations/` (latest: V016), each safe to run
  twice. See [MIGRATIONS.md](MIGRATIONS.md).
- **Do not commit:** `client/public/fonts/*.woff2` (licensed fonts),
  `release.env`, `guide/HANDOFF-2026-09-30.txt`,
  `client/vite.arrange-check.config.js`.
- **Never push by force or rewrite pushed history** without asking.
- **Downloads** (fonts and the like) need her yes first, with the licence
  checked.

## Design taste (from Mae's feedback)

- Grayscale app chrome; tactile, springy controls; **no glass/blur panels**;
  never rotate or tilt posts.
- Everything in grids speaks one visual language: pixel buttons
  (`GridButton`), pixel text, symbols from the Basics pack.
- No emojis in the UI (reaction emojis are content and stay).
- Plain words in the interface; short hints; long notes behind an "i".
- Profiles and posts are themed by their owner; anything drawn on a themed
  card takes its colours from the theme variables (`--th-ink`, `--th-link`,
  `--th-danger`, …) so it stays readable. `theme.js` checks text colours
  against the card.
- The editor should look like the published post.
- She notices when something reads as "slop": vague prompts, filler text,
  half-working buttons. Prefer fewer, clearer things.

## Where things stand

- **Backlog:** [backlog-2026-10-03.md](backlog-2026-10-03.md) — her queue,
  ordered, ticked as it lands. Post-editing features come first; the animator
  last.
- **Security:** [security-review-2026-10-03-open-signups.md](security-review-2026-10-03-open-signups.md)
  and the dated section at the end of [SECURITY.md](SECURITY.md). Sign-ups
  stay invite-only until a bot barrier and verified email exist.
- **Plans awaiting her answers:** [animator-design.md](animator-design.md),
  [SSO-PLAN.md](SSO-PLAN.md). Mail: [EMAIL.md](EMAIL.md) (needs her mail
  provider and DNS; `tools/server/enable-mail.sh` does the rest).
- **For her to do on the server when she chooses:** the nginx snippets in
  [SEO.md](SEO.md) and DEPLOYMENT.md (crawler pages, security headers,
  `sw.js` caching).

## When you finish a stretch of work

Tick the backlog, add anything new she asked for, update this file if the way
of working changed, commit, push to `main`, and pull her checkout at
`/Users/mae/workspace/webposting` (fast-forward only).
