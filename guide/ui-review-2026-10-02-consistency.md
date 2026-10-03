# UI review 2026-10-02: iconography, affordances and consistency

Reviewed against the running preview (:5175, testdb), logged in as `test`, read-only (hover, open menus and dialogs, unsaved editor grid only). Viewports 1440x900 and 390x844 (isMobile, hasTouch). Screenshots are in `S = /private/tmp/claude-501/-Users-mae-workspace-webposting--claude-worktrees-kind-driscoll-e5fb5f/87be1c04-857d-4336-9a7a-4bd52c5ce943/scratchpad/ui/`.
Line numbers are from the client at review time. Some are approximate where noted.

Severity: broken / confusing / cosmetic.

## Broken

1. **Tape sticker is invisible and overflows its tile** (broken). /stickers "Built in" and the editor's Insert -> Sticker dialog. The tape swatch is near-white on the near-white tile, and in the dialog it spills left of the tile edge (`d-sticker.png`, `d_stickers.png`). Should be visible (a darker tile backing or an outline) and clipped to the tile. Source: `components/TileArt/StickerCenter.jsx` tile render and its CSS.

2. **"Add to mine" buttons overflow the sticker cards** (broken). /stickers, 1440. The pixel `GridButton` (about 126px) is wider than the 117px card, so it pokes out both sides and overlaps the label (`d_stickers.png`). It should fit inside the card, or sit below it. Source: `StickerCenter.jsx:86`.

3. **Touch devices get no hover labels, and long labels clip off screen** (broken). Grid editor on 390: icon-only buttons have no visible name on touch, because `@media (hover: none) { [data-tip]:hover::after {opacity:0} }` hides them. When a tip does show after a tap (focus-visible), it is `white-space: nowrap` and centred on the button, so the wand/char-per-tile tips are cut off on the left edge (`m-grid-edit.png`). On desktop the wand tooltip also runs 490px wide, left of the panel (`d-grid-edit.png`). Fix: shorten tips to a few words and clamp them to the viewport, or show a one-line caption under the panel for the focused tool on touch. Source: `TileGrid/tips.css:5-28`, long strings in `TileGrid.jsx` (about 1330-1400).

4. **Phone profile header text overlaps itself** (broken). /test at 390: "user: test / 0 followers 0 following / joined… / 4 public posts" lines collide (line-height below the glyph height). Also "Set profile picture" floats over the banner art (`m-profile-top.png`). Source: `PostsViewer/ProfileBanner.css` (about line 74) and the pixel text line-height.

5. **Pinned star sticker covers the date** (cosmetic to confusing). /test, the first (pinned) post: the star sits over "September 30, 2026" so it reads "Septem…2026" (`d_test.png`, `m_test.png`). Stickers are user content, but the date line should either wrap clear of the owner's stickers or stickers should sit behind it. Source: `ProfileStickies.jsx`.

## Confusing

6. **Same heart icon means three things** (confusing). `symbol="heart"` is the Insert -> Sticker button (`Editor.jsx:1259`), the grid editor's "Stamp a sticker" button (`TileGrid.jsx:1368`), the profile "Add sticker" button (`ProfileStickies.jsx:166`) and, as the next control on the Page row, "Reactions". A heart reads as "like". Use a distinct sticker/star glyph for stickers. See `d-panel-zoom.png`.

7. **Voting is an "upload" arrow** (confusing). Page -> Voting (`Editor.jsx:1366`, icon `vote`) is an up arrow, the same shape as "Move block up" and the Upload action. It should show an up/down pair or a score glyph. `d-panel-zoom.png`.

8. **Page row: four icons, two dim and two bright, with no grouping** (confusing). Wallpaper and Theme are tools that open things. Reactions, Comments, Voting and Grid on card are on/off toggles shown as filled white tiles when on. Nothing says that, and "off" looks the same as "disabled". Theme is disabled with an invisible reason: only a tooltip says "Save the post first". Add a text label per toggle, or a separator and an on/off check.

