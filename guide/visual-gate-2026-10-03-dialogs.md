# Visual gate, dialogs, popovers and menus (gate-dialogs, account test3)

Site: http://localhost:5175 (local only). Run on 2026-10-03, late evening. One test3 session reused for all runs.
Evidence root: `tools/visual/out/gate-dialogs/` (videos in `videos/`, unmasked screenshots per flow folder; the runner's masks paint black bars over dialogs, so the captures were taken raw, not compared with baselines).
Flows: `tools/visual/flows/gate-dialogs-themes.mjs`, `gate-dialogs-own.mjs`, `gate-dialogs-buttons.mjs` (+ `gate-dialogs-helpers.mjs`). Each round opens a dialog with a real click, measures blur, card opacity, scrim, fonts, position, closes it, and checks where focus went.

## Verdict on what changed
- No blur anywhere in any dialog, popover or menu I opened (computed `backdrop-filter` and `filter` scanned over the whole page each time: none). `/settings` also has none.
- Every card is opaque (white or the cream card, alpha 1). Dialogs dim with a plain `rgba(0,0,0,0.45)` scrim (share-in-message uses 0.35). Menus are opaque white. Fonts of all controls inside dialogs are the app font (system-ui).
- Light and dark: Corkboard post page, a dark (Neon) profile and Neon post page all read well behind the scrim. (Note: `test`'s profile was dark during my run because another tester was switching its theme; I judged it as the dark case.)
- General button rule: inbox, activity, search, messages, discussion buttons look consistent and styled. ONE regression on post pages (Report), see FAIL below.

## Per flow (desktop 1300 / phone 390)
| Flow | Result | Evidence |
|---|---|---|
| Account menu (plain page, and over Neon page) | PASS: opaque, inside window, Escape closes, focus returns | `gate-dialogs-themes/menu-account-open-*.png`, `neon-account-open-*.png` |
| More menu (phone) | PASS | `menu-more-open-phone.png` |
| Avatar popup, Corkboard-site profile and Neon profile | PASS: opaque card, plain scrim, Escape and X close, focus returns | `cork-avatar-open-*`, `neon-avatar-open-*` |
| Followers list | PASS (but see focus trap finding) | `cork-followers-open-*`, `neon-followers-open-*`, `gate-dialogs-own/ring-dialog-*` |
| Share menu | PASS desktop; FAIL phone: menu is 170px wide at x=298, runs to x=468 on a 390 screen, the page widens to 469 (sideways scroll while open); "Send in a message" is cut off | `neon-sharemenu-open-phone.png`, `cork-sharemenu-open-phone.png` |
| Send in a message | PASS look (opaque, no blur); FAIL focus: after Escape focus is on body, not on Share | `cork-sendmsg-open-*` |
| Report dialog, Neon post | PASS | `neon-report-open-*` |
| Report dialog, Corkboard post | FAIL: card opens partly above the window (desktop y=-444, phone y=-180); the title and reasons are cut off | `cork-report-open-desktop.png`, `cork-report-open-phone.png` |
| Link warning ("Leaving webpost.ing") | FAIL focus and Escape: Escape does not close it, X closes it, focus ends on body | `cork-linkwarn-open-*` |
| Delete-sticker confirm (Delete / Cancel) | PASS look; FAIL focus and Escape, same cause as link warning | `gate-dialogs-own/confirm-delete-open-*` |
| Share a pack (Messages) | PASS (opaque, Escape closes, focus returns to Pack) | `pack-open-*` |
| Image picker (editor) | PASS (Escape, focus returns to Image) | `picker-open-*` |
| Crop dialog | PASS (opaque, no blur, Cancel closes, focus returns to Image) | `crop-open-*` |
| Buttons: inbox, activity, search, messages, discussion | PASS: styled, same family as neighbours | `gate-dialogs-buttons/btn-*-*.png` |
| Buttons: Report on a themed post page | FAIL (see 1) | `btn-post-neon-desktop.png` |
| Focus rings: mouse click leaves none | PASS (Share after a click: not focus-visible, no ring) | note `[ring] after mouse click` in `results.json` |
| Focus rings: Tab shows a grey ring | FAIL on post-page Report and Share, on text links, on the share-in-message field (see 3) | `gate-dialogs-own/ring-tab-desktop.png` |

## Findings, most important first
1. **Report button regression on post pages** (rule 7, readable on any theme). `Report` now gets the general light fill (`rgb(244,244,244)`) while the theme gives it pale text: on Neon the text is mint at 68% on near white, contrast about 1.2, unreadable (`btn-post-neon-desktop.png`, bottom-left). Cause: the general rule `.basicTextPost button:where(...)` (client/src/App.css:134) has higher specificity than `.report-trigger { background: none }` (client/src/components/Social/ReportDialog.css:156). On Corkboard it is a pale grey pill unlike its neighbour Share. Fix: add `.report-trigger` to the `:not(...)` list, or write `.basicTextPost .report-trigger`. (My probe also flagged Share and "Back to post" on Neon at 1.2, but that is a false reading of their translucent fill; they look fine.)
2. **Report dialog is not centred in the window on themed post pages.** `ReportDialog` is rendered inline, inside `.th-scope`, which has a `transform`, so its `position: fixed` overlay is positioned against the post card and not the window (client/src/components/Social/ReportDialog.jsx:59). On a long Corkboard post it opens off the top of the screen. Share-in-message is portalled and is fine. Fix: `createPortal` to `document.body`.
3. **Focus problems.** (a) `Dialog.jsx` (confirm, alert, link warning): no Escape, no focus handling, focus ends on body after closing (client/src/components/Dialog/Dialog.jsx). (b) Send-in-a-message closes with focus on body, not on Share. (c) Followers list is aria-modal but focus stays on the opener: the first Tab goes to a control behind the dialog. (d) Tab on post-page `Report` and `Share` shows no ring at all (computed outline none and box-shadow none), text links (Author) show the browser's blue ring, and the "Find a person" field uses the browser's default ring (blue on desktop, amber on phone), not the grey one.
4. **Share menu runs off the screen on a phone** (see table); it needs to open leftwards or be clamped to the window.
5. Minor, outside my area: on a 390 screen the Activity tab strip scrolls inside its own box and "Deletions" is hidden with no cue. Dialog titles are inconsistent (Send in a message and Pack-style dialogs use a pixel title, others plain), possibly intended.

## Not covered
- Admin pages (test3 is not admin; gate-accounts-admin owns them). Inbox had no items, so its row buttons were not seen; the discussion page was "not enabled" for the test post, so comment buttons were not seen.
- Nothing was sent, reported, followed or deleted. The one sticker I created (`gate-dialogs sticker`) was removed (verified, test3 has no stickers). The editor was opened but nothing typed or saved.
- New baselines: none taken on purpose; the runner saved captures from `gate-dialogs-own` and `gate-dialogs-buttons` (those using `v.shot`) into `tools/visual/baselines/gate-dialogs-*` only if they used `v.shot`; all my captures are raw, so there are none.

Area ready for Mae: no
