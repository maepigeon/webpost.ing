# UI review, 2026-10-03: new features and the font regression

Reviewed with headless Playwright at 1300x900 (desktop) and 390x844 (phone, touch), on the default
theme (Newspaper Life), Corkboard, Neon Terminal (dark), Pawprint Phenomenon (dark), Sticky Pad, Sand
and Oak.

**Deviation from the brief.** The brief pointed me at http://localhost:5175 / :8081 / `testdb`. My
standing ground rules forbid using `testdb`, so I did not touch those. I built the worktree
(`client` + `server`) into my own copy instead: database `webposting_uireview`, API on :8082, preview
on :5176, seeded with `test` (admin), `test2`, `test3`. It is the same code as the :5175 build. I stopped my server and preview and dropped my
database. The owner's :5175 and :8081 are still running, untouched. Evidence is in
`/private/tmp/claude-501/-Users-mae-workspace-webposting--claude-worktrees-kind-driscoll-e5fb5f/87be1c04-857d-4336-9a7a-4bd52c5ce943/scratchpad/ui/shots/`
(called `shots/` below). The scripts are in the parent folder (`audit.mjs` is the font collector).

---------------------------------------------------------------------------------------------------

## 0. FONT AUDIT (owner: "there is a regression with font inconsistency")

### Root cause

Two rules combine:

1. `client/src/components/PageTheme/themes.css:68` sets `.th-scope { font-family: var(--th-font-body) }`.
   `.th-scope` is placed on the **whole page wrapper**: `PostsViewer.jsx:350` (`<div className="window th-scope">`
   around the entire profile, so tabs, owner pills, visitor buttons and the view-as bar are all inside it),
   `Viewer.jsx:334` (whole post page), `Editor.jsx:2249` (whole editor), `DiscussionPage.jsx:97/100/113`.
2. `client/src/index.css:90` has `input, select, textarea, button { font-family: inherit; }`, so every control
   without its own `font:` declaration picks up the theme body font.

Controls that declare `font: ... var(--app-font)` themselves (profile tabs, `.profile-owner-btn` "+ New grid
post"/"Arrange posts", post-card Edit/Delete, the "Goes in" pills, the Restore/Discard bar, the editor
toolbar) are right. Every control that does not is wrong. The only app-wide fix point is a rule such as
`.th-scope :is(button, input, select, textarea, label, summary, [role=tab], .view-as-bar) { font-family: var(--app-font) }`,
placed so that content areas (`.editor-contenteditable`, `.post-card` titles, bio, grids) keep the theme font.
Individual selectors are listed below.

Method: on each page, Corkboard profile theme (`Special Elite` body, `Permanent Marker` headings) and again with
Neon Terminal (`IBM Plex Mono`) and Newspaper (`Old Standard TT`), I read the computed `font-family` of every
visible button, input, textarea, select, tab, label, link, status line and heading.
The app font is `system-ui`. Anything else is listed.

### A. Controls in the wrong font (should be `var(--app-font)`)

