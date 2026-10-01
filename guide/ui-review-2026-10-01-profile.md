# UI review 2026-10-01: profile, arrange, navbar, settings, themes

Reviewer: ui-reviewer agent, headless Chromium (Playwright), on branch
`claude/ui-fixes-2026-10-01`.

**What was tested.** The pre-built snapshot (`app.jar` + `dist/`, built
01:09). That is the HEAD build. The working copy has uncommitted edits to
`ProfileArrange.jsx/.css` and `App.css`, which add the "i" keyboard-keys
button, named screen-reader announcements and ArrowLeft/ArrowRight indent
moves. The snapshot does not contain them, so they were **not** tested.
Line numbers below are for the current working copy unless marked HEAD.

Setup: own server on :8082 and preview on :5176, database
`webposting_uireview`. Users `reviewer` and `visitor` (throwaway). 25
published posts, 3 drafts and folders Recipes/Travel, with one comment
by visitor on Post 01.

Viewports: desktop 1440×900, phone 390×844 (isMobile, hasTouch, DPR 2).

Scratch dir (all evidence paths are relative to it):
`/private/tmp/claude-501/-Users-mae-workspace-webposting--claude-worktrees-kind-driscoll-e5fb5f/87be1c04-857d-4336-9a7a-4bd52c5ce943/scratchpad/uireview/`

Severity counts: **broken 5, confusing 8, cosmetic 9.**

---

## Broken

### 1. Per-post folder menu is covered by the next post's folder button
- **What happens.** You open the 📁 menu on a post. The next post's 📁 button
  is painted *on top of* the menu, right over the "New folder" input and its
  "+" (Create folder) button. Clicking there hits the other post's button,
  which opens that post's menu instead. You can still create a folder with
  Enter.
- **Should.** The open menu sits above everything on the page.
- **Steps.** Desktop, as owner on /reviewer. Click 📁 on a post that has
  another post below it, such as Post 03.
- **Evidence.** `shots/foldermenu-desk-03.png`, `shots/foldermenu-zoom.png`.
- **Cause.** `.profile-post-folder-btn-wrap` has `z-index: 20`
  (`client/src/components/Pages/Posts/PostsViewer/ProfilePostList.css:46-51`).
  Every post's wrap is a stacking context at the same level, and later posts
  win. So the menu's `z-index: 500` (:75-79) applies only inside its own
  wrap. Raise the wrap's z-index while its menu is open, or portal the menu.

