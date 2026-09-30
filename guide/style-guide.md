# UI Style Guide

## Design System: Neoskeuomorphic Glass

The app uses a "neoskeuomorphic glass" / frosted glass aesthetic — raised, tactile, dimensional surfaces with soft shadows, translucency, and physical depth.

**The UI is grayscale** (owner's request, 2026-09-29). Every UI colour was converted to the gray of equal luminance, so contrast and depth are unchanged. Colour is kept only for:
- user content — photos, wallpapers, text colours chosen in posts, code syntax highlighting, the homepage water title and favicon;
- meaning — red for danger, errors and unread badges; green for online and success.

Do not add purple, orange or other hues back to chrome. Links stay identifiable by weight or underline rather than colour.

---

## Color Palette

| Role | Value | Usage |
|------|-------|-------|
| Page background | `#e9e9e9` | `--page-bg` |
| Ink | `#1c1c1c` / `#505050` / `#828282` | `--ink`, `--ink-soft`, `--ink-faint` |
| Accent | `#565656` text, `#666666` fill | `--accent`, `--accent-fill` |
| Glass card bg | `rgba(255,255,255,0.54)` | Profile card, post cards |
| Red / danger | `#d32f2f` | Error messages, delete actions, unread badges |
| Green / ok | `#2ecc71` | Online status, success messages |

---

## CSS Variables (--neo-*)

Defined in `PostWindow.css :root`. Use for all neoskeuomorphic buttons and surface elements:

```css
--neo-bg:
  radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0) 70%),
  linear-gradient(to bottom, rgba(255,255,255,0.65) 0%, rgba(215,212,208,0.70) 100%);
--neo-border: 1.5px solid rgba(255,255,255,0.88);
--neo-shadow:
  0 0 0 1px rgba(255,255,255,0.52),
  0 5px 18px rgba(0,0,0,0.13),
  inset 0 2px 0 rgba(255,255,255,0.95),
  inset 0 -2px 0 rgba(0,0,0,0.10),
  inset 2px 0 0 rgba(255,255,255,0.45),
  inset -2px 0 0 rgba(0,0,0,0.06);
```

---

## Gradient Rules

**RULE: fills are flat. Gradients are not used for surfaces at all.**

Updated 2026-09-08. The previous rule allowed gradients "for 2.5D
skeuomorphism", which in practice meant every button, card, badge and avatar
carried one — 82 gradient declarations across 40 stylesheets, no two adjacent
surfaces matching. They now number four.

A gradient in a `background` is almost always decoration pretending to be depth.
The raised look survives without it, because the inset light-top / dark-bottom
edges were doing the work all along:

```css
/* Raised control */
background: var(--accent-fill);        /* flat */
box-shadow:
  inset 0 1.5px 0 rgba(255,255,255,0.4),    /* light catches the top edge */
  inset 0 -1.5px 0 rgba(0,0,0,0.2),         /* shadow under the bottom edge */
  0 2px 6px rgba(26,16,96,0.1);             /* the object sits above the page */
```

Glass surfaces are a translucent flat fill plus `backdrop-filter`. The blur is
what makes them read as glass; a sheen gradient on top added nothing.

```css
background: var(--surface-1);
backdrop-filter: var(--blur-glass);
box-shadow: var(--raise-2);
```

### The four gradients that remain, and why

| Where | Why it stays |
|---|---|
| `PatternPicker/patterns.js` | The wallpaper engine. Gradients *are* the product here. |
| `PatternPicker.jsx` placeholder | Example text showing a user what to type. |
| `MessagesPage.css` thread backdrop | `repeating-linear-gradient` — a texture, not a fill. |
| `ImageCropDialog.css` crop frame | `repeating-conic-gradient` — the standard transparency checkerboard. |

Anything else is a regression. To check:

```bash
grep -rn "gradient(" client/src --include=*.css --include=*.jsx | grep -v patterns.js
```

---

## Tokens

`client/src/styles/tokens.css` holds the palette, the surface recipes and the
motion values, and is imported first in `main.jsx`. **Use the variables, not
literals.** Every off-palette colour in this app arrived as a hard-coded hex in
one component.

| Token | Use |
|---|---|
| `--ink` / `--ink-soft` / `--ink-faint` | body / meta / placeholders. Never `--ink-faint` for real text. |
| `--accent` | purple **as text** on a light surface (5.2:1) |
| `--accent-fill` | purple **as a fill** under white text (5.5:1) |
| `--surface-1/2/3` | glass: cards / dialogs / inputs |
| `--raise-1/2/3` | raised: control / panel / dialog |
| `--pressed`, `--focus-ring` | interaction states |
| `--radius-sm/md/lg/pill` | corners |

Two purples exist because one colour cannot do both jobs: `#5b52e8` is too light
to read as text on cream, and `#4b44cc` is too dark to sit under white and still
look like the accent.


## No glass card panels

The `.glass-card` panel (frosted plate with a conic-gradient refractive rim) was
removed on 2026-09-29 at the owner's request: it looked bad, and several attempts
to fix it did not help. Do not reintroduce it — on the home page or anywhere else.


### backdrop-filter stacking context warning
Any element with `backdrop-filter` creates a new containing block for `position: fixed` descendants. **Never render `position: fixed` modals or overlays inside an element with `backdrop-filter`.** Always use React `createPortal(content, document.body)` for modals.

### CSS transform stacking context warning
Any element with `transform` (including `translateY(0)`) creates a stacking context that traps `position: fixed` children. In CSS animations:
- The `to` keyframe must use `transform: none` (not `transform: translateY(0)`) to avoid trapping fixed descendants after the animation completes.

---

## Buttons

### Neoskeuomorphic raised buttons
Use `--neo-*` vars for ghost/glass buttons. Apply to `.edit-bio-btn`, `.follow-count-btn`, etc.

```css
background: var(--neo-bg);
backdrop-filter: blur(10px);
border: var(--neo-border);
border-radius: 10px;
box-shadow: var(--neo-shadow);
```

### Action buttons (colored, 2.5D)
Purple, orange, green variants — all use `linear-gradient(to bottom, ...)` with symmetric insets.

### Button grouping on profile
- Use two sub-groups separated by a 1px divider
- Group 1 (content): Bio | Links
- Group 2 (appearance): Wallpaper | Export data
- No `space-evenly` — use `gap: 4px` within groups, `gap: 8px` between groups

---

## Typography

- Body font: system-ui / sans-serif (inherited)
- Code blocks: monospace (`SFMono-Regular, Consolas, monospace`)
- Logo / wordmark: flat `#6c63ff` — no gradient
- No custom fonts loaded (performance)

---

## Spacing

- Card padding: `24px–28px`
- Gap between stacked items: `10px–16px`
- Border radius: `8px` (small), `10px` (buttons), `16px–18px` (cards), `22px–24px` (modals)
- Post max-width in editor: `628px`
- Content max-width: `640px` for activity/card pages

---

## Responsive Breakpoints

| Breakpoint | Width | Used for |
|---|---|---|
| Mobile | `≤ 520px` | Navbar collapse, compact toolbar |
| Tablet | `521px–860px` | Two-column → single column |
| Desktop | `> 860px` | Full layout |

### Mobile vs Desktop rules
- Modals: always full-width on mobile (`width: min(480px, calc(100vw - 24px))`)
- AvatarPopup card: `width: min(340px, calc(100vw - 48px))`
- Notification dropdown: centered, `width: min(480px, calc(100vw - 24px))`
- Cursor glow: hidden on touch screens (`@media (hover: none)`)

---

## Toolbar / Editor

- Sticky toolbar: `background: rgba(255,255,255,0.55); backdrop-filter: blur(8px)`
- Toolbar buttons: flat, no border, hover shows `rgba(0,0,0,0.08)` bg
- Active: `background: rgba(108,99,255,0.12); color: #6c63ff`

---

## Error / Status Messages

- Error text: `color: #d32f2f; font-size: 12px`
- Loading state: `color: #888; font-size: 14px; text-align: center`

---

## Modals

All modals must be rendered via `createPortal(content, document.body)` so they escape any `backdrop-filter` or `transform` stacking contexts. See `FollowListModal.jsx` and `AvatarPopup.jsx` for the pattern.

Modal overlay: `position: fixed; inset: 0; z-index: 1000+`
Modal card: glass card pattern with spring animation

---

## Cursor Glow

`CursorGlow.jsx` renders a `position: fixed` purple radial gradient that follows the cursor.

- Starts invisible (`opacity: 0`) and reveals only after first mouse move
- Positioned via JS `requestAnimationFrame` loop: `transform: translate(clientX, clientY)`
- CSS positions the element center at (0, 0) via `top: 0; left: 0; margin: -280px`
- No `mix-blend-mode` (multiply was invisible on the light cream background)
- Hidden on touch screens

---

## Upload Limits

- Normal users: 50 MB per file, 50 MB total storage quota
- Trusted users: 500 MB total
- Restricted users: 5 MB total
- Admin: 500 MB total
- Limits are enforced server-side in `UploadController.java` (`app.upload-max-size`) and `role_limits` table

---

## Post Groups / Folders (Profile Page)

The profile post list (`ProfilePostList.jsx`) supports drag-and-drop reordering and folder grouping.

### Drag-and-drop
- Uses `@dnd-kit/core` + `@dnd-kit/sortable`
- Only visible to the profile owner (`canEdit === true`)
- Drag handle: `⠿` icon on the left of each post
- Reorder within same group: drag a post onto another in the same folder (or ungrouped area)
- Move to another folder: drag a post and drop it onto a folder header zone

### Creating groups (folders)
- Drag one ungrouped post directly onto another ungrouped post → prompts for a folder name
- Type the folder name and press Enter or click "Create"
- Both posts move into the new folder

### Removing from a folder
- Open a folder by clicking "Open ↗" on its header
- In the popup, click "✕ Remove from folder" on any post

### Persistence
- All order changes call `UPDATE_POST_ORDER(username, updates)` immediately
- `updates` is an array of `{ id, sortOrder, folder }` for all posts

### Portals
- `FolderPopup` and the folder name prompt use `createPortal(content, document.body)`
  to escape any stacking context from backdrop-filter ancestors

---

## Modal Portal Pattern

All `position: fixed` overlay modals MUST use `createPortal(content, document.body)`.

Files using this pattern:
- `FollowListModal.jsx`
- `AvatarPopup.jsx`
- `ProfilePostList.jsx` (FolderPopup + folder name prompt)

Without the portal, `backdrop-filter` on any ancestor element traps `position: fixed`
descendants inside the ancestor's bounds instead of the full viewport.
