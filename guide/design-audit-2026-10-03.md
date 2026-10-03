# Design audit, whole site — 2026-10-03 (design-guardian)

Standard: [DESIGN-RULES.md](DESIGN-RULES.md). "Rule 3" means Always 3; "Never 4" means Never 4.

## How it was checked

- Local site `http://localhost:5175` (the build from earlier today; not rebuilt, not restarted). Accounts `test` (Corkboard), `test2` (Neon Terminal, dark), `test3` (default; a bright pink custom theme was set through the API for six shots and restored to `null`, confirmed).
- Every screen opened at 1300×900 and 390×844 in headless Chromium (full-page shots plus computed font, size, weight, blur, native controls, overflow, target size for every control), then about 70 states clicked through (tabs, menus, dialogs, every Settings section, editor popovers, a grid open in the editor, arrange view, view-as, mini player, error messages). The built-in browser pane was used for the real-click checks (focus ring, phone banner, phone editor, scroll-to-top overlap).
- Code read from `HEAD` (c377c04) only, because many client files are mid-edit.
- Evidence images are under `S = /private/tmp/claude-501/-Users-mae-workspace-webposting--claude-worktrees-kind-driscoll-e5fb5f/87be1c04-857d-4336-9a7a-4bd52c5ce943/scratchpad` (`S/out` sweep, `S/states` clicked states, `S/crops` close-ups; scripts `S/sweep.mjs`, `S/states.mjs`, `S/themes.mjs` rerun the lot).

Things the lead should know:
- **The build is older than HEAD.** The editor still shows the "Description" and "Goes in" labels, the "Shown on your profile when published." line, and Goes-in pills with no visible "on" state. Noted once here; not repeated below. At HEAD `Editor.jsx:1490,1523,1531` still render all three, so check they are really gone after the rebuild.
- **A stray draft was left on `test`: post id 99** (an empty grid post). My state script clicked "+ New grid post", which creates a post at once. I did not delete it (I do not delete data); please remove it. Nothing else was changed: no post was saved, test3's theme is back to default.
- Sessions for `test` were invalidated several times during the run by another worker ("signed out everywhere"); the affected screens were re-run.
- No horizontal page scroll on any screen at 390px (one inner overflow, see F17).

## Verdict per screen

| Screen | Verdict | Failures |
|---|---|---|
| Home | Pass (one judgement, J1) | |
| Profile, own | **Fail** | F1 F2 F4 F6 F7 F9 F10 F12 F13 |
| Profile, as visitor / view-as | **Fail** | F1 F2 F6 F9 |
| Profile, empty (test3) and tab panels | **Fail** | F1 F8 F9 F10 |
| Post page | **Fail** | F1 F3 |
| Discussion | **Fail** | F1 |
| Post editor (new, existing, grid open) | **Fail** | F1 F2 F3 F5 F11 F14 F15 |
| Customize | **Fail** | F8 F16 |
| Settings (every section open) | **Fail** | F1 F2 F8 F16 F18 |
| Messages | **Fail** | F2 F3 |
| Notifications | **Fail** | F3 F17 F19 |
| Discover / Following | Pass on rules; judgement J4 | |
| Search | **Fail** | F3 |
| Stickers | **Fail** | F8 |
| Activity | **Fail** | F3 F20 |
| Admin | **Fail** | F2 F3 F16 F17 |
| Login, sign-up, forgot password | **Fail** | F8 F18 |
| Dialogs (confirm, link, followers, avatar, share) | **Fail** | F3 F21 |
| Mini player | **Fail** | F22 |

Passes worth stating: no emojis in interface text (only reaction emojis, which are content); no rotated posts; Settings sections all start collapsed; the editor's Font/Size/Spacing dropdowns and colour picker are the grid kind; icon tiles have hover labels; the wallpaper is a fixed backdrop and does not run out (the white area in full-page shots is a screenshot artefact).

---

## Failures, worst first

