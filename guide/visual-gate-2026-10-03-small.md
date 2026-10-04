# Visual gate, area `gate-small` (account vt4), 2026-10-03

Site: http://localhost:5175 (local only). Flows: `tools/visual/flows/gate-small-{nav,player,notif}.mjs` (+ `gate-small-lib.mjs`).
Evidence root: `tools/visual/out/gate-small/` (nav, player) and `tools/visual/out/gate-small-n/` (notifications). Clips: `out/gate-small/videos/gate-small-{nav,player}-{phone,desktop}.webm`. Run at 390 first, then 1300. No `--update`, no source edited, nothing committed.

## Verdicts

| Flow | 390 | 1300 | Evidence |
|---|---|---|---|
| Notifications | PARTIAL (see below) | PARTIAL | `out/gate-small-n/gate-small-notif/notif-list-{phone,desktop}.png`, `notif-opened-phone.png` |
| Activity tabs | FAIL (tab pill drawn badly) | FAIL | `out/gate-small/gate-small-nav/activity-tab0-phone.png`, `videos/gate-small-nav-phone-frames/sheet.png` |
| Discover (tab width steady) | PASS | PASS | `discover-posts/people-*.png`; tab x/width identical on Posts, People, Posts: 112/78 and 192/86 at 390; 567/78 and 647/86 at 1300 |
| Search | PASS (1 minor) | PASS | `search-typing/results-*.png` |
| Messages | PASS, empty state only | PASS, empty state only | `messages-list-*.png`, `messages-new-*.png` |
| Discussion page header | PASS | PASS | `discussion-*.png`; no sideways scroll at 390 |
| Mini player across navigation | PASS | PASS | `gate-small-player/player-*.png`, clips |
| Scroll-to-top position | PASS | PASS | `gate-small-player/scroll-*.png` |
| Font check (every screen) | PASS | PASS | all probed controls `system-ui` |
| Focus rings | FAIL (one place) | FAIL | see finding 2 |

## Notifications: what I could and could not produce

I published `Gate notif target` (post 208, discussion on) as `vt4` and watched `/inbox` for 15 minutes (20:16 to 20:32). **No comment, reply or mention notification arrived** (post had no comments at the end). So these are **not seen**: the subject title as a link inside a comment row, the whole-row click landing on the comment, the quiet second line with the comment text and its two-line clamp.

What I did get: four `new_post` items from `test2` (I followed `test2` for this), all of whose posts `test2` deleted within minutes, so each showed the gone state. Judged on those:
- Wording: "test2 published a post that is no longer available". No bare "your post". The actor is a link to `/test2`. PASS.
- Nothing is cut off at 390: label and row `scrollWidth <= clientWidth`, row 24 to 366 inside 390, no sideways scroll. PASS.
- Clicking a gone row marks it read and goes nowhere (nothing exists to open). Expected.
- Badge: at 1300 it read `Notifications 3`, and `2` after opening one row. At 390 the badge is a dot on More and stays while any item is unread. PASS.
- Font of the page `system-ui`. PASS.
- Minor: at 1300, unread and read rows differ only by text darkness (same grey card), subtle. At 390 an unread card is white, clearer. "Clear all" is red text, the only colour in the chrome (design rule 1). Likely `client/src/components/Social/InboxPage.css`.

The unit-tested pieces (`inboxModel.js`: subject title, `notifHref`, `notifExcerpt`) exist, so the page code looks right, but I did not see it rendered with a comment. This is the lead item and is not verified visually.

## Findings

1. **Activity tabs: the active tab pill is wrong (FAIL).** The dark active pill is 40px tall at 390 (36px at 1300) while its 16px label sits at the very top (label offset 0), leaving a block of empty dark space under the word. Visible in every tab and in the clip. Source: `client/src/components/Pages/Posts/PostsViewer/ProfileTabs.css` (shared `.profile-tab`) with `ActivityPage.css`; the tab has a count slot that apparently takes a second line. Also at 390 the strip scrolls sideways inside its box: "Uploads" touches the right border and "Deletions" is out of view until scrolled (then "Comments" is clipped to "omments" mid-scroll). Keyboard: ArrowRight moves selection (Posts to Comments) correctly.
2. **Tab focus on the Activity post link is the browser's blue ring** (`outline: auto 1px rgb(0,95,204)`, class `activity-post-link`), not the grey ring. Discover tabs get the correct grey ring on Tab and none on mouse click. Source: `ActivityPage.css`.
3. **Search page, "RECENTLY ONLINE" label** is light grey text straight on the wallpaper, hard to read (rule 7). Minor. `SearchPage.css`.
4. Discussion header at 390: back button, title, subtitle, then the "Threaded" pill alone on a second row, right-aligned. No overflow; slightly loose but acceptable.

## Passes worth stating
- Mini player: dark (`rgb(17,17,17)`), pixel controls, no blur, stays after in-app clicks Post to Home to Discover to Search at both sizes; fully inside the window (390: x 16 to 374).
- Scroll-to-top: appears after scrolling, sits 13px above the mini player, never overlaps "+ New grid post" (checked at bottom, mid and with the button in view, both sizes), and does not appear in the editor after scrolling 1500px (phone 1836px).
- Mouse click leaves no ring on Discover tabs; Tab shows the grey ring there.
- Font families on activity, discover, search, messages, discussion, inbox, mini player: all `system-ui`.

## Not produced
- Comment, reply, mention notifications (see above).
- A Messages conversation: `vt4` has none, and messages cannot be deleted, so I sent none. Only the list, empty state and the "New" dialog were looked at.
- Three-theme check: the pages in this area are app pages, not themed profiles, so not applied.

## Clean-up
Deleted `Gate notif target` and the seven filler posts (the flow removes its own), unfollowed `test2`, cleared `vt4` notifications. `vt4` has no posts left. New baselines created: none (all captures `dynamic`, not compared).

## Three things most worth attention
1. Notifications with a comment in them were never rendered here; rerun `node tools/visual/run.mjs --flow gate-small-notif --out gate-small-n` once a tester has commented on a `vt4` post (set `vt4` as the post owner).
2. Activity tab pill: label stuck to the top of a double-height dark pill.
3. Activity post link shows the browser's blue focus ring.

Area ready for Mae: no
