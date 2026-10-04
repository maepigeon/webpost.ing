# Visual test, 2026-10-03 (first run, visual-tester, brief 2026-10-03-visual-tester-core-flows)

Tested the local build that was served on http://localhost:5175 at about 19:10 to
19:50 (client/dist of 17:59, older than the source: the lead rebuilt it
right after). Findings below are about **that old build**; the baselines taken on
it are provisional and must be re-taken on the new build (see "Refreshing").

All seven flows were recorded at 1300x850 and 390x844 (touch) and every one ran
to the end (pass = the steps could be done and the checks held). Failures in
the table below are findings about the app, not about the recorder.

## Where things are

- Tool: `tools/visual/` (README there). Run: `node tools/visual/run.mjs [--flow a,b] [--size desktop|phone] [--out name] [--update]`.
- Output of the last run: `tools/visual/out/latest/` (not committed). Recordings:
  `tools/visual/out/latest/videos/<flow>-<size>.webm` (audio, grid-editor, messages,
  profile, settings, topbar for both sizes). The good recordings of write-publish
  were overwritten by a later run that hit the rebuild (site down); rerun
  `--flow write-publish` for a fresh one.
- Baselines (provisional): `tools/visual/baselines/<flow>/<step>-<size>.png`, 112+ files.
- Pixel diffs: `out/<name>/diffs/`. Failure screenshot: `out/<name>/<flow>/FAILED-<size>.png`, trace in `traces/`.

## Per flow

| Flow | Result | What was seen |
|---|---|---|
| 1 grid-editor | Pass, both sizes | Grid inserted, text typed (canvas changed only in tiles rows 0-1, cols 0-2: the text-cursor frame leaves tile 0,0), rectangle (rows 1-4, cols 2-8), magic fill (only inside the rectangle, rows 2-4, cols 2-8), lasso + link to /test (link only marks tiles, no pixel change except the link tint), Flatten text (look unchanged, as intended), Focus on/off (frames identical, no flicker; pixels unchanged). Canvas checks compare pixel snapshots before and after each tool. |
| 2 write-publish | Pass, both sizes | Title, description, text, Button block, Publish, post view with working link, back to the profile card, Delete (confirm dialog), gone. See findings 1, 2, 3, 8. |
| 3 profile | Pass, both sizes | Own profile (Corkboard) and the same on the Neon Terminal dark theme (set through PUT, original theme restored), top to bottom, four tabs, View as visitor, empty profile test3. See findings 5, 9. |
| 4 topbar | Pass, both sizes | Account menu and More menu open, stay inside the window, close on Escape and on click outside. See finding 4. |
| 5 messages | Pass, both sizes | test2 sends, test3 sees a notification, clicking it opens the conversation with test2, the reaction picker on the first message opens below it inside the thread (not behind the header, not off-screen, x 18..208 on a phone). See finding 6. |
| 6 settings | Pass, both sizes | All 7 sections start collapsed; each opens cleanly; no sideways scroll. See finding 7. |
| 7 audio | Pass, both sizes | test2's "Audio review" plays, the mini player appears, survives navigation to Home, sits fully inside the window (360x54 desktop, 358x54 phone), Close removes it. Nothing wrong seen. |

## Findings (old build; re-check on the new one)