| Page | Control (text) | Class | Gets | Fix selector |
|---|---|---|---|---|
| Profile (owner) | "Set profile picture", "+ Banner", "+ Bio", "+ Links", "Customize", "View as visitor", "Export data", "+ Sticker" | `button.edit-bio-btn`, `a.edit-bio-btn.profile-appearance-link` | theme body font (Special Elite / Old Standard TT / Nunito, changes per theme), 12px/500 | `.edit-bio-btn` (`PostWindow.css:44`; also `themes.css:177`). Add `font: 500 13px var(--app-font)` |
| Profile (owner) | "All your storage: 31.0 KB" and the "Storage: ... of 500.0 MB" line | `summary`, `.storage-summary*` | theme body font 12px | `StorageSummary.css` (`.storage-summary, .storage-summary summary`) |
| Profile (owner) | folder icon button on every post card | `button.profile-post-folder-btn` | theme font 11.5px/700 | `ProfilePostList.css` `.profile-post-folder-btn` |
| Profile (any) | "N followers", "N following" (they are buttons), avatar button | `button.profile-banner-hit`, `button.profile-banner-avatar` | theme font 16px | `ProfileBanner.css:14` (the banner line itself is user content; the **buttons** are controls) |
| Profile (visitor) | "Follow" | `button.follow-btn` | theme font 13px/700 | `.follow-btn` (`FollowButton`/`Social.css`) |
| Profile (visitor) | "Send message" | bare `button`, no class (`PostsViewer.jsx:584`) | theme font 16px/500, **no border, no background**, reads as plain text | give it `.edit-bio-btn`-style class; today it is the only unclassed button in the header |
| Profile (visitor) | "Block DMs" | `button.btn-block-dm` | theme font 16px/500 | `.btn-block-dm, .btn-unblock-dm` (`themes.css:479`) |
| Profile (view-as) | "Viewing your profile as a visitor" and "Back to editing" | `div.view-as-bar`, `button.view-as-bar-btn` | theme font 14px/13px | `ProfileEditor.css:317`, `:332` |
| Profile tablist container | `div.profile-tabs` | | theme font 16px (the tab buttons themselves are right, but the container and any text node between them is not) | `ProfileTabs.css` `.profile-tabs` |
| Post page | "Edit post", "Share", "Report" | `button.viewer-edit-btn`, `button.viewer-share-btn`, `button.report-trigger` | theme body font 14px/500 | `Viewer.css:16` and neighbours |
| Post page | "Discussion" link, "+" reaction expander | `a` (discussion link), `button.reaction-btn.reaction-expand` | theme font | `.reaction-btn`, discussion link in `ReactionBar.jsx`/`Viewer.css` |
| Discussion page | "<- Back to post", "Recent", "Top", "Post comment", "Threaded" badge, the comment textarea and its placeholder, "No comments yet", "Reply", "React", the @mention suggestion list | `button.discussion-back-btn`, `.discussion-sort button`, `.discussion-compose button`, `span.discussion-style-badge`, `textarea`, `ul.mention-list` | theme body font 12-16px | `Social.css:369`, `themes.css:402-449`, `MentionTextarea.css:4`. (Comment *text* and author names may stay in the theme font; the controls and the placeholder should not.) |
| Editor | "Set a custom URL" | `button.post-slug-edit` | `ui-monospace` 14px (the only monospace button on the page; it sits beside the sans "Description" and "Goes in") | `Editor.css:327` |
| Editor | placeholder "Type a title..." and "Enter some text..." | `input.title-input`, `.editor-placeholder` | theme font | **fine**, this is the post's own content |
| Editor, Insert > Audio block | Play, Restart, Mute buttons and the two range inputs (inside the *editing* audio block) | `button.tg-tile.gb`, `input.audio-range` | theme font (Special Elite) | `AudioNode.css`; the block's controls (Up/Down/Delete are pixel text, an intended look) |
| Settings | the round "i" info button on every section | `button.settings-info-btn` | `italic 700 13px Georgia, serif` (`SettingsPage.css:381`) | deliberate italic "i" glyph, but it is the only serif in Settings; confirm it is wanted |
| Customize | live previews (headings, "a link") | `h1/h2`, `a` inside `.theme-card` | theme fonts | **fine**, they are previews of the theme |

Pages with **no** font problems at 1300px (checked on Corkboard-themed accounts, so a regression would have shown):
Discover (Posts and People), Search, Messages (empty), Notifications, Following, Admin panel (all tabs incl. Settings),
Settings (apart from the "i" glyph), Customize controls, top bar and account menu, the mini audio player
(`system-ui`, `.mini-player`), the Restore/Discard bar (`.draft-found`: system-ui), the autosave status line,
"Goes in" pills, Description box, profile tabs, "+ New grid post"/"Arrange posts", post-card Edit/Delete, Save draft/Publish.

### B. Side-by-side controls that disagree (same kind of control, different look)

