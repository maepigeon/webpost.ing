# UI Style Guide

## Design System: Neoskeuomorphic Glass

The app uses a "neoskeuomorphic glass" / frosted glass aesthetic — raised, tactile, dimensional surfaces with soft shadows, translucency, and physical depth. The palette is warm cream/beige with purple accents.

---

## Color Palette

| Role | Value | Usage |
|------|-------|-------|
| Page background | `#ece9e2` | HTML `background-color` (warm cream) |
| Glass card bg | `rgba(255,255,255,0.54)` | Profile card, post cards |
| Glass card bg (lighter) | `rgba(255,255,255,0.28)` | Editor post card |
| Purple accent | `#6c63ff` | Links, active states, logo text |
| Purple dark | `#4b44cc` | Button base, hover states |
| Orange accent | `#f5891c` | Primary action button (Log In in navbar) |
| Green accent | `#3cc85c` | Create account / register actions |
| Red / danger | `#d32f2f` | Error messages, delete actions |
| Text primary | `#1a1060` / `#222` | Headings, body |
| Text secondary | `#555` / `#888` | Meta text, timestamps, labels |

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

**RULE: Gradients are ONLY used for 2.5D skeuomorphism — never for decoration.**

### Button depth gradients
Always `linear-gradient(to bottom, ...)` — horizontally symmetric, never diagonal degrees.

```css
/* Purple button */
background: linear-gradient(to bottom, #8880ff 0%, #6c63ff 50%, #4b44cc 100%);

/* Orange button */
background: linear-gradient(to bottom, #ffb347 0%, #f5891c 55%, #d06010 100%);

/* Green button */
background: linear-gradient(to bottom, #72e08a 0%, #3cc85c 55%, #1aa83a 100%);
```

All button inset shadows must also be horizontally symmetric:
```css
inset 0 2px 0 rgba(255,255,255,0.7),   /* top highlight */
inset 0 -2.5px 0 rgba(0,0,0,0.25),     /* bottom shadow */
inset 1.5px 0 0 rgba(255,255,255,0.4), /* left edge — same value as right */
inset -1.5px 0 0 rgba(255,255,255,0.4) /* right edge — same value as left */
```

### Glass edge / refractive ring (::before pseudo-elements)
Use `conic-gradient` to simulate light bending around the curved edges:

```css
background: conic-gradient(
  from 0deg at 50% 50%,
  rgba(255,255,255,0.92)    0deg,
  rgba(220,215,255,0.55)   45deg,
  rgba(160,140,255,0.32)   90deg,
  rgba(80, 60, 200,0.28)  135deg,
  rgba(30, 20, 100,0.38)  180deg,
  rgba(80, 60, 200,0.22)  225deg,
  rgba(160,140,255,0.32)  270deg,
  rgba(220,215,255,0.55)  315deg,
  rgba(255,255,255,0.92)  360deg
);
```

This creates prismatic color dispersion around the glass edges — top is bright white, sides show violet-blue, bottom deepens to indigo.

### Radial gradients (glass card highlight)
For glass card backgrounds, use a centered top radial for the light source:
```css
background:
  radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%),
  rgba(255,255,255,0.46);
```

Note: The ellipse must be at `50%` (centered), not `40%` or any off-center value.

### NEVER use gradients for:
- Logo text (use flat color)
- Decorative coloring or section backgrounds
- Avatar fallback circles (use `linear-gradient(to bottom, ...)` with symmetric values only)

---

## Glass Card Pattern

Used for all content cards (posts, profile, modals):

```css
.glass-card {
  position: relative;
  background:
    radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%),
    rgba(255,255,255,0.46);
  backdrop-filter: blur(24px) saturate(200%) brightness(1.04);
  -webkit-backdrop-filter: blur(24px) saturate(200%) brightness(1.04);
  border-radius: 18px;
  border: 1.5px solid transparent;
  background-clip: padding-box;
  box-shadow:
    0 16px 48px rgba(0,0,0,0.12),
    inset 0 2.5px 0 rgba(255,255,255,0.98),
    inset 0 -1.5px 0 rgba(80,60,120,0.10),
    inset 2px 0 0 rgba(255,255,255,0.60),
    inset -2px 0 0 rgba(80,60,120,0.07);
  isolation: isolate;
}
```

The `::before` provides the refractive edge ring (see Gradient Rules above).

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