### F1. Theme fonts on app controls (rule 3, Never 11) — the font regression
Root cause, `client/src/components/PageTheme/themes.css:66`: `.th-scope { font-family: var(--th-font-body) }` puts the whole profile/post/editor scope in the theme font, and `index.css:90` makes every button `font-family: inherit`. Only components that remember to opt back (`.profile-tab`, post-card Edit/Delete, the grid panels) are in the app font; everything else inherits the theme's. Measured (Corkboard = Special Elite, Neon = IBM Plex Mono, default = Old Standard TT):

| Control | Where | Computed | Should be |
|---|---|---|---|
| Top bar buttons | everywhere | system-ui 13/600 | reference |
| Profile tabs | profile | system-ui 13/600 | ok |
| "+ New grid post", "+ New note", "Arrange posts" | profile | system-ui 13/600 | ok |
| Post card Edit / Delete | profile | system-ui 12/600 | ok |
| **Owner pills** (Set profile picture, Edit banner, Edit bio, Edit links, Customize, View as visitor, Export data, + Sticker) | profile header | **theme font 12/500** | app |
| **Storage line, "All your storage", breakdown** | profile header | **theme 12/400** | app |
| **Follow / Mutuals** | profile | **theme 13/700** | app |
| **Send message, Block DMs** | profile | **theme 16/500** (next to a 13/700 button) | app, same size as Follow |
| **Edit bio: Save, Cancel** | profile | **theme 16/500** | app pills |
| Edit links: + Add link, Save, Cancel | profile | theme 12/500 | app |
| **View-as bar** text and "Back to editing" | profile | **theme 14/400, 13/400** | app |
| **Arrange view**: "+ New folder", "i", "Done", Pin, Make private, Delete (its title is already app font) | profile | **theme** | app |
| **Folder button, folder chip, folder popover** ("MOVE TO FOLDER", list, input) | profile cards | **theme 11.5/700, 10/700, 13/500, 12/400** | app |
| **Edit post, Share, share menu items, view count** | post page | **theme 14/500, 13/400** | app |
| **← Back to post**, "Discussion is not enabled…" | discussion | **theme 14/500, 14/400** | app |
| **"Set a custom URL"** and the `/user/slug` text and input | editor | **ui-monospace 14/500, 12** (a third font) | app |
| Save draft / Unpublish vs Publish / Save changes | editor | system-ui **16/500 vs 16/600** (neighbours differ in weight, and 16px where every other app button is 12–13px) | 13/600 both |
| Autosave status | editor | system-ui 12/400 | ok |
| **Settings "i"** | settings | **Georgia 13/700** | app |
| Discover tabs | discover | 14/700 active, 14/500 idle (the tabs change width when clicked) | one weight |

Shots: `S/out/profile-test-own-d.png`, `S/crops/s4.png` (view-as, arrange), `S/crops/s5.png` (folder popover), `S/crops/post1-bottom.png`, `S/crops/editor-1-top.png`, `S/crops/n1.png` (same on Neon).

Exact fix (one rule, then delete the local workarounds):
```css
/* themes.css, after line 68. App controls inside a themed page are in the app's font;
   only the page's own content (title, body, bio, link labels, post Button blocks, banner) keeps the theme's. */
.th-scope :is(button, select, summary, label, [role="tab"], [role="menu"], [role="menuitem"], [role="dialog"],
              .view-as-bar, .share-menu, .profile-post-folder-menu, .arrange, .storage-summary,
              .discussion-disabled, .post-slug-row, .post-slug-row *)
  :not(.pb, .pb *, .profile-banner-hit, .profile-bio-link) { font-family: var(--app-font); }
```
then: `ProfileEditor.css:329,333` (`font-family: inherit` / `font: inherit` on `.view-as-bar`, `.view-as-bar-btn`) → `var(--app-font)`; `SettingsPage.css:373` `.settings-info-btn` → `font: 700 13px var(--app-font); font-style: normal`; `Editor.css` `.post-slug-edit`, `.post-slug-row` → app font, 13px; `Editor.css:237–244` `.toolbar-btn-draft`/`.toolbar-btn-save` → `font: 600 13px var(--app-font)` both. Give `.follow-btn`, Send message and `.btn-block-dm` one size (13/600). The view count on the post page (`Viewer.jsx:490–492`, an unclassed span) needs a class to be included; `.storage-summary` and `.post-slug-row` exist as named.
Sizes in app chrome currently run 12, 12.5, 13, 13.6, 14, 14.08, 14.4, 14.72, 15, 15.2, 16px in weights 400–700. Recommend two button sizes only: 13/600 (top bar) and 12/600 (small pills).