9. **Two Undo/Redo, two Sticker, two Text colour controls on the editor screen with a grid open** (confusing). Panel "Edit" (post-level) and the grid panel "Edit" (grid-level) both show undo/redo. Both have a Sticker button, a Text colour swatch, a link button. It is unclear which one acts on what (`d-grid-edit.png`). At minimum label the grid panel "Grid" and grey out the page-level undo while a grid is active.

10. **Icon-only controls with unclear meaning** (confusing). In the post editor's Insert row: "i" (Image upload info, `Editor.jsx:933`) looks like a heading marker next to Image; the document glyph for "Post link"; Σ for Math. In the grid editor: the diagonal-line icon is "Pixel perfect" (a toggle) but sits among the Draw tools and reads as a line tool; the padlock-like glyph is "Custom characters"; the curved arrow is "Avoid overdraw"; the two squares-in-a-box icons for "one wide character per tile" and "two narrow characters". All rely on tooltips (which never show on touch, see 3). Add text for the toggles and a visible caption for each group.

11. **Grid editor "Draw" row wraps one lonely button** (cosmetic to confusing). "Fill with a texture" (checkerboard) drops to its own second row under Draw (`d-gridpanel-zoom.png`). Next to the clear (transparent) swatch with its checkerboard look, it is easy to mistake for the same thing.

12. **Grid editor mixes control styles** (confusing). Font is a pixel button with a ">" caret (`Pixel >`), while the editor's Style row uses native selects for Font, Size and Spacing. Both are in the same dark panel. On 390 the native Font select text collides with its chevron ("Defau…"), `m-grid-edit.png`. Pick one control kind. Source: `GridUI.jsx:57` versus `Editor.jsx` toolbar-select.

13. **The grid editor's own help text is clumsy and over-explains** (cosmetic). "Click a tile and type. Drag, or Shift+arrows, to select tiles; typing then fills them. Cmd+/ lists the shortcuts." in 11px pixel text on 4 lines, next to a keyboard icon that does the same. Suggest "Click a tile and type. Drag to select." and leave shortcuts to the keyboard icon (which says "Keyboard shortcuts (⌘/)"). Source: `TileGrid.jsx:1239`. Other over-long tooltips: wand "Magic wand (⌥W): select the joined tiles that look the same. Shift adds, Alt takes away."; "Avoid overdraw (Insert): off. Typing skips filled slots, and XL letters filled 2×2 spots, instead of drawing over them." (grammar: "filled" should be "fill", and the sentence is hard to parse).

14. **Primary publish button is called "Upload"** (confusing). Editor, both viewports. The action publishes a post (title attr: "Make this post public"). "Upload" suggests files. When already published the sibling reads "Unpublish" and the primary "Upload" still. Rename to "Publish" (and "Save changes" when already live). Source: `Editor.jsx:1548-1552`.

15. **Naming of the same action differs by page** (confusing).
    - Profile cards: "Edit" and "Delete" (Delete first). Post page: "Edit post" and "Share". Profile top: "+ New grid post" versus navbar "New Post" versus editor title "New post".
    - "Notifications" in the nav, route `/inbox`, no mention of "Inbox" in the UI, fine, but page heading "Notifications" centred without a card while "Following" is left aligned without a card.
    - Sticker: "Add sticker" (profile), "Add to mine" (sticker center), "Sticker" (editor), "Stamp a sticker" (grid).
    - Section toggles use "Fold X" when open and "Show X" when closed (`Editor.jsx:1639`). Pair as "Hide/Show" or "Collapse/Expand".

16. **Red "Customize" link on the owner bar** (confusing). /test, row of owner buttons: "Customize" is red text, while the style guide reserves red for danger/errors. It is the only coloured control in that row (`m-profile-top.png`). Same for "+ New grid post" and "Arrange posts", which are red-outlined buttons and look like destructive actions. Source: `PostsViewer.jsx:488` (`profile-appearance-link`), `ProfilePostList.css:15`, `NewGridPost.jsx:33`.

17. **Profile owner controls use four different button looks in one view** (confusing). Pixel-font grey pills (Edit banner / Edit bio / + Links / Customize / Export data / Set profile picture), black pixel `GridButton`s (Add sticker, Arrange stickers), red-outlined chrome buttons (+ New grid post, Arrange posts), and chrome grey pills (Delete / Edit on each card). Within one page the families clash. Recommend: all owner controls in the pill style (grey pixel pills) except the grid tool-panel; reserve black `GridButton` for inside editors. `d_test.png`.

