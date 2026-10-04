# Visual gate: profile (gate-profile), 2026-10-03

Site: http://localhost:5175 (build of 0bede03), account `test`, local only. Recorded at 1300x850 (the
runner's desktop size, not 900) and 390x844 touch. Flows: `tools/visual/flows/gate-profile-*.mjs`.
Output folders (not committed): `tools/visual/out/gate-profile/` (owner, folder-arrange),
`out/gate-profile-b/` (themes, first run of the others), `out/gate-profile-c/` (edit, delete, visitor, final).
Clips: `<scratchpad>/visual/gate-profile/<flow>-1300.webm` and `-390.webm` (12 clips).
Everything I created (draft post, delete-me post, bio text) is gone; test's theme (Corkboard), bio
("sdfsdfsfd") and its 4 posts were checked back through the API afterwards.
About 20 images opened (screenshots, three theme contact sheets, one frame sheet, three crops).

## Verdicts

| Flow | Verdict | Evidence |
|---|---|---|
| gate-profile-owner (owner buttons, tabs by mouse and arrow keys, counts, fonts, rings) | PASS, with two findings (F2, F5) | `out/gate-profile/gate-profile-owner/top-desktop.png`, `top-phone.png`, `tabs-keys-*-sheet.png`; clips `gate-profile-owner-1300/390.webm` |
| gate-profile-folder-arrange (folder popover, arrange view) | FAIL on phone (F1); desktop PASS | `out/gate-profile/gate-profile-folder-arrange/folder-menu-desktop.png`, `arrange-keys-desktop.png`, `arrange-phone.png` |
| gate-profile-edit (bio, links, banner editor) | PASS, one finding (F4) | `out/gate-profile-c/gate-profile-edit/banner-discard-dialog-*.png`, `bio-open-*.png` |
| gate-profile-delete (delete a post) | PASS on the brief's checks; dialog findings (F3) | `out/gate-profile-c/gate-profile-delete/confirm-*.png`, frame sheet `out/gate-profile-c/videos/gate-profile-delete-desktop-frames/sheet.png` |
| gate-profile-visitor (view as visitor, signed-out visitor) | PASS | `out/gate-profile-c/gate-profile-visitor/preview-*.png`, `signedout-*.png` |
| gate-profile-themes (Neon, Newspaper; Corkboard is the account's own and is in every other flow) | PASS at contact-sheet size | `out/gate-profile-b/gate-profile-themes/{neon,newspaper}-{top,folder,arrange,bio,banner,visitor}-{desktop,phone}.png` |

## What was checked and seen

- **Owner buttons**: Set profile picture, Edit banner, Edit bio, Edit links, Customize, View as visitor,
  Export data, + Sticker, + New grid post, Arrange posts, and per post Edit, Delete and the folder button
  are all present and inside the window at both sizes. No sideways scroll anywhere. (Export data was not
  clicked: it downloads a file.)
- **Counts agree**: Posts tab 4 = four post cards = "4 public posts" in the header; Drafts tab 1 and the
  draft shows only there. After deleting a post the tab went 5 -> 4 and the list 5 -> 4, and it stayed gone
  after reload. The visitor preview and a signed-out visitor see 4 posts and no draft; counts are the same
  after "Back to editing".
- **Tabs**: mouse selects each tab and leaves no ring (`:focus-visible` false). ArrowRight, ArrowLeft, Home
  and End move selection correctly and wrap (Posts -> Notes -> Drafts -> Subscribers -> Posts); the keyboard
  ring on a tab is the grey 2px ring with a soft halo. Zero tabs with a count of 0 show no number.
- **Fonts**: 12 controls measured per screen (profile, popover, arrange, links editor, banner editor,
  confirm dialog, preview, Neon, Newspaper): all in the top bar's font, on all three themes. One exception: F4.
- **Folder popover**: opaque (rgb 255,253,244), no blur, inside the window at both sizes, topmost layer,
  does not hide behind the header; Escape and click outside close it.
- **Arrange view** (desktop): clean white panel, "i" opens the dark key-hint panel, "New folder" field,
  Pin / Make private / Delete pills, Done returns to the list. No blur anywhere.
- **Banner editor**: opens with the grid tools; with the Paint tool a drag draws, "Not saved yet" appears,
  Cancel asks "Unsaved changes ... Discard the changes?", Discard closes. Nothing was saved.
- **Delete confirm**: title "Delete post", message "Delete this post? This cannot be undone.", buttons
  "Delete" (black) and "Cancel", plus a close X; opaque white card, scrim 45% black, no blur. The row's
  Delete pill is visibly redder than Edit.
- **Visitor**: the preview shows a "Viewing your profile as a visitor / Back to editing" bar, no owner
  controls, a disabled Follow, no tab bar (visitors only have Posts).
- **Themes**: Neon (dark navy, mint tab pill) and Newspaper (cream, serif) both keep the app chrome in the
  app font; arrange panel and popover stay light, opaque and readable on the dark theme. I judged contrast
  from contact sheets, not zoomed crops.
- The pixel header text on a 390px screenshot at 1x pixel ratio looks cut in half (letters missing rows).
  I re-shot at 3x: it is whole and legible, so this is a testing-size artefact, not a bug.

## Findings

- **F1 (FAIL, rule 9 and 13) Arrange view on a phone: post titles vanish.** At 390px each row's title gets
  18px (or 0px for the indented "aaa"), so rows read "G...", "a...", with Pin / Make private / Delete taking
  the whole row. You cannot tell which post is which. Seen in `arrange-phone.png` and the Neon/Newspaper
  phone sheets; measured `.arrange-row-title` width 18 / 0 against scrollWidth 27 / 23.
  Likely `client/src/components/Pages/Posts/PostsViewer/ProfileArrange.css` (row layout; the action pills
  should wrap under the title on narrow screens).
- **F2 (FAIL, focus rule) "All your storage" summary shows the browser's own focus ring** (blue on desktop,
  orange in the phone profile) when reached by Tab, not the grey ring. It is the `<summary>` in
  `StorageSummary.jsx` / `StorageSummary.css`.
