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
   **More Sonnet, less lead** (Mae, 2026-10-03: "i want to see more sonnet
   usage next time"). The lead (Opus) should not write code, CSS, scripts or
   documents itself, nor run ad-hoc browser checks: give those to Sonnet
   workers too (`implementer` for small fixes and reverts, `screen-checker`
   for looking at screens, `integrator` for builds and full test runs). The
   lead's own turns are for deciding, briefing, reading reports and
   committing. If a fix is "quick", it is still a Sonnet task.
3. **Be frugal with tokens.** Short briefs with exact file lists; one combined
   build and browser check per batch rather than one per change; contact
   sheets instead of many screenshots; grep before reading whole files.
4. **Deploy breaks.** At the usage level Mae names (lately 85–96% of the
   5-hour limit), push everything to `main`, pull her local checkout, tell her
   it is ready, and summarise what the deploy adds. Resume when she says.
5. **Write things down in `guide/`**, not in private memory: decisions,
   reviews, plans, the backlog.

## How many agents

- **Up to 10 high-level workers at once, each of which may run 3 to 5 helpers of its own** (Mae, 2026-10-03, replacing the earlier flat limits). A high-level worker owns an area (for example "webpost.ing performance" or "webpaint.ing phase 0"), splits it, briefs and checks its helpers, and reports once.
- A Sonnet worker with a large task may split it and start its own helpers
  (say so in its brief, with a number it may use, so the total stays under
  15). It is responsible for them: disjoint files, the same rules as below,
  and it reports their work as its own.
- The lead keeps watch: stop a worker that has gone quiet, is looping, or is
  doing something another already did, and start a replacement with a
  tighter brief. Don't leave idle agents around.

## The agent types (in `.claude/agents/`)

Standing rules live in these definitions, so a brief only has to carry the
task: the files, Mae's words, and the design.

| Type | Model | Use it for |
|---|---|---|
| `implementer` | Sonnet | One scoped feature or fix inside a named file list, with tests. |
| `senior-engineer` | Opus | The hard engineering tasks: core code where a subtle mistake breaks many things (grid drawing and input, the save path, auth, migrations with backfills). Mae asked for an Opus engineer; use it where Sonnet would likely need rework, not for routine features. |
| `integrator` | Sonnet | After a batch: apply the cross-file insertions workers left, fix broken tests, run the full suites. |
| `auditor` | Sonnet | Read-only security, performance, accessibility or code-health audit ending in ranked findings and work packages. |
| `ui-reviewer` | Sonnet | Exploratory testing in a real browser; a bug report with evidence. |
| `screen-checker` | Sonnet | Before a deploy hand-over: look at the changed screens and say Ship, Fix first, or Show Mae first. |
| `visual-tester` | Sonnet | Tests by watching: records user flows as video, captures steps and bursts of frames, pixel-compares against baselines in `tools/visual/`, and looks at the images. Leaves recordings Mae can watch. Run it after each rebuild in a batch. |
| `design-guardian` | Opus | Enforces [DESIGN-RULES.md](DESIGN-RULES.md), Mae's own likes and dislikes collected from the sessions: works mostly in the browser, looking at every changed screen and state; pass/fail per screen with exact fixes. In every batch that changes what a user sees, before hand-over. |
| `design-reviewer` | Fable | Occasionally: a feature's design before building, an architecture choice, a deep review of a risky change. Mae asked for this model on high-intelligence review and design tasks; it costs more, so use it where being wrong is expensive. |

**Name every worker and keep its brief** (Mae, 2026-10-03: "name your
subagents and keep them capable and reproducable"). Before launching, write
the brief to `guide/briefs/YYYY-MM-DD-<type>-<task>.md` (see
[briefs/README.md](briefs/README.md)); that file name is the worker's name
everywhere, and the launch prompt just points at the file. Rerunning a task
means launching the same brief again. When a worker goes wrong because a rule
was missing, fix the agent definition, not just that one brief.

**Use `ui-reviewer` every batch** (she asked not to forget it): one runs in
the background against the local build while implementers work, and
`screen-checker` gives the verdict on the changed screens before hand-over.

Haiku (through `general-purpose` with `model: haiku`) is fine for small
mechanical edits with an exact recipe. A batch usually runs: auditor or
design-reviewer → implementers in parallel → integrator → screen-checker →
the lead commits and hands over.

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
- **Smoke suite**: before a deploy hand-over, against the local copy only,
  run `node tools/smoke/run.mjs` (about a minute; `--only seo,security`,
  `--phone`; see `tools/smoke/README.md`). It prints PASS/FAIL/SKIP per check,
  exits non-zero on a failure and leaves screenshots in `tools/smoke/out/`. A
  check that fails on a real bug stays failing and goes in the report; add a
  check there when a feature ships instead of writing a throwaway script.

## Process lessons (keep these; add to them)

- **One integrator per shared file.** When several features need a line in the
  same file, the workers report the exact insertions and one integration
  worker applies them all and runs the full suite. Parallel edits to one file
  have never been worth it.
- **A stable site for reviewers.** Browser reviewers and the smoke suite test
  the built copy in `client/dist` plus the running jar. Rebuild only at batch
  boundaries and tell running reviewers when you do. To run a server from
  committed code while workers are mid-edit, build from a clean export:
  `git archive HEAD server | tar -x -C <scratch>` and package there.
- **Audits before features.** A read-only audit (security, UI, performance)
  costs little, runs in parallel with anything, and its ranked findings turn
  into well-scoped briefs. Ask each audit to end with independent work
  packages and the files each would touch.
- **Limits tested locally must not block local work.** Rate limits skip
  loopback addresses in dev mode; many agents share one address.
- **Batch the checking.** One build, one script that visits every changed
  screen and prints facts (counts, texts, URLs), one contact-sheet image.
  Read numbers first; look at pixels only where numbers cannot tell.
- **Repeatable checks live in the repo** (`tools/smoke/`), not in scratch
  folders, so the next session does not rewrite them.
- **Say the design, not just the wish.** Briefs that carry the lead's
  analysis (why, the rules, the edge cases, what not to build) come back
  right the first time; briefs that only quote the request come back vague.
- **Nothing a user sees ships unseen.** On 2026-10-03 a new home page and
  the profile tabs were pushed on test results alone and Mae found both ugly
  on the live site; the home page was reverted. Before a deploy hand-over,
  every new or changed screen is looked at in a screenshot by the lead (or an
  Opus reviewer when there are many), at desktop and phone width, and judged
  against the design taste section: would Mae call it clean? A worker's
  "tests pass, not seen in a browser" is not done. Do not replace a screen
  she already likes (home page) without showing her first.
- **Watch usage.** Ten workers can use a tenth of a 5-hour limit in minutes.
  Check `get_usage` after each batch and stop launching well before the
  agreed deploy stop.

## Rules that are not negotiable

- **Commits:** no `Co-Authored-By`, no "Generated with" lines (Mae's global
  rule). Plain messages that say what changed for the user.
- **Production:** never build, test or run extra processes on the server
  (that crashed it once). Never log in to it, never ask for or store
  passwords. Server details live only in her local `release.env` and the
  server's `deploy.env`. The repository is private (since 2026-10-03), and the
  rule stays: private repositories leak, get cloned to laptops, and may be
  opened again, so no secret or server detail is ever committed.
- **Deploying** is Mae's: the Webposting app's Deploy button, or
  `tools/deploy.sh` → `tools/release.sh` (build on her Mac, upload, install
  with backup and rollback). See [DEPLOYMENT.md](DEPLOYMENT.md). nginx is
  never changed by a release; give her snippets.
- **Database:** changes only through numbered migrations in
  `server/src/main/resources/db/migrations/` (latest: V020; V021 is in progress), each safe to run
  twice. See [MIGRATIONS.md](MIGRATIONS.md).
- **Do not commit:** `client/public/fonts/*.woff2` (licensed fonts),
  `release.env`, `guide/HANDOFF-2026-09-30.txt`,
  `client/vite.arrange-check.config.js`.
- **Never push by force or rewrite pushed history** without asking.
- **Downloads** (fonts and the like) need her yes first, with the licence
  checked.

## Design taste (from Mae's feedback)

The full list, in her words, is [DESIGN-RULES.md](DESIGN-RULES.md). Add to it the same day she gives new feedback. The short version:

- Grayscale app chrome; tactile, springy controls; **no glass/blur panels**;
  never rotate or tilt posts.
- Everything in grids speaks one visual language: pixel buttons
  (`GridButton`), pixel text, symbols from the Basics pack.
- No emojis in the UI (reaction emojis are content and stay).
- Plain words in the interface; short hints; long notes behind an "i".
- **No little notes floating above controls.** Mae called the "Description"
  and "Goes in" labels over the editor's fields bad design (2026-10-03). A
  field says what it is with its placeholder; a control reads on its own; a
  label that is needed for screen readers is visually hidden, not shown.
  Don't add helper sentences under controls either unless the choice is
  genuinely surprising.
- Profiles and posts are themed by their owner; anything drawn on a themed
  card takes its colours from the theme variables (`--th-ink`, `--th-link`,
  `--th-danger`, …) so it stays readable. `theme.js` checks text colours
  against the card.
- The editor should look like the published post.
- She notices when something reads as "slop": vague prompts, filler text,
  half-working buttons. Prefer fewer, clearer things.

## Where things stand

- **Wishlist (what's still to do):** [WISHLIST.md](WISHLIST.md). Keep it current: add what Mae asks for and isn't done, tick what lands.
- **Backlog:** [backlog-2026-10-03.md](backlog-2026-10-03.md) — her queue,
  ordered, ticked as it lands. Post-editing features come first; the animator
  last.
- **Security:** [security-review-2026-10-03-open-signups.md](security-review-2026-10-03-open-signups.md)
  and the dated section at the end of [SECURITY.md](SECURITY.md). Sign-ups
  stay invite-only until a bot barrier and verified email exist.
- **Next big project:** [webpaint-plan.md](webpaint-plan.md) (webpaint.ing, a Godot animator on its own domain; future work).
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
