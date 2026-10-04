# Visual tester

> **The baselines in `baselines/` are NOT final.** They were taken on the local
> build of 2026-10-03 (about 19:40), before the focus-ring, font, no-blur, editor
> toolbar, profile-button, notifications and mini-player changes that were made
> on purpose. On the new build the first full run will show almost every capture
> as a DIFF. Look at a few diffs (`out/<name>/diffs/`), then re-take them all:
> `node tools/visual/run.mjs --update --out <yourname>`.

Replays user flows in a headless browser, records each as a video, takes
screenshots and bursts of frames after every step, and compares the
screenshots with saved baselines pixel by pixel. Local site only.

    node tools/visual/run.mjs                      # every flow, both sizes
    node tools/visual/run.mjs --flow grid-editor   # one or more flows (comma separated)
    node tools/visual/run.mjs --size phone         # one size (desktop 1300x850, phone 390x844 touch)
    node tools/visual/run.mjs --out alice          # write to tools/visual/out/alice/ (default out/latest/)
    node tools/visual/run.mjs --update             # accept this run's captures as the new baselines
    node tools/visual/run.mjs --threshold 0.1      # percent of changed pixels that counts as a finding (default 0.05)

Needs the site at http://localhost:5175 (override with `--base`; anything that
is not localhost or 127.0.0.1 is refused) and the accounts `test`, `test2`,
`test3` (password = name). It never rebuilds or restarts anything. Pillow and
numpy are used for the comparison (`python3 -c "import PIL, numpy"`).

## What you get (`tools/visual/out/<name>/`, default `latest`; not committed)

- `videos/<flow>-<size>.webm` : the recording of each flow. Open in a browser or QuickTime.
- `<flow>/<step>-<size>.png` : each capture; `<step>-<size>-b1..bN.png` and
  `<step>-<size>-sheet.png` (contact sheet) for bursts of frames.
- `diffs/<flow>__<step>-<size>.png` : the new capture dimmed, changed pixels in
  full colour, changed regions boxed in red.
- `traces/<flow>-<size>.zip` : Playwright trace of a flow that failed
  (`npx playwright show-trace <zip>` from `client/`).
- `FAILED-<size>.png` in the flow folder : the screen at the moment of failure.
- `results.json` : everything above as data. The table printed at the end
  shows per flow and size: pass or FAIL, shots, new, same, minor (below the
  threshold), DIFF.

## Baselines

`tools/visual/baselines/<flow>/<step>-<size>.png`. A capture with no baseline
is saved as the baseline ("new"). A DIFF is a finding until someone has looked
at the diff image and judged it intended; then rerun with `--update`. Rebuilds
of the site change pixels on purpose: look, then update.

Anything that changes by itself (times, dates, unread counts, view counts, the
storage line, the security log) is painted black before the screenshot, in both
baseline and capture. The list is `GLOBAL_MASKS` in `lib.mjs`; a capture can add
more with `mask: [selector]`. The Corkboard theme redraws its typed-ink text with slightly random colours on each load, so the owner buttons on the profile (`New grid post`, `Arrange posts`, `Edit`, `Delete`) are masked too. A capture with `dynamic: true` is only looked at,
never compared. The pointer is parked in the bottom-left corner before each
capture (hover states would differ) unless `keepPointer: true`.

## Flows (`flows/*.mjs`)

grid-editor, write-publish, profile (own theme and a dark theme; restores it),
topbar, messages (test2 to test3; messages cannot be deleted, so only the top of
the thread is compared), settings, audio (needs a post with audio: test2's
"Audio review" in the local data; skipped with a note otherwise).

A flow is `export default { name, sizes?, async run(v) {...} }`. `v` is a `Visit`
(see `lib.mjs`): `v.login(user)`, `v.api(method, url, body)`, `v.click(target)`
(real pointer move, waits for the element to stop moving, scrolls it clear of
pinned bars), `v.type`, `v.drag`, `v.shot(step, opts)`, `v.burst(step, opts)`,
`v.otherUser(user)` (a second signed-in context, no video), `v.onCleanup(fn)`,
`v.note(text)`, `v.step(name)`. Throw to fail a flow.

## Things to know

- The server keeps at most 5 sessions per account and evicts the oldest. If
  someone else logs in as `test` while a flow runs, the flow can find itself on
  the sign-in screen; the runner retries that flow once.
- `profile` replaces the `test` account's theme for a while and puts the old
  one back in a cleanup step; if a run is killed, check `GET /api/users/test/theme`.
- `dark-theme.json` is the Neon Terminal preset as the server stored it
  (save that preset in Customize and read `/api/users/test/theme` to regenerate).

## Several testers at once

- Give every tester its own `--out <name>`. A full run wipes its output folder
  first, so two runs sharing `out/latest` destroy each other's videos.
- Run only the flows you need (`--flow a,b`), and do not use `--update`
  while others are comparing: the baselines are shared files. One person
  re-takes them after a rebuild, the others pull.
- All flows sign in as `test`, `test2` or `test3`. The server keeps 5 sessions
  per account and evicts the oldest, so five parallel runs will log each other
  out now and then (the runner retries a flow once when it lands on the
  sign-in screen). Stagger the starts, or give a flow its own account.
- Messages sent by the `messages` flow cannot be deleted; run it sparingly.

## Record a clip of your own and pull frames

1. Copy `flows/topbar.mjs` to `flows/<yourflow>.mjs`, change `name` and the
   steps (`v.click`, `v.type`, `v.drag`, `v.shot`, `v.burst`).
2. `node tools/visual/run.mjs --flow <yourflow> --out <you>`: the recording is
   `out/<you>/videos/<yourflow>-desktop.webm` (and `-phone.webm`).
3. `node tools/visual/frames.mjs out/<you>/videos/<yourflow>-phone.webm --fps 4 --from 2 --to 6`
   writes `t0002.0s.png`... next to the video plus a `sheet.png` contact sheet.
   Open the images; Playwright's own ffmpeg cannot cut frames, so the script plays
   the file in Chromium and screenshots it.