### 2. Settings → Page theme on a phone: the sticky preview covers the controls
- **What happens.** In one column, the large preview
  (`.theme-preview--large`, min-height 360px) is `position: sticky`. It
  covers y=100–574 of the 844px screen (56%), and the controls scroll
  underneath it. The Opacity slider at y=364 is under the preview
  (`elementFromPoint` returns the preview's `<p>`). Only the bottom ~270px of
  the screen can be used to edit Type and Cards.
- **Should.** On a single column, the preview is not sticky, or it shrinks
  to a short strip.
- **Steps.** Phone, /settings, scroll to "Cards".
- **Evidence.** `shots/settings-phone-sticky-preview.png`,
  `shots/cards-phone.png`.
- **Cause.** `client/src/components/PageTheme/ThemeEditor.css:82`. The sticky
  rule is not limited to the two-column layout (`@media (max-width: 760px)`
  at :79 only changes the grid).

### 3. A draft's URL opened by anyone else shows an empty "Draft" page plus an uncaught error
- **What happens.** As visitor or signed out, open /reviewer/26 (a draft).
  The page shows a card reading "Author:" and "Draft — only you can see it."
  with an empty editor ("Enter some text…") and Report/Share buttons. The
  console shows `pageerror: Request failed with status code 404`. No draft
  content leaks: the API returns 404.
- **Should.** A plain "post not found" page, or a redirect.
- **Evidence.** `shots/draft-url-visitor.png`.
- **Cause.** `client/src/components/Pages/Posts/PostRenderer/RichTextPost/Viewer.jsx:217`.
  `READ_POST(id).then(...)` has no `.catch`. `postPublished` starts as `false`
  (:131), so `TitleBar.jsx:71` shows the Draft line. The redirect effect
  (:238-241) never runs because `postLoaded` stays false.

### 4. Every signed-in post view returns 500 (`POST /api/posts/{id}/view`)
- **What happens.** Each time a signed-in user opens a post page, the
  request returns 500. Server log:
  `ERROR: ON CONFLICT does not support deferrable unique constraints/exclusion constraints as arbiters`
  for `INSERT INTO post_views(post_id,user_id) VALUES(?,?) ON CONFLICT DO NOTHING`.
  So signed-in views are never recorded, and each page view logs a console
  error.
- **Steps.** Any signed-in user, any post page, on a database freshly
  migrated from the repo's migrations.
- **Evidence.** `server.log` in scratch dir (lines 51, 173, 295…).
- **Cause.** `server/src/main/resources/db/migrations/V001__schema.sql:522-523`
  creates `post_views_pkey PRIMARY KEY (post_id, user_id) DEFERRABLE`, used by
  `server/.../posts/repository/SocialRepository.java:705`. Also,
  `post_views_user_id_fkey ... ON DELETE SET NULL` (:676-677) can never work
  on a primary-key column.
- **Disclosure.** To confirm it is not only my database, I ran one
  read-only catalog query against `testdb`
  (`select conname, condeferrable from pg_constraint …`). It showed the
  same deferrable PK. Nothing was written. Sorry for touching it.

### 5. Hamburger menu stays open after you navigate
- **What happens.** Phone, open ☰ and tap Notifications. You land on
  /inbox but the menu panel stays open over the page. The same happens for
  My Profile, Settings and the rest.
- **Should.** The menu closes when the route changes.
- **Evidence.** `shots/inbox-phone.png`. Script output: `popup still open? 1`
  after each navigation.
- **Cause.** `client/src/components/Navbar/Navbar.jsx:58`.
  `useEffect(() => { setMenuOpen(false); }, [])` runs only on mount, and the
  Navbar never unmounts. Depend on `location.pathname`.

---

## Confusing

### 6. Phone, arrange: a quick swipe that starts on a grip reorders posts
- **What happens.** A fast vertical flick (no hold) that starts on a grip
  drags the row at once and drops it somewhere else. In my run Post 03 left
  Recipes this way and the move was saved. The TouchSensor's 160ms delay
  ("so a swipe over the list still scrolls the page") never applies.
  `PointerSensor` (distance 4) also receives touch pointer events and starts
  first. The grip also has `touch-action: none`. Swipes on the row body do
  scroll (345px). Deliberate touch drags with a 300ms hold work well.
- **Should.** Either keep the delay for touch (use
  `MouseSensor` + `TouchSensor` instead of `PointerSensor`, or check
  `pointerType`), or accept it. The grips are on the left edge, where a
  left thumb scrolls.
- **Evidence.** t6 output `quick swipe: scroll delta 0 order changed true`.
- **Cause.** HEAD `ProfileArrange.jsx:153-156` (working copy same).

### 7. Phone, arrange: holding near the bottom edge autoscrolls fast and the row runs away
- **What happens.** I touch-dragged Post 01 onto the last visible row
  (Draft 3, partly under the ↑ scroll-to-top button) and held it there for
  0.4s. The list scrolled about 10 rows, and the drop landed after Post 15
  instead of after Draft 3. With a 0.08 threshold, the bottom 67px of the
  phone screen is the autoscroll zone, and that is where the thumb rests.
- **Evidence.** `videos/fr-phone/f070.png`–`f080.png`, contact sheet
  `videos/sheet-phone.png` (bottom row), video
  `videos/arrange-phone-touch.webm`.
- **Suggestion.** Slower autoscroll acceleration on touch, or hide the ↑
  button while arranging so the last row can be reached.

### 8. Folder contents and count change above you while scrolling a profile
- **What happens.** Page 1 shows "Travel 2" (Post 05, Post 09). Scrolling
  loads page 2, and Post 22 appears *inside* the Travel folder far above the
  viewport. The folder's count changes to 3 and its height changes off
  screen. Visitors see the same. A folder's header count is wrong until
  every page is loaded.
- **Evidence.** t2 output, "page1 only" vs "after scroll".
- **Cause.** Folders are grouped client-side from loaded pages
  (`toBlocks` in `profileOrder.js`). Either fetch a folder's members (or
  count) with page 1, or order the server so folder members are contiguous.

### 9. Saved Paws wallpaper: the colour controls are gone after reload
- **What happens.** Pick Paws, set colouring to "Rainbow, downwards" and 4×,
  then Save wallpaper and reload. The wallpaper is correct (rainbow paws, 4×),
  but the Paws chip is no longer selected and the colouring dropdown is
  hidden. To change the colours you must click Paws again, which builds a
  fresh texture.