Measured on the default Newspaper theme, own profile (`shots/audit-cork-_test.png`, `shots/nav-desk-acct.png`):

| Control | Font | Size/weight | Height | Radius |
|---|---|---|---|---|
| owner pills ("+ Banner", "Customize", ...) | **Old Standard TT (serif)** | 12px/500 | 25px | 10px |
| profile tabs (Posts/Notes/...) | system-ui | 13px/600 | 37px | 7px |
| "+ New grid post", "Arrange posts" (`.profile-owner-btn`) | system-ui | 13px/600 | 32px | 6px |
| post card "Edit"/"Delete" | system-ui | 12px/600 | 28px | 999px |
| folder button | **Old Standard TT** | 11.5px/700 | 23px | 20px |

Five button shapes in one screenful, two of them serif. `Edit`/`Delete` pills are a third roundness. Fix: one `.pill`
treatment (or at minimum one font, one weight) for owner pills, folder button and card buttons.

Visitor header (`shots/vis-test2.png`): three adjacent buttons with three treatments: "Follow" (small, dark filled
pill, serif), "Send message" (large, borderless, looks like text), "Block DMs" (large grey pill). Should be one family.

Post page on a dark theme (`shots/audit-neon-_test_1.png`): "Report" is a pale grey plate with pale green text
(contrast about 1.5:1, unreadable), while "Share" next to it is dark-tinted and legible. Same on the discussion
page: "Reply" and "React" are pale plates with pale text (`shots/mention-landed.png`).

Editor (`shots/ed-restore-bar.png`, `shots/ed-published.png`): "Set a custom URL" is monospace 14px; "Description" and
"Goes in" labels are 11-12px system-ui 600; the toolbar labels (Edit, Text, Style, Insert, Page, Up/Down/Delete) are
SVG **pixel text** (`svg.pixel-text`, an intended look, but not the app font); Save draft / Publish are system-ui 14-16px.
Three type voices in the editor chrome.

---------------------------------------------------------------------------------------------------

## BROKEN

### 1. Button block: what you type in its fields cannot be seen

- Where: editor, Insert > Button, the block's "Label" and "Web address" fields (also the Link-tool address field in the
  grid tools, same cause). Any theme (checked Corkboard, Oak).
- Steps (1300px): `/editor` > Insert > Button > click "What the button says" > type "Visit web".
- Happens: typed text is dark brown (`rgb(42,33,24)`) on the block's near-black panel (bg `rgba(42,33,24,.08)` over
  `#1c1c1c`); placeholder is `rgba(42,33,24,.5)`. Effectively invisible. `shots/btn-typing.png`, `shots/grid-link.png`.
