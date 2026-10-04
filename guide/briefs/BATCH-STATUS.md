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

15. `guide/webpaint-architecture.md` is in (Opus). **Phase 0 has started**: `senior-engineer-webpaint-phase0` (Opus area lead with Sonnet helpers) is building in a NEW local repository `/Users/mae/workspace/webpaint` (no GitHub yet; it commits there itself). Its package P0-I edits `tools/mac-app/*` in THIS repository: commit those when it reports. Mae has been given the architecture's 15 questions with defaults; phase 0 uses the defaults. webpost.ing will need a phase 1 package for webpaint (SSO bridge controller, loopback-only `/internal/` routes with a shared secret, a `webpaint` post block). Domain steps for Mae are in section 10.5 of the architecture: do not ask her to do them until a first page is on the droplet.

16. Committed: accounts readiness (`guide/accounts-readiness.md`), editor fixes, WP-4 cards, smoke suite, smoke bug fixes. WP-2 is finished but NOT committed (it needs WP-1's `PostPreview`/V020; commit both together). Small follow-ups to hand to an implementer: `EmailActionPage.jsx` reset form needs placeholders "New password" / "Confirm new password" (labels are now visually hidden); `App.css:114` still names `.cursor-glow`; docs still mention CursorGlow; `react-contenteditable` is unused in package.json; AdminPanel caps an admin-set password at 32 characters.
17. Launched: `senior-engineer-sso` (Opus; V021), `implementer-private-repo`, `implementer-cross-platform-menu`; backups worker told the off-box copy is Mae's computer (`tools/download-backup.sh`). After SSO: S1 sessions in the database (same repository file).
18. Mae's repo for webpaint is `/Users/mae/workspace/webpainting` (remote `github.com/maepigeon/webpaint.ing`, private); phase 0 builds there, no pushing until the lead has looked.

19. `implementer-private-repo` committed EXCEPT `tools/deploy.sh` and `tools/release.sh` (the cross-platform-menu worker is editing them too: commit both workers' changes to those two files together when it reports). `guide/PLAN-OCTOBER.md` is the day-by-day plan; Mae's target is 100 users by Nov 3.

## Answers owed to Mae (give in the next status message)
- Electron wrapping the Godot web build works, but Godot's native desktop
  export is the better downloadable (smaller, faster, better pen input); the
  architecture document compares them.
- Offline and "add to home screen" for webpaint.ing: recorded in
  `guide/webpaint-plan.md`; webpost.ing already has an Install button
  (Settings → App).

20. **Evening wave (2026-10-03).** Committed: reviews (`design-audit`, `ui-review`), tools (menu for Mac/Windows/Linux, backups S6, private-repo deploy), WP-1 + WP-2 (V020). Known red test until `integrator-batch-a` lands: `SharedPackTest…413…` (lead decision: a frozen account saves nothing; the code yields, not the test).
    Running now (briefs in this folder, same names):
    - `integrator-batch-a`: fitsQuota fix, insertions from menu/backups/WP-1, animator test run, stray local post 99.
    - `implementer-design-a-font-focus`: font regression (F1), focus ring (F2), unreadable `.pb-input`, pixel button ink.
    - `implementer-design-b-no-glass`: every `backdrop-filter` out (F3), `.is-on` beaten by the neo button rule, dead `.cursor-glow`.
    - `implementer-design-c-editor`: first Publish leaves editor in draft state (data loss), sticky toolbar, native prompts, labels.
    - `implementer-design-d-profile`: one button look, phone pills, one-tab bar hidden, header jump, counts agree.
    - `implementer-design-h-small-screens-admin`: inbox wording, badge, phone clipping, mini player, admin switches, previews line (WP-5 admin part).
    - `implementer-payloads-wp3`: feeds, Discover, SEO, hashtags on `PostPreview`.
    - still running from before: `senior-engineer-sso` (V021), `senior-engineer-webpaint-phase0`, `visual-tester-core-flows`.
    Held until SSO lands (shared files): design **WP-F** Settings and Customize (F8, F16, F18, password form keeps fields, Theme "Done" discards a preset), **WP-G** auth pages (labels, "Log In" vs "Sign in"), then **S1 sessions in the database**. Held until design-d lands: **WP-5 profile summary** (PostsViewer.jsx).
    Uncommitted and unowned: `client/src/animator/` + `client/src/test/animator*.test.js` (phase 1 flipbook, not routed in App.jsx); integrator runs its tests, then the lead commits it as it is (inert).
    For Mae to decide (asked 2026-10-03 evening): banner on a phone (F4), storage breakdown off the profile into Settings (F13), which owner pills a phone keeps (F7). Subscribers tab stays (her request).
    Hand-over order once the wave reports: commit each by file list → integrator full suites + one build → restart local server from that build → `design-guardian` + `visual-tester` on the rebuilt site → only then push `main` and tell Mae. This deploy adds V019, V020 (and V021 if SSO is in).

21. **Visual gate (Mae, 2026-10-03 evening).** Before any hand-over: after the integrator's rebuild and restart, launch FIVE `visual-tester` workers from `2026-10-03-visual-tester-gate.md` (profile, editor, dialogs, small screens, accounts+admin), each on its own account (integrator creates local `vt4`, `vt5`), each recording clips and looking at the frames. Fix what they fail, rerun the failed areas, then `design-guardian` once over the whole site. Same gate for webpaint.ing phase 0 before its repo is pushed.

22. Committed since 20: integrator-batch-a (frozen account saves nothing; insertions), animator phase 1 (inert), WP-3 feeds, no-glass. Mae (evening): **notifications must always name and link their subject and show what was said**. Split: server `implementer-notifications-subject` (fields `commentExcerpt`, `subjectGone`, `reaction`), client relayed to `implementer-design-h` (owns InboxPage.jsx). Relayed leftovers of blur: `ActivityPage.css` → design-h, `Editor.css` → design-c; `SettingsPage.css` 14–15 goes into held WP-F. For the visual gate: no-glass made the general button rule lighter (`:where`), so buttons on inbox, activity, search, discussion, admin may have changed look; dialog cards are `#fff`.

23. design-a (font, focus) committed. Insertions it left, for `integrator-batch-b` once the wave is in: `Viewer.jsx` ~484 Discussion `<Link>` needs `className="viewer-discussion-link"` and that class added to the app-font rule's list in `themes.css`; `App.css` 134–168 add `:not(.pb)` to the neo rule's skip lists (it repaints solid and outline post buttons); `animator/animator.css` blue `#5ea0ff` ring → grey token; Admin checkbox `accent-color` green → grey (design-h's file, check its report). `TileGrid.css:167,350` blue ring relayed to design-c. Its one judgement call: Button block label now takes the theme font (content), pixel look stays app font.

24. Committed: design-d profile, notifications server half. Launched `implementer-payloads-wp5-profile-summary` (also: counts are published-only; drafts live in Drafts in the normal view, arrange view shows all). For `integrator-batch-b`: no `reply` notification is written anywhere (replying to a comment tells only the post owner): add `social.createNotification(parentAuthorId, "reply", username, postId, commentId)` in `DiscussionController.addComment`, skipping the post owner (already told) and the replier, with a test; optional cleanup `themes.css` 248–257 and `touch.css` 17 (overridden Edit/Delete pill). Notifications have no stored reaction kind (would need a migration): not doing it now.

25. design-h committed (inbox, activity, mini player, scroll-to-top, admin). More for `integrator-batch-b` (exact lines are in the worker's report, repeated here in short): `Social.css` append the four `.discussion-page-header` rules (phone overflow); `SettingsTab.jsx` both catch blocks use `errorMessage(e, 'Could not save that setting.')`; badge refresh: `InboxPage.jsx` `markAll`/`markOne` dispatch `wp:counts-changed`, `useUnreadCounts.js` refreshes on it, and the actor link in a row also marks it read; `PreviewLine.jsx` use `ADMIN_PREVIEW_STATUS`/`ADMIN_PREVIEW_RUN` once WP-5 adds them. For held WP-F (Settings): `SecuritySection.css/.jsx` list scroll (max-height, overflow-y auto, tabIndex, aria-label), `SettingsPage.css` 14–15 blur.

26. **Deploy candidate frozen at `93b59cf`** (everything from the evening wave + SSO, which is off without keys). `integrator-build-serve` is proving and building that commit from a clean copy and restarting the local site with placeholder SSO values so the buttons show. After it reports: launch the five gate testers (`2026-10-03-visual-tester-gate.md`). Only gate fixes go on top of the candidate before the hand-over.
    **Held for the next cycle (after Mae's deploy), briefs written or to write:** `implementer-sso-followups` (brief written; not launched: it touches sign-up and delete-account paths and would ship unseen), design WP-F Settings/Customize, WP-G auth pages, S1 sessions in the database, the other scalability packages, a `design-reviewer` (Fable) security read of the SSO diff **before Mae sets any SSO keys**.
    SSO facts for Mae: off until `SSO_GOOGLE_*` / `SSO_MICROSOFT_*` are in deploy.env; owner checklist at the top of `guide/SSO-PLAN.md`; a Microsoft sign-up arrives with no verified email (must confirm one before posting when that switch is on); Apple not built (needs a cross-site POST exception).

27. Local site is on the build of `0bede03` (suites green: client 580, server 679, menu 17; smoke 33/34, the one failure a stale check, since rewritten). Gate launched: five testers (`visual-gate-profile` test, `-editor` test2, `-dialogs` test3, `-small` vt4, `-accounts-admin` vt5); reports go to `guide/visual-gate-2026-10-03-<area>.md`. Accounts file: `<scratchpad>/run/gate-accounts.txt`. Committed on top of the candidate (NOT in the build under test, needs the second build): button form stays open while typing, top bar on session end. For the next gate-fix worker: `client/src/utils/session.js` `clearLocalSession()` last line `window.dispatchEvent(new Event('wp:session-cleared'));`; run the rewritten smoke check; re-take `tools/visual` baselines once on the final build (`--update`, one worker).
    Mae asked (late evening) for the webpaint.ing GoDaddy steps: given (A `@` → same address as webpost.ing, CNAME `www` → `webpaint.ing`, forwarding off, parking records removed). Server side (port-80 block, certbot) waits for a first page; phase 0 worker still running.

28. **Usage 85% at 23:xx on 2026-10-03; hard stop at 90% (Mae's rule). Limit resets 2026-10-04 04:00 UTC.** No new workers until then. State to resume from:
    - Local site runs the build of `0bede03`. HEAD is ahead of it by gate fixes only: button form, top bar on session end, accounts+admin gate fixes (`14bb734`), smoke check rewrite.
    - Gate reports: accounts-admin IN (6 of 15 failed, all fixed in `14bb734`, unseen). Still running: profile, editor, dialogs, small. When each reports: commit its `guide/visual-gate-2026-10-03-<area>.md` and its `tools/visual/flows/gate-<area>-*.mjs`, write ONE fix brief per area with disjoint files, launch Sonnet implementers.
    - Then: `integrator-build-serve` again on the new HEAD (same brief; add: run the rewritten smoke check; re-take `tools/visual` baselines once with `--update`), then recheck ONLY the failed flows per area (same gate brief, one tester per area that failed), then `design-guardian` once over the whole site if budget allows.
    - Then push `main`, fast-forward Mae's checkout, and tell her it is ready: this deploy adds V019, V020, V021; SSO stays off (no keys); she should not set SSO keys before the Fable security read.
    - `senior-engineer-webpaint-phase0` still running; it has edited `tools/mac-app/Webposting.applescript` and `build.sh` (uncommitted, its P0-I). Review its report, look at the page (visual gate applies), commit mac-app files, do not push the webpaint repo until looked at. Mae has been given the GoDaddy steps and is setting DNS now; server side (port-80 block, certbot) waits for a first page.

29. Gate profile IN: not ready. To fix (one brief, files `ProfileArrange.css`, `Dialog/Dialog.jsx`, `PostsViewer.jsx`, `ProfilePostList.*`, `BasicTextPost.jsx`): F1 arrange view on a phone squeezes post titles to nothing; F3 the confirm dialog ignores Escape, takes no focus on open, and returns focus to body (also the folder popover after Escape): Dialog needs focus-in, Escape, focus-return; F4 bio textarea takes the theme font (inline `fontFamily: 'inherit'` in PostsViewer.jsx); F5 stray "|" divider after "Edit links" on desktop; deleting a post reloads the whole page (`window.location.reload()` in BasicTextPost.jsx): remove the card in place instead. F2 (blue ring on the storage `summary`) is probably already fixed by the `summary:focus-visible` rule in `14bb734`: recheck, do not re-fix. Passed: counts agree, drafts only under Drafts, tabs by mouse and keys, one font, no blur, visitor view, three themes.

30. Gate dialogs IN: not ready. No blur anywhere, cards opaque, one font: PASS. To fix (one brief; files `App.css`, `Social/ReportDialog.jsx/.css`, `Viewer.css`/share menu, `Dialog/Dialog.jsx`, `FollowListModal.jsx`, `index.css` focus rule): (1) Report button on a themed post page is repainted by the neo rule (`App.css:134` beats `ReportDialog.css:156`): unreadable on Neon (contrast ~1.2); (2) Report dialog opens partly above the window on a long themed post: it renders inside `.th-scope` (has a transform): `createPortal` to body in `ReportDialog.jsx:59`, and check every other fixed overlay rendered inside `.th-scope`; (3) share menu on a phone runs off the right edge (x=468 of 390) and widens the page; (4) focus: `Dialog.jsx` confirm and link-warning ignore Escape and return focus to body; followers list does not take focus; send-in-a-message leaves focus on body (same Dialog fix as profile F3: ONE worker owns `Dialog.jsx`); (5) Tab shows no ring on the post page's Report and Share buttons; links and the "Find a person" field show the browser ring (partly fixed by `14bb734`: recheck first). Minor: Activity tab strip on a phone hides "Deletions" with no cue.
31. **webpaint.ing phase 0 is IN** (Opus area lead; 14 commits in `/Users/mae/workspace/webpainting`, not pushed; results in its `guide/phase0-results.md`, screenshots in `guide/phase0-screens/`). Lead looked at `desktop-layers-retina.png` and `phone.png`: grayscale shell, pixel tool icons, strokes and layers visible; on the phone shot the sheet is small and the layers panel is not shown. Measured on desktop Chromium only; iPad/Safari/Firefox/pen unmeasured. Its five adjustments and open items: layer memory is double the plan; half-opacity undo replay is slow; an undo within 2 s of a tab death can be lost; engine pixel font y/g; MP4 muxer library needs Mae's approval. Next: Mae looks locally (Mac app rebuilt with `--webpaint`, or `http://localhost:5184` via its run script), then a first page on the droplet (domain already points there: DNS done 2026-10-03), then iPad measurements. `tools/mac-app/*` from its P0-I committed here (compiled, never run interactively: have a worker run it before Mae rebuilds the app).

32. Mae (late evening): "include any commands ill need to run for webpainting in one of the mac webposting app's tools". Brief written, NOT launched (usage 86%): `2026-10-04-senior-engineer-webpaint-server-setup-tool.md`. Launch it first after the reset, in parallel with the gate fixes (its files: `tools/server/setup-webpaint-site.sh`, `tools/mac-app/*`, `tools/menu.mjs`, `guide/DEPLOYMENT.md`; nobody else touches those).