- **Evidence.** `shots/wp-desk-after-reload.png`.
- **Cause.** `client/src/components/TileArt/WallpaperEditor.jsx`. The
  `texture`/`pawOptions` state is not restored from the saved wallpaper
  (the dropdown renders only when `texture === 'paws'`, around :74).

### 10. Theme slider values are outside the Cards box (desktop: clipped/on the wallpaper)
- **What happens.** The value labels ("110%", "100%", "22px") stick out about
  38px past the right edge of the fieldset at both sizes. On desktop they
  sit on the page wallpaper outside the box. On the phone, a lone "%" pokes
  out at the right edge.
- **Evidence.** `shots/cards-desk-sliders.png`, `shots/cards-desk.png`,
  `shots/settings-phone-sticky-preview.png` (right edge). Overflow check:
  `span "100%" [1026..1070] vs fieldset [742..1032]`.
- **Cause.** `ThemeEditor.css:134-136`. `.theme-slider input { flex: 1 }` has
  no `min-width: 0`, so the 44px label is pushed out.
- **Sliders found (owner dislikes them).** Page theme → Type → **Heading
  size**, Cards → **Opacity**, Cards → **Corners**, and Code blocks →
  **Size** (13px). They are green (browser accent), not grayscale chrome.
  The wallpaper pixel size is buttons now. Good.

### 11. Navbar ☰ panel: buttons run off the right edge
- **What happens.** In the 390px menu, every item's link is 281px wide inside
  a 247px column. The button inside starts 17px in, so its right end and
  rounded corner are cut off at the screen edge (right=391 vs 374).
- **Evidence.** `shots/hamburger-phone.png`. t9b: `A x=127 w=281`,
  `navButton x=144 w=247 right=391`.
- **Cause.** `client/src/components/Navbar/Navbar.css:171-180`.
  `padding: 10px 14px` and `width: 100%` are applied to the wrapping `<a>`
  as well as the `.navButton`. Drop the `a` from that selector, or give it
  `display: block; padding: 0`.

### 12. Navbar button sizes differ a lot between the bar and the ☰ menu on a phone
- Bar (phone): Home/New Post/Search are 24px tall at 12px font. ☰ is 38×32.
  Menu items are 39px tall at 16px font. Desktop bar: 28px tall at 13px.
  The 24px bar buttons are below a comfortable thumb target (44px). The
  phone navbar is 88px tall but its buttons are only 24px, with a large
  empty band on the left.
- **Evidence.** `shots/profile-phone-top.png`, `shots/hamburger-phone.png`.

### 13. Corkboard on a phone post page: the pin's head is cut by the navbar
- **What happens.** On /reviewer/post-01 at 390px, the sticker top is
  y=84 but the navbar ends at 88. The top 4px of the push pin is hidden.
  On desktop it clears (72 vs 48). Profile cards and the profile header show
  whole stickers at both sizes, and Pawprint plus Star fits exactly.
- **Evidence.** `shots/Corkboard-phone-visitor-post.png`,
  `shots/sticker-post-zoom.png` (left panel).
- **Fix idea.** The post-page card's top margin at least
  `var(--th-sticker-h) / 2` beyond `--navbar-height`.

---

## Cosmetic

14. **The folder menu and folder button are glass.** `backdrop-filter: blur(22px)`
    on `.profile-post-folder-menu` and `blur(8px)` on `.profile-post-folder-btn`
    (`ProfilePostList.css:53-91`). The ☰ panel is
    `rgba(21,21,21,0.72)` + `blur(28px)` (`Navbar.css:126-128`), and in
    `shots/hamburger-phone.png` the page shows through it. The style guide
    says no glass panels.
15. **Paws gradient: "Add a colour" copies the last colour**, so after adding
    there are 4 identical blue swatches and the preview does not change
    (`PawOptions.jsx`, add handler). The remove "×" buttons are 14×14px, sit on
    the corner of each swatch and overlap the next one. That is hard to hit
    on a phone (`shots/wp-phone-gradient6.png`). Also, the "Behind" swatch is
    white while the Paws texture paints its own black background, so changing
    it seems to do nothing.
16. **Arrange header on a phone.** "Done" floats in the middle-left with an
    empty gap where the status text goes (`.arrange-status` min-width 4em,
    `ProfileArrange.css:45-51`). The ↑ scroll-to-top button covers the right
    end of rows (DRAFT badges) while arranging (`shots/arrange-phone.png`).
17. **Profile action bar (desktop).** "+ New grid post" (dashed, sans-serif,
    left at x=406) and "Arrange posts" (soft white, serif, right, own row)
    don't line up with each other or with the cards (x=420), and use
    different styles (`shots/profile-desk-top.png`).