1. **Button block: typing a web address by hand closes the form after "https://e".** `ButtonNode.jsx:223` keeps the form open only while the block is selected or its target is still invalid; the moment the address becomes valid the form collapses and the rest of the typing is lost. Pasting works, typing does not. Seen with real key presses at 45 ms. (On the phone the block also published with the warning "A button's link must start with..." showing and a default label when the typing had gone astray.)
2. **Phone editor: the pinned tool stack covers more than half the screen** (about 500 of 844 px with Edit, Text, Insert and Publish rows). A field you are editing (the Button form, the grid) ends up behind it. The tester had to scroll fields to the bottom edge to reach them. Source: `.toolbar-sticky` / `.toolbar-stack` in the editor styles.
3. **Delete confirm is a blurred translucent dialog** (backdrop blur, see-through panel) with a button reading "Continue" and an X: breaks "no glass or blur panels" and "plain words" (it should say Delete). Screenshot: `write-publish/delete-confirm-*.png`.
4. **Blue focus ring on every mouse-clicked button** (account menu, profile tab, More menu on phone is gold). `client/src/index.css:71-74` (`button:focus, button:focus-visible { outline: 4px auto -webkit-focus-ring-color }`) is the Vite template rule: a colour accent in the grayscale chrome.
5. **Phone: profile "Send message" and "Block DMs" buttons use different styles** (white vs grey) in one row; the Follow button is a third style (`profile/own-empty-test3-phone.png`).
6. **Phone: the notifications page title is squeezed to "N"** by the "Mark all as read" and "Clear all" buttons (`messages/inbox-phone.png`). Also the Reply and React actions in Messages are text glyphs (a return arrow, a plus), shown only on hover.
7. **Settings: explanatory paragraphs sit open under the section headings** (App, Site background, Code blocks, Delete account, Email): DESIGN-RULES "never explanatory paragraphs / behind an i". On a phone, the Code blocks preview is clipped at the card's right edge ("like" cut off) (`settings/open-code-blocks-phone.png`).
8. **The served build still showed the "Description" and "Goes in" labels and "Shown on your profile when published."** above the editor fields, which the source hides (`Editor.css:379`). Probably just the stale build; check on the new one.
9. **After the session ends the top bar still shows the signed-in account menu** on the sign-in screen ("Your session ended") (`write-publish/post-view-desktop.png` of an early run). Also: the grid panel shows a blue status strip ("Flattened 2 characters to pixels...") and helper paragraphs inside the dark panel (colour in app chrome, an info box).
10. Corkboard's typed-ink text is redrawn with random colour variation each load, which is why some buttons are masked in comparisons.

## Refreshing baselines (after a rebuild)

1. `node tools/visual/run.mjs --out <you>` and look at the table, then at the diff images of the screens that should have changed.
2. When the diffs are the intended redesign: `node tools/visual/run.mjs --update --out <you>` (one person only; baselines are shared files).
3. Expect noise of 0.05 to 0.5 percent in a few captures (editor status line wrapping on a phone, animated pickers); the threshold is 0.05 percent of pixels (`--threshold`).

## For five testers in parallel

```
cd <repo>
node tools/visual/run.mjs --flow messages,settings --out alice   # your flows, your own folder
open tools/visual/out/alice/videos/                              # recordings
open tools/visual/out/alice/diffs/                               # pixel diffs against baselines
node tools/visual/frames.mjs tools/visual/out/alice/videos/messages-phone.webm --fps 4 --from 2 --to 6   # frames and sheet.png beside the video
```

- One `--out` name per tester; a full run deletes its own folder first.
- No `--update` while others compare. Do not rebuild or restart the site (the runner refuses anything but localhost).
- New clip: copy `flows/topbar.mjs` to `flows/<name>.mjs`, edit, run `--flow <name> --out <you>`.
- Accounts: test, test2, test3 (the server keeps 5 sessions per account and evicts the oldest, so parallel runs sometimes log each other out; the runner retries once). The `messages` flow adds messages that cannot be deleted.

## Housekeeping

Posts created by the flows ("Visual flow post") are deleted in each flow's cleanup; the grid flow saves nothing to the server. Checked at the end: the `test` account's posts are only the original four and its theme is Corkboard again. Notifications for test3 are cleared by the messages flow. Untouched: `tools/smoke/**`, application source.

## The three things most worth attention

1. The Button block cannot be typed into (finding 1) and the phone editor hides what you are editing behind the pinned tools (finding 2).
2. The delete confirmation (finding 3) and the blue focus ring (finding 4) are the visible breaks of Mae's rules; both are quick fixes.
3. Re-take the baselines on the new build before relying on any diff.
