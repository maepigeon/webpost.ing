# Batch status (the lead's working notes; update as workers report)

Last updated: 2026-10-03 evening. Mae's standing orders for this batch: keep
going; **stop at 90% of the 5-hour limit for deploy and review**; tell her
when webpost.ing and webpaint.ing are each ready for review and what to do
to connect the webpaint.ing domain; up to 10 area leads, each with 3–5
helpers; more Sonnet; visual checks before anything goes to her.

## Running (name → what)
- `senior-engineer-perf-render` (Opus): grid redraw effect, rAF loops, lazy images, Viewer localStorage write.
- `implementer-smoke-suite`: finish `tools/smoke/`.
- `ui-reviewer-new-features`: browser review + font audit → `guide/ui-review-2026-10-03-new-features.md`.
- `architect-webpaint` (Opus): → `guide/webpaint-architecture.md` (Godot, shared accounts, multi-user, comics, CSP-EX-class scope, offline, installable, Electron vs native, Mac app buttons, test bridge).
- `design-guardian-whole-site` (Opus, browser-heavy): → `guide/design-audit-2026-10-03.md`.
- `visual-tester-core-flows`: `tools/visual/` recorder + baselines → `guide/visual-test-2026-10-03.md`.
- `implementer-accounts-readiness`: password and sign-up flows proven end to end → `guide/accounts-readiness.md`.
- `architect-scalability` (Opus): → `guide/scalability.md`.

- `senior-engineer-payloads-wp1` (Opus) and `implementer-payloads-wp2`: Stage 1 of `guide/design-list-payloads.md`.
  Still to launch from that design: **WP-4** client cards (Stage 0; wait for perf-render, which is editing FollowingPage/DiscoverPage), then **WP-3** feeds/Discover/SEO/hashtags and **WP-5** profile summary + AdminPanel status line (Stage 2, after WP-1), then integrator + screen-checker.
  One decision for Mae from that design: grid-only posts whose first grid is over 300,000 characters show title + description only on cards (no grid); the sweep reports how many, to judge whether a thumbnail is needed later.

## Done and committed this batch
perf-indexes (V019), ui-followups (editor "Goes in" segmented, labels hidden),
perf-ops (JVM cap, Tomcat/Hikari, compression, nginx example), perf-polling
(`/api/me/counters`), release-start-script (start script ships with a release).

## Done, NOT yet committed
- `implementer-perf-fonts`: fonts load on demand (`client/src/utils/fontLoader.js`,
  index.html, PageTheme, ThemeEditor, tileGrid.js, three lines in TileGrid.jsx,
  Editor.jsx, Viewer.jsx). It shares TileGrid.jsx / Editor.jsx / Viewer.jsx
  with perf-render: commit both together when perf-render reports, after
  checking the two sets of edits agree.

## The lead still has to do (or assign)
1. From perf-fonts: add `ensureFontsIn(font.stack)` (+ import from
   `./fontLoader.js`) in `client/src/utils/codeDisplay.js` `applyCodeDisplay`;
   fix the "add a font" recipe in `guide/project-structure.md` (fonts go in
   `GOOGLE_FONTS` in fontLoader.js, not an index.html link).
2. Post buttons: centred/right-aligned buttons cannot share a row with CSS
   alone; needs a small JSX change in `ButtonNode.jsx` (a wrapper per run of
   same-aligned buttons, or a node transform). Brief an implementer once
   Editor.jsx is free.
3. From release-start-script: `guide/DEPLOYMENT.md` "One-time steps" item 5
   and section 3 still say to copy `server-start.sh` by hand.
4. When the audits land (ui-review, design-audit, visual-test): turn their
   work packages into implementer briefs with disjoint files; fix; rerun
   `visual-tester` and `design-guardian` on the rebuilt site.
5. When `design-list-payloads.md` lands: launch its work packages.
6. When `webpaint-architecture.md` lands: relay its questions to Mae; the
   new repository needs her (GitHub CLI is not installed; she creates the
   repo or approves how). Do not ask her about the domain until there is a
   page to serve.
7. Before hand-over: an `integrator` runs the full suites and one build;
   restart the local server from that build; `design-guardian`/`screen-checker`
   verdict on every changed screen; then push `main`, pull her checkout, and
   tell her what the deploy adds. New migrations so far this batch: V019.
8. Keep `guide/WISHLIST.md` and `guide/DESIGN-RULES.md` current.

9. From the smoke suite (committed, `node tools/smoke/run.mjs`): a new post stays on `/editor` after its first Save draft, so a reload shows a blank post and the next save could duplicate it (`Editor.jsx` keeps the new id in state but never changes the URL). Assign once Editor.jsx is free (perf-render and perf-fonts both touched it). Also: at 390px the editor's sticky tools cover half the screen over a grid.
10. `implementer-smoke-bugs` is fixing the banner editor's false "Not saved yet" and the owner profile column width.

11. **Mae wants both (2026-10-03): the Turnstile bot check and sign-in with Google, Apple, Microsoft.** Turnstile is built (off until she puts `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY` in deploy.env). SSO is NOT built: launch a `senior-engineer` on `guide/SSO-PLAN.md` once `implementer-accounts-readiness` has finished with the auth files (new `SsoController` + service, migration **V021** `user_identities`, a session-creation method in the login repository, Login/Registration buttons, Settings "Linked sign-ins" and "Set a password"; Google and Microsoft first, Apple last; every provider off unless its `SSO_*` values are set). She has been told what to register (callback URLs are in SSO-PLAN.md).
12. perf-render and perf-fonts are committed. `implementer-editor-fixes` (new-post URL, button rows, small fixes) and `implementer-payloads-wp4` (cards) are running.

13. `guide/scalability.md` is in (Opus). Its work packages: **S6 backups** running now (`implementer-backups-s6`). Queue next, when their files are free: **S1 sessions in the database** (senior-engineer; after accounts-readiness; also ends sign-out on deploy and is needed for webpaint shared accounts), **S3 rate limits behind an interface** (after accounts-readiness), **S4 migration lock + graceful shutdown + prune release backups** (`DatabaseMigrator`, `install-release.sh`), **S5 job table for mail** (before mail is switched on), **S9 client survives a restart + maintenance page** (after editor-fixes frees App.jsx; design-guardian checks the page), **S2 storage interface** (senior-engineer; large), S7 optional. Take migration numbers after V020 (SSO planned V021: renumber as they land).
14. Ceiling estimate from that doc (unmeasured): the current droplet handles roughly 100 to 150 people active at once after the payload work; resize to 4 GB when CPU or memory triggers fire or when webpaint.ing realtime goes live. Mae-only stage 0 items: turn on DigitalOcean backups and alerts, an off-box backup bucket, an uptime check.

## Answers owed to Mae (give in the next status message)
- Electron wrapping the Godot web build works, but Godot's native desktop
  export is the better downloadable (smaller, faster, better pen input); the
  architecture document compares them.
- Offline and "add to home screen" for webpaint.ing: recorded in
  `guide/webpaint-plan.md`; webpost.ing already has an Install button
  (Settings → App).