### F2. A coloured ring on every button after a click (rule 1)
`client/src/index.css:72–75` is still the Vite starter rule `button:focus, button:focus-visible { outline: 4px auto -webkit-focus-ring-color; }`. After any mouse click or tap the button keeps a thick ring in the system accent colour: orange on this Mac in the built-in browser (`outline: rgb(229,151,0) auto 4px`, `:focus-visible` false), blue in Chromium. Seen on profile tabs, owner pills, account button, admin tabs, Discover tabs, conversation rows, tool tiles (`S/crops/s1.png`, `S/crops/s4.png`, `S/crops/a2.png` where the active "Settings" admin tab is unreadable under it).
Fix: delete `button:focus` from that selector and replace the rule with `button:focus-visible { outline: none; box-shadow: var(--focus-ring); }` (the grey ring already in tokens). Also grey the keyboard rings that are blue: `#5ea0ff` in `touch.css:34`, `GridUI.css:39,59`, `TileGrid.css:167,350`, `AudioNode.css:42`, `ButtonNode.css:13,37,63,69`, `ProfileStickies.css:14`, and `#1a73e8` in `touch.css:36` → white on dark panels, `var(--focus-ring)` elsewhere. Admin's checked checkbox is green (`accent-color`): make it grey.

### F3. Glass and blur are still everywhere (Never 1)
`git grep backdrop-filter HEAD -- client/src` finds it in 21 files. On screen:
- **Every dialog**: the page behind is blurred and the card is frosted (`Dialog.css:5–6, 23–24`). Delete-post confirm, Insert link, unsaved banner (`S/crops/s5.png`, `S/crops/e2.png`).
- **Avatar popup**: frosted card, `blur(28px) saturate(180%)` (`AvatarPopup.css:5–6, 24–25`).
- Followers list (`FollowListModal.css:5–6,16–17`), report dialog, image picker, crop dialog, pack dialogs.
- **Share menu** and its items (`Viewer.css:44,62`, plus the shared plate at `PostWindow.css:31–32,49–50` and `App.css:140–141`).
- Editor "Set a custom URL" and Goes-in pills (`Editor.css`, 10 lines), Search button (`SearchPage.css`), Notifications buttons and unread rows (`Social.css`), Messages sidebar and bubbles (`MessagesPage.css`, 14 lines), Activity tabs (`ActivityPage.css`), Admin buttons, Settings, Login, Logout, error screen, `Title.css`.
Fix: remove every `backdrop-filter` and `-webkit-backdrop-filter` declaration, and where the fill was translucent make it solid (`rgba(255,255,255,0.65)` → `#f4f4f4`; dialog scrim → `rgba(0,0,0,0.45)` with no blur; dialog card → `#fff`). `styles/tokens.css:116` and `guide/style-guide.md` (title "Neoskeuomorphic Glass", the "Glass surfaces are a translucent flat fill plus backdrop-filter" recipe, the button recipe with `backdrop-filter: blur(10px)`) still tell workers to do this; correct the guide or it will come back.

### F4. The profile banner text is unreadable on a phone (rules 12, 13, 7)
At 373–390px the banner canvas (2048×256 backing) is shown 286×36px with `image-rendering: pixelated`, so the four pixel-text rows ("user: test", followers, joined, posts) lose strokes and are about 9px tall each; the followers/following hit areas are 109×10px. Checked in the built-in browser and in `S/out/profile-test-own-m.png`.
Fix needs a decision, so **show Mae**: either lay the standard header rows out for a narrower grid on phones (so one grid pixel is at least one screen pixel), or draw those four rows as real text under 520px. Stop-gap in `ProfileBanner.css`: never scale the banner below 1 grid px = 1 CSS px; let it be wider than the card and crop the empty right side.