- Should: light text on the dark panel (the block's own CSS asks for `#f2f2f2` on `#1c1c1c`, `ButtonNode.css:65`).
- Source: `themes.css:304-316`, the themed text-input rule `:is(textarea, input...):not(.title-input):not(.toolbar-sticky *)`
  also matches `.pb-input` and the tile-grid link input, overriding their colours with the post's ink. Exclude
  `.pb-input` / `.tilegrid *` (as `.toolbar-sticky *` already is).

### 2. First Publish of a new post leaves the editor saying it is still a draft

- Steps: `/editor`, type a title and body, click Publish.
- Happens: status line says "Draft saved 07:14 PM" next to the toast "Uploaded - your post is live."; buttons still read
  "Save draft" / "Publish" (a published post should show "Unpublish" / "Save changes"); URL stays `/editor`;
  "View post" wraps to a second row. Clicking "Save draft" now would **unpublish** the post with the message "Draft saved."
  Reload fixes it. `shots/ed-published.png`.
- Should: after create, the editor is in the published state (same as after a normal save).
- Source: `Editor.jsx` create branch (`CREATE_POST(...).then`, about lines 1652-1670) never calls
  `onPublishedChange(published)`; the update branch at line 1644 does.

### 3. Selected state is invisible on pills inside the editor card (Goes in, Button block "What it does / Look / Place")

- Steps: `/editor` > look at "Goes in" Post / Note / Subscribers; click Note. Insert > Button, look at the pills.
- Happens: all pills have identical background and colour (`rgba(255,255,255,.65)` plate, `#444` text) whether on or off,
  on every theme. You cannot tell which "Goes in" choice is active, nor which button action/look/place is chosen. On dark
  post themes the pills are light-grey plates with grey text. `shots/pills-dark.png`, `shots/btn-typing.png`.
- Should: `.is-on` shows the filled dark pill the CSS defines.
- Source: `App.css:134-153`, the "auto-apply neo to content-area buttons" rule for `.editor-post-card button:not(...)` is
  more specific than `.post-section-pill.is-on` (`Editor.css:1432`) and `.pb-pill.is-on` (`ButtonNode.css:71`). It also
  sets `backdrop-filter: blur(10px)` (glass), against the style guide. Exclude those classes from the rule.

### 4. Admin tabs: selected tab is white-on-pale-grey (unreadable)

- Steps (1300px, as test): `/routes/AdminPanel`; click any tab, e.g. Settings or Users.
- Happens: the active tab has white text on a light grey plate. `shots/admin-users-tab.png`, `shots/admin-settings.png`.
- Should: dark filled tab with white text (like the profile tabs).
- Source: `AdminPanel.css:53` `.admin-tab--active`; likely overridden by the same neo rule (`App.css:139`).

### 5. Pixel-style audio/web buttons are illegible on light cards

- Steps: publish a post with a Button block, Look = Pixel, Action = Play audio (Corkboard, 1300px); view signed out.
- Happens: label "Play it" is white-ish on a near-white card; pausing/playing only adds a blue ring. `shots/play-desk-post.png`,
  `shots/play-desk-mini.png`.
- Should: label readable on any card.
- Source: `ButtonNode.css:50-59` `.pb--pixel` fixed light label (`#f2f2f2`) on a background that follows the card.

### 6. Dark post themes: Report, Reply, React are unreadable

Neon Terminal post (`/test/1`): "Report" = pale plate with pale green text. Discussion: "Reply", "React" the same.
Source: the neo rule `App.css:134` (`.basicTextPost button`, `.discussion-page button`) paints `rgba(255,255,255,.65)` plates while
themed text colour stays light; `themes.css:176-210` fixes only some buttons (card Edit/Delete, share, back). Add
`.report-trigger`, `.comment-actions button`, `.reaction-btn` to the themed-tint list.

---------------------------------------------------------------------------------------------------

## CONFUSING

### 7. Page > Theme: "Done" throws away a chosen theme

- Steps: editor > Page > Theme; click Neon Terminal; click Done (top right).
- Happens: overlay closes, the editor still wears the old theme, nothing was saved, no warning. Saving needs "Save theme"
  at the bottom of the overlay, below the preview and wallpaper section (below the fold at 900px). Once I pressed "Save theme"
  then Done the editor and the signed-out post wore Neon correctly (`shots/ed-post-theme-applied.png`).
- Should: choosing a preset applies it, or "Done" asks/saves, or the Save button sits next to Done.
- Source: `ThemeEditor.jsx` `persist` runs only from the Save button; `Editor.jsx:1952` overlay Done just closes.

### 8. Focus drops to `<body>` after closing things

After Restore/Discard (`Editor.jsx:1891-1892`), after Page > Theme Done, after the mini player's Close, and after
"View as visitor". Keyboard users land at the top of the page. Return focus to the control that opened it (or the next control).
Phone has the same behaviour.

### 9. Discard/Restore bar buttons look like plain text

`.draft-found button` (`Editor.css:456`): "Restore" and "Discard" have almost no plate or border; they read as words in
a sentence (`shots/ed-restore-bar.png`). Make them real buttons. The bar does behave correctly: it shows after typing then reloading,
**not** on an untouched saved post (checked `/editor/2`), and Discard stops it coming back after another reload.

### 10. Counts disagree on the profile

Owner (Neon): header says "6 public posts"; Posts tab says 4 and includes the draft (also listed under Drafts).
Visitor: header "5 public posts" but only 2 posts + 2 notes visible, because the count includes the owner-only Subscribers post.
Source: `ProfileBanner` publicPosts (server `/profile-banner`) counts all published sections; `profileTabs.js visibleTabs` counts `profile` incl. drafts.

### 11. Phone: sticky editor toolbar takes half the screen

`/editor/11` at 390x844: `.toolbar-sticky` is 419px tall (50% of the viewport) while scrolling the post, leaving about 330px to write in
(`shots/sticky-phone.png`). At 1300x900 it is 265px. Collapse more sections by default or un-stick below a height.

### 12. Phone: Discussion header overflows sideways

390px, `/test/1/discussion` (any post with the header badge): the "Threaded" badge is clipped past the panel edge and the page scrolls
sideways (scrollWidth 445 vs 390). `shots/ph-disc.png`. `Social.css:360` `.discussion-page-header` needs `flex-wrap`. The Admin panel overflows
by 10px on phone too (scrollWidth 400): tabs/table.

### 13. Admin > Settings

- The sign-up switches (`require_verified_email`, `invite_required`) are free-text boxes you must type "true"/"false" into
  (`shots/admin-settings.png`). A bad value shows only "Failed to save setting." although the server says
  "Value must be true or false." (400). A toggle or select would avoid this.
- Works: saves, shows "Setting saved." briefly, persists after reload, and `/api/signup/config` reflects the change
  (set back to the original values).

### 14. Security > Recent activity list

The list is a 260px scroll box (`.security-list`, 25 rows) with no visible scrollbar; the fifth row is cut mid-row and the
"See something you didn't do?" note sits right under it, so it looks like a rendering bug (`shots/set-desk-Security.png`).
It is probably not keyboard-scrollable either (no `tabindex`). Add a visible fade/scrollbar, `tabindex="0"` and an accessible name.

### 15. Password form clears all three fields after a wrong current password

Message is right ("Your current password is not right."), the session stays signed in; but all three fields are emptied and the button
disables again, so the user retypes everything.

### 16. Choosing "Open one of my posts" lists drafts

The target dropdown includes "Test draft one", an unpublished draft; the button would 404 for visitors. List published posts only
(or mark drafts).

### 17. Unnamed button in the Insert row

One Insert-row button has neither text nor accessible name (between "Image upload limits" and "Audio" in the toolbar button list). Everything else
in the tool band has a name. Find the `GridButton` without `label` in the Insert group in `Editor.jsx`.

### 18. Notification badge not cleared after opening a mention

As test3, open Notifications and click "test2 mentioned you in a comment" (it lands on `/test/test-first-post/discussion#comment-1`, comment present and linked,
`#comment-1` exists). The top bar still shows "Notifications 1" on arrival. The target comment is not visibly highlighted (only one comment,
so scroll could not be judged).

---------------------------------------------------------------------------------------------------

## COSMETIC

- Focus ring after tapping "People" on Discover (390px) is a gold/orange rectangle, off the grayscale rule (`shots/disc-phone-people.png`).
- Grid tools status chip ("Flattened 2 characters to pixels. Z undoes it.") is navy blue (grayscale chrome) and says "Z", not "Cmd+Z".
- `App.css:134-153` keeps `backdrop-filter: blur(10px)` on content buttons (glass, against `guide/style-guide.md`).
- Email field in Settings has a lone "i" button above it and no visible label.
- Phone profile header: pixel banner lines render close together/clipped (`shots/tabs-phone-owner-notes.png`).
- Voting arrows beside a comment on phone are 42x26 and the score sits between two stacked buttons (`shots/mention-landed.png`).
- Touch targets under 32px on phone: `.vote-btn` 42x26, `.audio-volume` 72x26, `.viewer-edit-btn`/`.viewer-share-btn` 28px, `.profile-post-folder-btn` 35x23,
  `.pe-section-head` 26px, Customize swatches 36x28, `.inbox-mark-read-btn`/`.inbox-delete-btn` 43x28, followers/following links 10px tall.
- Desktop account menu: after Enter the focus stays on the toggle until ArrowDown (works, just not obvious).
- `alert()` for an audio upload failure (`Editor.jsx` AudioToolbarPlugin) instead of the in-page status line.

---------------------------------------------------------------------------------------------------

## TESTED AND FINE

- **Profile tabs** (desk and phone): Posts/Notes/Drafts/Subscribers for owner, Posts/Notes for visitor and signed out; counts; empty panels
  with their messages and "+ New note"/"+ New post"/"+ New grid post"; `?tab=` survives reload; `?tab=drafts|subscribers` as visitor falls back to Posts;
  Left/Right/Home/End move and select; roving tabindex; no sideways scroll; tab height 37px desk / 41px phone.
- **Editor**: title, Description (saves to the profile card, shows in the Notes list), "Goes in" (saved: a Note landed under Notes), Publish; autosave status
  line ("Saved on this device ..."); Restore bar appears after edit+reload, Restore returns title and body, Discard clears it, and it does **not** appear
  on an untouched saved post. The editor wears the post's own theme (title, body, card, wallpaper) once saved.
- **Post page**: a post's own theme and wallpaper (Neon Terminal set in Page > Theme, Save theme) show signed out and as another user.
  Button block on a published post: web page (opens `_blank`, `noopener noreferrer`), own post (SPA navigation), audio (plays the mini player).
  Audio block uploads an MP3, plays, seek/volume work. Mini player: keeps playing across SPA navigation, shows title/time, Pause, Close, `system-ui`,
  40px targets on phone.
- **Grid tools**: Link tool (opens the address field), Magic fill, Lasso, Flatten text (undoable), Focus view and leaving it with Esc, typed size
  (click the number, type 24, Enter: width becomes 24), Symbols panel opens and Esc closes it. No console errors or dialogs. (Painting results
  were smoke-tested, not pixel-checked.)
- **Discover**: Posts and People tabs, Follow buttons, no sideways scroll at 390.
- **@mentions**: typing `@te` lists test/test2/test3, ArrowDown+Enter inserts, the posted comment links `@test3`, the mentioned user gets a
  notification that opens the discussion with `#comment-N`.
- **Settings**: Security (device count, Sign out everywhere else present, recent activity), Password wrong-current message only (nothing else changed,
  session kept), App, Delete account (not submitted), Email notes (confirmed address, four toggles).
- **Top bar**: account menu opens with Enter, ArrowDown moves into it, Escape closes and returns focus to the toggle; More menu on phone has the
  unread dot and "More, with unread items" label, closes on outside click; Tab order is sensible; targets 28px desk / 40px phone.
- **Admin** (test): build box ("Live build ... Up to date. Check again"), Settings tab loads and saves, `invite_required` change is reflected by
  `/api/signup/config` and was set back. As test2: "Access denied - admin only."
- **Customize / presets**: all eight presets apply and show on the profile (Newspaper, Sticky Pad, Notebook, Corkboard, Neon Terminal, Pawprint,
  Sand, Oak); Sticky Pad and Neon Terminal looked intact; the Links colour control exists. Dark themes: profile, tabs, owner pills, folder
  button, Edit/Delete and discussion header read well (the exceptions are listed above).
- No console errors, failed requests or page errors on any page I visited (apart from the issues above, which are visual).
- Phone (390px): no sideways scroll on profile, post, editor, settings, customize, inbox, messages, discover (exceptions: items 12 and the 10px
  Admin overflow).

## Cleanup

My API (:8082) and preview (:5176) are stopped; database `webposting_uireview` dropped. I did not touch `testdb`, :8080, :5174, :5175 or :8081.