18. **Delete and Edit look identical and are adjacent** (confusing). Profile post cards: "Delete" has the same grey as "Edit", no danger colour or icon, and comes first. A confirm exists (`ProfilePostList.jsx:231`), but the control should still look different, and Edit should come first. Same in grid editor: the layer trash (Delete layer), block trash (Delete block) and Delete selection use the same plain glyph with no confirm hint.

19. **Customize page chips are inverted** (confusing). `wp-chip` selected = light, unselected = dark (`WallpaperEditor.css:43-59`), so on a dark panel the chosen option looks like a disabled/blank one and the unchosen ones look pressed. On /customize, Type and Cards rows: step buttons "80% / 90% / 100%…" have the same problem (`d_customize.png`). Selected should be the brighter/accented one, but with a checkmark or outline as well.

20. **Disabled states are soft but easy to miss** (cosmetic). Settings "Save" and Customize "Save theme"/"Save wallpaper"/"Undo changes" are faded to near grey. Nothing says why they are disabled (no title). On Customize, "Save theme" being disabled until changed is fine, but "Undo changes" almost vanishes (very light text on light card). Add `title="No changes yet"`.

21. **Activity tabs: active tab is nearly indistinguishable** (confusing). /activity/test: "Posts (4)" has a 12% grey background and darker border against identical raised pills (`d_activity_test.png`, `ActivityPage.css:67`). Use a clear pressed/dark style. Also the count disagrees with the profile ("4 public posts" earlier showed 5, and Deletions changed 2 to 3 between runs), so counts and their definitions need a short hint.

22. **Active nav pill is a subtle lift only** (confusing). Desktop navbar: the current page's pill is raised 1px with a slight glow; a user can't tell where they are at a glance (`d_inbox.png`, `d_following.png`). Source: `Navbutton.css:156`. A darker/filled pill or underline would help. "My Profile" is also missing from the hamburger list when you are on it? No: it is listed, but the mobile bar only keeps "Home" and "New Post" (`m-menu.png`), so "Search" and "Messages" need two taps.

23. **Page chrome varies by page** (cosmetic). Settings, Stickers, Search, Activity: flat paper card with double rule. Messages: rounded, shadowed card (`d_messages.png`). Following and Notifications: no card, plain text and the heading is left aligned in one, centred in the other. Pick one page shell.

24. **Messages "+" and "Group" are mismatched** (confusing). `+` is a 28px round icon (title "New DM", aria "New message") beside a text button "Group" (title "New group"): action names differ ("DM" vs "message") and one is icon-only. Make both text ("New message", "New group"). Source: `components/Social/MessagesPage.css:48`; touch size 28px on phone (see 28).

25. **Stickers tab labels look pressed the wrong way round** (confusing). /stickers: "Stickers" is light and "Symbols" is dark, and the page shows Symbols' content? It shows stickers. The selected tab looks like the unselected one (same inverted scheme as 19). Source: `StickerCenter.jsx` tab buttons; same pattern in `SharePackDialog.jsx:92`.

26. **Eye emoji in the post stats line** (cosmetic). Post page: "👁 5 (1 unique)" (`Viewer.jsx:476`). A coloured system emoji in a grayscale UI that also reads "5 (1 unique)" without saying "views". Use a pixel/line icon or the word "views".

27. **"Welcome, test" in the bar is plain text on black and looks like a button area but is not interactive** (cosmetic). Desktop navbar right side; mobile menu says "Welcome, test!" with an exclamation (`Navbar.jsx:126`, `Userdata.jsx:6`). Make it a link to the profile or drop the greeting.

## Phone touch targets (390x844)

