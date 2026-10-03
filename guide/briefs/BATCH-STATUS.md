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
- `design-reviewer-list-payloads` (Fable): design → `guide/design-list-payloads.md` (brief for the next batch: card previews, save-path queries, search, profile summary; migration V020).
- `architect-webpaint` (Opus): → `guide/webpaint-architecture.md` (Godot, shared accounts, multi-user, comics, CSP-EX-class scope, offline, installable, Electron vs native, Mac app buttons, test bridge).
- `design-guardian-whole-site` (Opus, browser-heavy): → `guide/design-audit-2026-10-03.md`.
- `visual-tester-core-flows`: `tools/visual/` recorder + baselines → `guide/visual-test-2026-10-03.md`.
- `implementer-accounts-readiness`: password and sign-up flows proven end to end → `guide/accounts-readiness.md`.
- `architect-scalability` (Opus): → `guide/scalability.md`.

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

## Answers owed to Mae (give in the next status message)
- Electron wrapping the Godot web build works, but Godot's native desktop
  export is the better downloadable (smaller, faster, better pen input); the
  architecture document compares them.
- Offline and "add to home screen" for webpaint.ing: recorded in
  `guide/webpaint-plan.md`; webpost.ing already has an Install button
  (Settings → App).
