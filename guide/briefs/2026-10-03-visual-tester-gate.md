# visual-tester-gate (Sonnet, `visual-tester`; five run in parallel)

Mae: "dont fogrget to do a lot of visual and interactive combined checks and
record clips and review using computer vision". This is the gate between a
finished wave and a deploy. It runs **after** the integrator has rebuilt and
restarted the local site (http://localhost:5175, API 8081, `testdb`). Nothing
goes to Mae until every area below has a verdict.

Read first: `.claude/agents/visual-tester.md`, `guide/DESIGN-RULES.md`,
`tools/visual/README` (the recorder and baselines the first visual tester
built), and the two reviews this wave fixed:
`guide/design-audit-2026-10-03.md`, `guide/ui-review-2026-10-03-new-features.md`.

## How every tester works
1. **Use, don't just load.** Each flow is driven with real clicks, typing,
   hover, keyboard and drag, at **1300×900 and 390×844**.
2. **Record a clip of every flow** (Playwright `recordVideo`), saved under the
   scratchpad as `visual/<area>/<flow>-<width>.webm`.
3. **Look at it yourself.** Pull frames from each clip (start, each state
   change, end) and take a screenshot at every state; open the images with the
   Read tool and judge them with your own eyes against the design rules. A DOM
   assertion that passes is not a verdict. Zoom into crops for text contrast
   and for anything 12px or smaller.
4. **Three themes** for anything inside a profile or post: Corkboard (light,
   textured), Neon (dark), Newspaper (serif).
5. **Compare** against the pixel baselines in `tools/visual/` where one
   exists; where a change is intended, say so and refresh the baseline.
6. **Own account.** The site allows five sessions per user and signs the
   oldest out. Sign in only as the account given to you below, once, and reuse
   that session. Never touch another tester's account.
7. Clean up what you create (posts, comments, drafts). Never production, never
   edit source, never commit.

## Areas (one tester each)
| Tester | Account | Flows |
|---|---|---|
| `gate-profile` | test | Owner and visitor profile; every owner button; tabs by mouse and arrow keys; folder popover; arrange view; edit bio; banner editor; delete a post (confirm says "Delete"); counts in header and tab agree; view as visitor |
| `gate-editor` | test2 | New text post → Publish → state after first Publish → edit → Save; new grid post with each grid tool; Button block fields readable; "Goes in" selected state visible; autosave Restore / Discard; Math and link fields are in-page, not browser prompts; sticky toolbar height with a grid open |
| `gate-dialogs` | test3 | Every dialog, popover and menu on the site opened and closed: no blur, opaque card, focus returns to the control that opened it; avatar popup, followers list, share menu, report, image picker, crop, sticker packs, account menu, More |
| `gate-small` | vt4 | Notifications (wording, badge clears), Activity tabs, Discover, Search, Messages, discussion page, mini player across navigation, scroll-to-top position, all at 390px first then 1300px |
| `gate-accounts-admin` | vt5 (admin: test) | Sign up, sign in, wrong password, change password, forgot password page, Settings sections; Admin tabs, switches, previews line; sign-in buttons for Google / Microsoft show only when configured |

`vt4` and `vt5` are local accounts the integrator creates for this gate.
`gate-accounts-admin` is the only tester that signs in as `test` for the admin
panel, and does so after `gate-profile` has reported.

## Font and focus checks, every tester, every screen
- Every control (button, pill, tab, input, menu) is in the interface font,
  whatever the page theme. Measure `font-family` on ten controls per screen
  and list any that differ.
- A mouse click leaves no ring; Tab shows the grey ring.

## Report (to `guide/visual-gate-2026-10-03-<area>.md`)
Per flow: PASS / FAIL, the clip path, the frame that shows the failure, the
rule it breaks, file and line if you can find it. End with one line: "Area
ready for Mae: yes / no".

## Added when the gate was launched (2026-10-03, late evening)
- The site under test is the build of commit `0bede03` at
  http://localhost:5175 (API 8081). It runs with placeholder sign-in keys so
  the "Continue with Google / Microsoft" buttons show; they cannot sign anyone
  in, do not click through to the provider.
- Accounts and passwords: `<scratchpad>/run/gate-accounts.txt` (`vt4` and
  `vt5` have long passwords; the name is no longer accepted as a password).
- Recorder: `node tools/visual/run.mjs --flow <a,b> --out <your area name>`
  (your own `--out`, always); frames:
  `node tools/visual/frames.mjs out/<name>/videos/<flow>-<size>.webm --fps 4`
  writes a `sheet.png` beside the video. New flow: copy
  `tools/visual/flows/topbar.mjs`. Write new flow files as
  `flows/gate-<area>-<flow>.mjs` so testers never edit the same file. Do not
  run `--update` (baselines are shared; the lead has them re-taken once).
- **Budget.** Usage is limited tonight. Judge from frame sheets and a few
  full-size crops, not from every frame: at most about 40 images opened in
  total. Keep tool output short (write logs to files, read tails). Aim to
  finish within 25 minutes. A short, exact report beats a long one.
- Known and already being fixed, do not spend time on them: the Button block's
  form closing while its address is typed; the account menu on the "session
  ended" screen; Settings' explanatory paragraphs and clipped code preview
  (next cycle).