- **F3 (dialogs, overlaps gate-dialogs) The confirm dialog has no keyboard support**: Escape does nothing,
  focus is not moved into the dialog when it opens, and after Cancel focus is on the page body, not the
  Delete button. Source: `client/src/components/Dialog/Dialog.jsx` (no key handler, no focus handling).
  Also the folder popover: after Escape, focus is on the body rather than its button
  (`ProfilePostList.jsx`).
- **F4 (minor, font rule) The bio textarea is in the theme font** (Special Elite on Corkboard) because of the
  inline `fontFamily: 'inherit'` at about line 476 of `PostsViewer.jsx`. Every other control matches.
- **F5 (minor, alignment) A stray thin divider "|" sits at the end of the first owner-button row** on desktop
  (right of "Edit links", visible in `top-desktop.png` and all three themes): the divider between the two
  button groups wraps onto the first row. `PostsViewer.jsx` `.profile-owner-divider` /
  `ProfileEditor.css`. On a phone the buttons form a tidy 2-column grid.
- Smaller: deleting a post does `window.location.reload()` (`BasicTextPost.jsx` ~line 40), so the page jumps
  to the top after the confirm. The full-page screenshots show the cork wallpaper ending after the first
  screen (white below); this is probably a fixed-background screenshot artefact, not checked live.

## New baselines created

`tools/visual/baselines/gate-profile-owner/` (top, full, tab-posts, end; desktop and phone: 8 files). All
other captures in my flows are marked dynamic (looked at, not compared). No `--update` was run.

## Three things most worth Mae's attention

1. The arrange view on a phone hides every post title (F1).
2. Tab onto "All your storage" shows a browser-default ring (F2); the confirm dialog ignores Escape and
   loses focus (F3).
3. The bio box is in the theme's font and a stray "|" trails the first owner button row (F4, F5).

Area ready for Mae: no