18. **Owner header on a phone.** The "+ Bio / + Links | Appearance / Export
    data" row wraps with the `|` divider left dangling at the end of the
    first line (`shots/profile-phone-top.png`).
19. **Folder block width.** On a phone the folder section (24–756) is wider
    than the post cards (40–740). Its left accent bar sits outside the
    rounded corner (`shots/profile-visitor-phone.png`).
20. **Console noise on every profile view.** `GET /api/users/<name>/pinned-post`
    returns 404 when nothing is pinned, and the browser logs it as an error.
    `PostsViewer.jsx:240` handles it, but a 204 or `null` would keep the
    console clean.
21. **Chatty requests.** One profile load makes 11×
    `POST /api/authorizeSession`, 4× `GET /api/notifications/unread-count`
    and 2× `GET /api/conversations/unread-count`.
22. **Nested interactive elements.** Post cards render
    `<a href="/editor/N"><button> Edit </button></a>`, and the ☰ items are
    `<a><button>`. That is invalid HTML and gives two tab stops or a
    confusing screen-reader name. Also, in HEAD the keyboard-drag live region
    announced internal ids ("Draggable item post:1 was moved over droppable
    area post:7"). The working copy's `nameOf` announcements should fix
    that. Please verify after rebuilding.

---

## Tested and working

- Profile order as owner (desktop and phone): drafts placed by date, folders
  at their newest member's position. Scrolling through both pages gives **no
  duplicates**, as owner, visitor and signed out, at both sizes.
- Folder menu: move into an existing folder, create a new folder (Enter),
  remove from folder. Each saves one `PUT /posts/order`, and the order is
  identical after reload.
- Arrange mode (desktop, pointer drags in 4px/16ms steps):
  - reorder;
  - post into a folder by dropping among its posts ("into Recipes" label);
  - post out of a folder ("out of Travel");
  - below a folder's last post: no sideways move keeps it outside, and
    +40px right joins at the end ("into Recipes");
  - folder above posts (to the top), and folder below a post: it moves
    whole, and its slot keeps its height;
  - Escape mid-drag puts the row back.

  Status shows "Saved", and everything survives a reload. Video:
  `videos/arrange-desktop.webm`; frames `videos/fr-desk2/`,
  `videos/folderdrag-hi.png`.
- Keyboard arrange in HEAD: focus a grip, then Space, ArrowDown ×2, Space
  moves the post (into Recipes, since it lands among its posts). Focus stays
  on the moved row's grip.
- Phone arrange with a deliberate touch drag (hold, then move) works for a
  post into a folder, a folder below another folder, and a post out of a
  folder. No sideways page scroll at 390px.
- Visitor and signed out: no drafts in the DOM or in any API response, no
  Arrange button, no 📁 buttons, no Delete/Edit.
- Notifications goes to /inbox on desktop and from the ☰ menu.
- Wallpaper Paws: all four colourings render. Gradient adds up to 6 stops,
  then the + disappears, and removing works. Pixel buttons 1×–8× update the
  preview and `aria-checked`. No overflow in the wallpaper editor at either
  size. The Cards fieldset has nothing outside it except the slider labels
  (#10), also with the Paws texture and tile designer open.
- Corkboard and Pawprint Phenomenon (with Star) save and apply. Stickers are
  whole on profile cards and the profile header at both sizes, and on the
  desktop post page (phone post page: #13).
- Avatars are squircles (`corner-shape: squircle`, supported in this
  Chromium) in the profile header, comments (discussion page) and search
  results.
- Idle CPU on a themed profile: 0.116s TaskDuration over 5s. Fine.

## Clean-up

Stopped only the processes I started: server PID 19647 (`java -jar app.jar`
on :8082) and preview PID 19698 (`vite preview` on :5176). Both ports are
free. Dropped `webposting_uireview` (confirmed gone). Did not touch ports
8080/8081/5174/5175, or `webposting_test`, git, client/ or server/. The one
exception is the read-only catalog query on `testdb` noted in #4.

---

## Status (2026-10-01, after fixes)

Fixed and re-checked in a browser: #1, #2, #3, #4 (V008), #5, #6, #7, #8
(server orders folders as blocks), #9, #10 (sliders are buttons now), #11,
#12, #13, #14, #15, #16, #17, #18, #19, #20 (204), #21 (2 session checks per
load instead of 11), #22 (no buttons inside links).

Found while fixing #20: a pinned draft was shown to anyone with the author's
name in a username cookie (token never checked). Fixed.