28. **Targets below 40px** (confusing): navbar pills 36px tall (`navButton`), hamburger 38x32; all `tg-tile` buttons 26x26 (editor tool panel, grid editor); colour chips 18x18; text-direction d-pad cells 14x14/22x14; layer eye 16x16; Messages `+` 28x28 and "Group" 28px; profile owner pills 22px tall (Edit banner/Edit bio/+ Links, Set profile picture); Activity tabs 31px, post links 20px; Customize `wp-chip` 24px, `theme-step` 26px, colour swatches 36x28; settings-link-btn "Edit/Delete" 15px tall; "Search" link in Following empty state 18px; footer links 16px. A 36-44px touch hit area could be done with padding or a `::before` hit area while keeping the glyph small. Source: `TileGrid.css:198,330`, `GridButton.css`, `WallpaperEditor.css:43`.

29. **Editor sections collapse on phone and hide the main actions** (confusing). At 390 only Edit and Text are open; Style, Insert, Page are folded and show only a tiny triangle (`m-editor-top.png`). Insert (images, grid) is the main thing writers need; show a short row of the most-used items, or open Insert by default.

## Missing or weak focus and labels

30. **Focus ring is only a thin blue native-ish ring on grid buttons** (cosmetic). Tabbing to Underline in the toolbar shows a blue 2px ring that is good on dark; checked others: the pixel pills on the profile and the black `GridButton`s show no clear ring. Needs a check across families (`d-focus.png`).

31. **Several buttons have no name beyond their position** (confusing for screen readers and hover). Navbar hamburger has aria "8 more" and no title; profile "0 followers: show them" hit buttons have no visible affordance (10px tall zones, `profile-banner-hit`, they look like plain text); the post-card overlay anchors have a name but no hover. Non-grid buttons have `title`, grid ones `data-tip`, so the two kinds show different tooltips (instant black label versus delayed native one), e.g. "Save draft" and "Upload" use `title`, while the tools above them use the black label.

32. **Followers/following counts look like static text** (confusing). Profile header "0 followers 0 following" are buttons (`profile-banner-hit`) with no underline or hover cue, so the "show them" action is undiscoverable.

33. **Editor "Author:" line is empty** (cosmetic): "Author:" with nothing after it on /editor (the viewer shows "Author: test").

34. **Post page action row mixes families** (cosmetic): "Edit post" / "Share" are pixel-font pills on the themed card (`d-post.png`), the navbar above is chrome pills, the editor toolbar is dark grid controls. That is by design, but "Edit post" is not repeated anywhere else for "Delete", which exists only on the profile.

35. **Dialog covers the navbar** (cosmetic): Insert -> Sticker dialog sits under/over the nav (`d-sticker.png`), its Cancel is a black pill unlike the other chrome buttons. Fine functionally; just inconsistent with the grid-family "Done" button (white, bottom-right) in the grid editor.

## Possible session issue

36. During my first desktop sweep, /inbox, /following, /settings, /customize rendered the login form after /messages (same login worked for the other pages and on mobile). Re-running the same pages in a fresh session was fine. I could not reproduce it, so I am noting it only in case sessions drop on the dev server.

## Tested and found fine

- Navbar at both sizes: no overflow; hamburger menu opens and closes, full-width rows are 39px.
- Editor: Insert -> Sticker dialog opens and cancels with Escape; Undo/Redo disabled tooltips appear; all tool buttons have aria-labels; Insert -> Grid and "Edit grid" work (unsaved).
- No horizontal overflow on any checked page at 390 or 1440 (`scrollWidth - innerWidth` = 0).
- Settings page layout and disabled Save; Customize layout; Search, Following, Notifications, Messages empty states.

I did not post, save, upload or delete anything; the editor was left unsaved. No server, preview or database was started by me.

## Progress (2026-10-03)

Done: 1, 2, 3 (one shared label, kept on screen, shown on press), 4 (text overlap), 6, 7, 13 (tips shortened), 18 (post cards), 21 (active tab), 22 (active nav pill), 24, 26, 33; 16 in part (Customize no longer takes the accent; the two outlined buttons take the profile's own accent by design).
Left as is: 19 and 25 (white means "on" across every dark grid panel).
Open: 5, 8, 9, 10, 11, 12, 14 (Upload vs Publish: Mae's call), 15, 17, 20, 23, 27, 28, 29, 30, 31, 32, 34, 35.