### F5. With a grid open, the editor's own toolbar covers the grid tools (rule 9, 13)
The post toolbar is `position: sticky` (`Editor.css:46–47`) and is about 340px tall on desktop with all sections open; on a phone the top bar plus toolbar take about 465 of 844px. Opening "Edit grid" scrolls the grid's tool panel underneath it (`S/crops/grid-open.png`, `S/crops/grid-open-m.png`); in a short window the toolbar fills the whole screen.
Fix: while a grid is being edited (or under 700px height), make only the Save row sticky; un-stick or auto-fold the five tool sections (`.toolbar-sticky` → `position: static` under a new state class, e.g. `.editor--grid-editing`, set while a grid's tools are open), and fold "Style", "Insert" and "Page" by default on phones.

### F6. Default-looking and mismatched buttons side by side (Never 10, rule 9)
All of these fall through to the Vite starter `button` style in `index.css:60–70` (grey-white box, 8px corners, 16px text):
- Edit bio **Save / Cancel**: big white boxes, while Edit links' Save/Cancel beside them are small pills (`S/crops/s2.png`, `S/crops/n2.png`).
- Visitor's header: **Mutuals** (dark pill 13px), **Send message** (white box 16px), **Block DMs** (dark box 16px): three styles in one row (`S/out/profile-test2-as-test-d.png`). In view-as, the disabled "Send message" is pale grey on white, unreadable on Neon (rule 7).
- Settings: "Save" and "Change password" (raised grey), "Sign out everywhere else" (flat white box), "Install app" (dark raised) (`S/crops/set1.png`, `set2.png`).
- Banner editor's "Save banner / Cancel / Remove my rows" are spread across the full width instead of sitting together.
- Arrange view: "i" is a bordered square with a serif italic letter; "Done" a black pill; "+ New folder" plain text.
- Messages "Pack" (white outline) next to "Send" (grey fill).
Fix: reset the starter rule (`index.css` `button { background: none; border: 0; padding: 0; font: inherit; }`) and give each of the above the existing pill class used by post-card Edit (`font: 600 12px var(--app-font)`, radius 999px); primary action = filled grey, secondary = quiet pill, destructive = red outline.

### F7. Phone: owner pills wrap into three ragged rows (rule 9, 13)
At 390px "View as visitor" and "Export data" break onto two lines inside their pills and the pills are different heights (22–28px, under the 40px target) (`S/out/profile-test-own-m.png`, confirmed in the pane). Fix in `ProfileEditor.css`: `white-space: nowrap; min-height: 36px` on `.edit-bio-btn`, and under 520px put the eight pills in a 2-column grid with equal widths (or move View as visitor / Export data into the account menu; her call).

### F8. Explanatory paragraphs and visible labels over fields (Never 4, Never 5, rule 11)
- **Customize**: a paragraph under the title and under every heading (Card background image, Wallpaper, Page theme: five lines, Pixel fonts, Stickers) (`S/crops/cust-all.png`). `CustomizePage.jsx`, `.settings-section-hint`.
- **Settings**: "Turn off to stop all emails at once.", one line under each of four toggles, "Changing it signs you out everywhere, including here.", "Put webpost.ing on your home screen…", "The background you see around the site…", "Make a wallpaper on Customize…", "How code looks in posts you read…". Visible labels over fields: Current password, New password, New password again, Your password, Type your username…, Font, Size.
- **Sticker center**: three sentences. **Editor** sticker sheet: two (`Editor.jsx:1279` and the "None yet…" line). **Editor** theme sheet: "This post keeps its own theme: changing your profile theme won't change it…".
- **Profile**: storage note "Everything you keep here counts toward your allowance…" (`StorageSummary`), Notes/Drafts empty panels explain what the tab is, Subscribers panel "Only you can see these for now. Subscriptions are coming later." (`PostsViewer.jsx:617,631`).
- **Grid tools**: "Click a tile and type. Drag to select." and "Drag to reorder. Top is in front." — the same kind of line she removed before ("Drag the grip…").
- **Login / Sign up / Forgot password**: uppercase labels USERNAME, PASSWORD, INVITE CODE, EMAIL, CONFIRM PASSWORD above fields that already have placeholders; forgot-password has a two-line paragraph.
- **Admin**: the "Live build / Update available / Latest on main" box is a banner-style info area.
Fix: delete the sentences; where something must be said put it behind the section's "i" (`.settings-info`, already built). Labels: add the existing `visually-hidden` class (`App.css:19`) and give the password fields placeholders ("Current password", "New password", "Again"). Keep the Delete account warning (a genuinely surprising action).

### F9. Stray boxes on the profile (Never 6, Never 8)
- A visitor sees a tab bar with **one tab** ("Posts 4", full width). Hide the bar when there is only one tab (`ProfileTabs.jsx`).
- **Subscribers** is a tab for a feature that does not exist ("coming later"), and its empty panel offers "+ New post". Remove the tab until subscriptions work.
- A folder shows its post as a card inside a panel with an empty band under it (`S/out/profile-test-own-d.png`, the "dfgdfg" folder).

### F10. The profile header jumps when the list is short (rule 9)
The header card's top is at 50px with posts, 165–200px on the Notes/Drafts/Subscribers tabs, 255px on the empty profile, 140px as a visitor (`S/crops/s1.png`, `S/out/profile-test3-own-d.png`). Switching tabs moves the whole header. Fix: top-align the profile column (remove the vertical centring on the profile page wrapper; `justify-content: flex-start` / no `margin-block: auto`).

### F11. Native browser prompts and controls in the editor (Never 7, Never 8)
`Editor.jsx:1232` Math uses `window.prompt('Enter LaTeX equation…')` (accepts anything, no preview); `Editor.jsx:561` code-block label prompt; `GlyphEditor.jsx:25` font-name prompt; `Editor.jsx:2085` `window.confirm` for unsaved changes. Native `<select>` in tool panels: `ButtonNode.jsx:137`, `GlyphEditor.jsx:47`, `PawOptions.jsx:29`, `ThemeEditor.jsx:52`. Fix: use the app dialog with one field (and for Math, render the result before inserting and refuse an empty or unparseable entry); use `GridSelect` (`TileGrid/GridUI.jsx`) for the selects.

### F12. Hard-coded light surfaces on themed cards (Never 11, rule 7, rule 4)
On Neon: the editor's sticky toolbar strip and Save row are cream-white across a navy card (`S/crops/n2.png`); folder popover, share menu and the arrange panel are white (`S/crops/n1.png`). Fix: toolbar strip background `transparent` (or `var(--th-card-background)`), Save buttons tinted from `--th-ink` like the owner pills (`themes.css:177`); popovers take `--th-card-background` / `--th-ink` with a 1px `--th-ink` 30% border. The arrange panel may stay a neutral tool (themes.css:512 says so) but then all of it must be app font (F1).

### F13. Storage accounting lives on the profile card (rule 8 judgement, Never 5)
"Storage: 2.7 MB of 50.0 MB", a bar, and an expanding 20-line breakdown sit in the public-facing header between the pills and the tabs. It is account information, not something on the page. Recommend moving it to Settings (a "Storage" section) and leaving nothing on the profile. Her words do not settle it: **show Mae**.

### F14. Editor rows do not line up (rule 9)
The URL row, Description field and Goes-in row start at the card's edge (x=340 on desktop; 4px from the edge on a phone) while the tool panel and Save row are inset 20px; the Description field is flush against both card edges on a phone (`S/crops/editor-1-top.png`, pane shot). "Grid on card" wraps alone onto a second line of the Page section. Fix: give `.post-slug-row`, `.post-summary-row`, `.post-section-row` the same horizontal padding as `.toolbar-sticky` (20px; 12px under 520px).

### F15. "Uploaded" still used for Publish (rule 6)
`Editor.jsx:1657`: `'Uploaded — your post is live.'` → `'Published.'`. Also "Edit" (profile card) vs "Edit post" (post page): use "Edit" in both.

### F16. Native selects and checkboxes where the app has its own (Never 7, rule 9)
Customize theme editor: five dark `<select>`s (Headings, Body, Heading case, Border, Shadow) and five browser checkboxes; its controls column is about 210px so the step chips wrap raggedly ("80% 90% / 100% 115% / 135% 160%", "0px 2px 6px / 12px 20px / 28px") (`S/crops/cust-all.png`). Settings: browser checkboxes and a native Font select right beside app step chips. Admin: selects and checkboxes. Fix: `GridSelect` and a toggle chip (white = on) in `ThemeEditor.jsx`; widen the controls column (`minmax(280px, 1fr)`), one row per stepper.

### F17. Clipped and overflowing things on a phone (rule 13, rule 9)
- Notifications: the title is cut to "**N**" beside "Mark all as read" and "Clear all" (`S/crops/h2.png`). Fix (`Social.css`, inbox header): `flex-wrap: wrap`, title on its own line under 520px.
- The round scroll-to-top button sits on top of "+ New grid post" on the profile and on the last two Insert tiles in the editor (pane shots). Fix (`ScrollToTop`): raise it above the content edge (`bottom: 84px`) or hide it while the editor toolbar is in view.
- Admin: Create-user fields run past the card; the user table scrolls sideways inside it.
- Touch targets under 40px: editor and grid tiles 26×26, section heads 26 high, owner pills 22–28 high, folder button 35×23, Customize chips 24 high, Messages New/Group 28 high, notification tick/cross 44×28.

### F18. Settings sizes and a dead-looking button (rule 9)
"You are signed in on 5 devices." and the "Signed in" rows are 16px beside 12.5px hints; the disabled "Delete my account" is white on cream and looks absent (`S/crops/set3.png`); the "i" sits alone on its own row above the Email field. Fix: body text 13px throughout; disabled = 50% opacity of the normal button; put the "i" at the right end of the section title row.

### F19. Notification wording repeats itself (Never 8)
"test2 commented on your post your post": `InboxPage.jsx:39` writes "on your post" and `PostLink` falls back to "your post" (`:23,31`). Fix: line 39 → `{a} commented on <PostLink n={n} />`.

### F20. Counts glued to tab labels (Never 6)
Activity: "Posts (4)  Comments (0)  Reactions (0)  Uploads (2)  Deletions (42)". Fix (`ActivityPage.jsx`): use the profile's tab control; count as the small `.profile-tab-count`, hidden at zero.

### F21. The confirm button says "Continue" (rule 10, Never 8)
Delete post asks "Are you sure…?" with **Continue / Cancel**; the dialog already takes a label (`Dialog/Dialog.jsx:12`, `confirmLabel`). Fix: `BasicTextPost.jsx:36` → `confirm('Delete this post? This cannot be undone.', 'Delete post', 'Delete')`, same for Unpublish (`Editor.jsx:1632`, "Unpublish") and admin deletes; style the confirm button red-outline when the label is Delete.

### F22. Mini player is a third design language (rule 5, Never 7, Never 10)
White box, square outlined buttons, a browser range slider for volume (`S/crops/mini.png`), while the in-post player is a dark pixel panel. Fix (`MiniPlayer.css/.jsx`): reuse the audio block's dark panel, `GridButton`s and its `.audio-range` styling.

---

## Judgements (not rule violations; she would likely dislike them)

- J1. Home on a phone: the pixel intro text is scaled by a non-whole factor and looks uneven (`S/crops/h2.png`). It is a screen she likes, so **show her before touching it** (Never 9).
- J2. `/login`, or any unknown name, shows a profile for a user that does not exist ("user: login, 0 followers"). Should say the page was not found.
- J3. Four tab styles: profile (segmented), Discover (underline), Admin (boxes), Activity (pills). One control would do.
- J4. Discover/Following: the author row is outdented 16px from its card.
- J5. The post-theme and sticker sheets open over the top bar, cutting through its buttons, and are white rounded sheets rather than the dark grid panels the rest of the editor's tools use.
- J6. The Insert row has an "i" (image limits) between Image and Audio; it reads as a tool. Move it to the end.
- J7. The autosave status sits to the left of Save draft / Publish and pushes them sideways when it appears; put it after them.
- J8. Messages: the panel's top edge moves between the list and an open conversation.
- J9. Sign in / Log In / Sign up / Create an account: the top bar says "Log In", the page and its button say "Sign in"; "Sign up" vs "Create an account". Pick one of each.
- J10. "+ New post" buttons take the theme's link colour as text; on a theme with a weak link colour the main action is faint. Use `--th-ink`.
- J11. Text glyphs as icons: "✓ Copied!", "⬡" for groups, "✕". Not emojis, but they are not the Basics pack either.
- J12. Customize is one 3,700px page with everything open; fold its sections as Settings does.

## Work packages (disjoint files)

**WP-A · App font and focus ring (F1, F2)** — `client/src/index.css`, `client/src/components/PageTheme/themes.css`, `client/src/styles/touch.css`, `TileGrid/GridUI.css`, `AudioNode.css`, `ButtonNode.css`, `ProfileStickies.css`.

**WP-B · Remove glass (F3, F17 notifications header)** — `Dialog/Dialog.css`, `Social/AvatarPopup.css`, `Social/FollowListModal.css`, `Social/ReportDialog.css`, `Social/Social.css`, `Social/MessagesPage.css`, `ImagePicker/ImagePicker.css`, `ImageCrop/ImageCropDialog.css`, `TileArt/Packs.css`, `TileArt/SharePackDialog.jsx`, `Pages/Posts/PostWindow.css`, `App.css`, `RichTextPost/Viewer.css`, `RichTextPost/Title.css`, `Pages/Search/SearchPage.css`, `Pages/Auth/Logout/Logout.css`, `ErrorBoundary/AppErrorBoundary.css`, `styles/tokens.css`, `guide/style-guide.md`.

**WP-C · Post editor (F5, F11 editor part, F12 toolbar, F14, F15, F8 editor sheets, blur in Editor.css)** — `RichTextPost/Editor.jsx`, `RichTextPost/Editor.css`, `TileGrid/GlyphEditor.jsx`, `TileGrid/TileGrid.jsx` (hint lines), `TileGrid/TileGrid.css`, `RichTextPost/ButtonNode.jsx`.

**WP-D · Profile (F6 profile part, F7, F9, F10, F12 popovers, F13, F21, F8 profile part)** — `PostsViewer/PostsViewer.jsx`, `ProfileEditor.css`, `ProfilePostList.jsx/.css`, `ProfileArrange.jsx/.css`, `ProfileTabs.jsx/.css`, `StorageSummary.jsx/.css`, `BannerEditor.jsx`, `BasicTextPost/BasicTextPost.jsx`, `Dialog/Dialog.jsx`.

**WP-E · Phone banner (F4)** — `ProfileBanner.jsx/.css`, `bannerGrid.js`. After Mae chooses the approach.

**WP-F · Settings and Customize (F8, F16, F18, F1 Georgia "i")** — `Settings/SettingsPage.jsx/.css`, `SecuritySection.jsx/.css`, `ChangePassword.jsx`, `DeleteAccount.jsx`, `CustomizePage.jsx`, `PixelFontsSection.jsx`, `PageTheme/ThemeEditor.jsx/.css`, `TileArt/PawOptions.jsx`, `TileArt/StickerCenter.jsx`.

**WP-G · Auth pages (F8 labels, blur in Login.css, J9)** — `Auth/Login/Login.jsx/.css`, `Auth/Registration/Registration.jsx/.css`, `Settings/ForgotPasswordPage.jsx`, `Navbar` label.

**WP-H · Small screens (F17 rest, F19, F20, F22, admin)** — `Social/InboxPage.jsx`, `Pages/Activity/ActivityPage.jsx/.css`, `AudioPlayer/MiniPlayer.jsx/.css`, `ScrollToTop/ScrollToTop.jsx/.css`, `Auth/AdminPanel/AdminPanel.jsx/.css`, `Discover/DiscoverPage.css`.

Order: A and B first (they change the most screens for the least code), then C and D. Login, Registration, AdminPanel, ThemeEditor, Editor.jsx, TileGrid.jsx, MessagesPage.jsx, Discover and Search are being edited by other workers right now; start G, H and the editor package only after those land.

**For Mae to decide:** F4 (how the banner reads on a phone), F13 (storage off the profile), F7 (which owner pills stay on a phone), F9 (remove the Subscribers tab for now), J1 (home text on a phone).
