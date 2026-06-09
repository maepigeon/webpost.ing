# UI Style Guide

## Design System: Neoskeuomorphic Glass

The app uses a "liquid glass" / frosted glass aesthetic with soft shadows and translucency. The palette is warm cream/beige with blue accents.

---

## Color Palette

| Role | Value | Usage |
|------|-------|-------|
| Page background | `#ece9e2` | HTML `background-color` (cream) |
| Glass card bg | `rgba(255,255,255,0.54)` | Profile card, post cards |
| Glass card bg (lighter) | `rgba(255,255,255,0.28)` | Editor post card |
| Blue accent | `#1a73e8` | Links, active tabs, buttons |
| Red/danger | `#d32f2f` | Error messages, delete actions |
| Text primary | `#222` / `#333` | Body text |
| Text secondary | `#555` / `#888` | Meta text, timestamps |

---

## CSS Variables (--neo-*)

Defined in `App.css` or `PostWindow.css`. Use these for all neoskeuomorphic UI elements:

```css
--neo-bg: rgba(255,255,255,0.54);
--neo-border: 1px solid rgba(255,255,255,0.72);
--neo-shadow: 0 2px 8px rgba(0,0,0,0.10), 0 1px 0 rgba(255,255,255,0.7) inset;
--neo-shadow-hover: 0 4px 14px rgba(0,0,0,0.14), 0 1px 0 rgba(255,255,255,0.7) inset;
--neo-shadow-active: 0 1px 3px rgba(0,0,0,0.12), 0 1px 0 rgba(255,255,255,0.6) inset;
```

---

## Glass Card Pattern

Used for all content cards (posts, profile, modals):

```css
background: rgba(255,255,255,0.54);
backdrop-filter: blur(14px) saturate(150%) brightness(1.06);
-webkit-backdrop-filter: blur(14px) saturate(150%) brightness(1.06);
border: 1px solid rgba(255,255,255,0.72);
border-radius: 16px;
box-shadow: 0 4px 24px rgba(0,0,0,0.08);
```

For the editor's unified post card (`editor-post-card`): slightly more transparent (`0.28`) with stronger blur (`16px`).

---

## Buttons

### Default buttons
Regular `<button>` elements use browser defaults with light styling overrides from `App.css`. Keep them minimal.

### Neoskeuomorphic buttons (`.edit-bio-btn`, `.follow-count-btn`, etc.)
Use `--neo-*` vars. Example pattern:

```css
.my-neo-btn {
  background: var(--neo-bg);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: var(--neo-border);
  border-radius: 10px;
  box-shadow: var(--neo-shadow);
  padding: 4px 12px;
  font-size: 12px;
  color: #555;
  cursor: pointer;
  transition: box-shadow 0.15s, transform 0.12s;
}
.my-neo-btn:hover { box-shadow: var(--neo-shadow-hover); transform: translateY(-1px); color: #1a73e8; }
.my-neo-btn:active { transform: translateY(0); box-shadow: var(--neo-shadow-active); }
```

---

## Typography

- Body font: system-ui / sans-serif (inherited)
- Editor content: same system font
- Code blocks: monospace (`SFMono-Regular, Consolas, monospace`)
- No custom fonts loaded (performance)

---

## Spacing

- Card padding: `24px–28px`
- Gap between stacked items: `10px–16px`
- Border radius: `8px` (small), `10px` (buttons), `16px` (cards), `20px` (editor card)
- Post max-width in editor: `628px`

---

## Toolbar / Editor

- Sticky toolbar: `background: rgba(255,255,255,0.55); backdrop-filter: blur(8px)`
- Toolbar buttons: flat, no border, hover shows `rgba(0,0,0,0.08)` background
- Active state on toolbar buttons: `background: rgba(26,115,232,0.12); color: #1a73e8`
- Toolbar divider: `1px solid rgba(0,0,0,0.12)`

---

## Error / Status Messages

- Error text: `color: #d32f2f; font-size: 12px`
- Success: implicit (UI state change)
- Loading state: `color: #888; font-size: 14px; text-align: center`

---

## Comment / Discussion Styling

- Comment cards: indented by depth (`padding-left` per depth level)
- Author link: `color: #1a73e8; font-weight: 600; text-decoration: none`
- Action buttons (Reply/Edit/Delete/React): flat, small, inline in `.comment-actions`
- Reaction bar: `display: flex; flex-wrap: wrap; gap: 4px`

---

## Notifications / Inbox

- Notification bell badge: red circle, absolute positioned
- Inbox items: glass card with sender name bold + message preview
- "sent you a message:" format for DM notifications

---

## Pattern Picker

- Swatch grid: wrapping flex with 48×48px swatches
- Active swatch: ring outline (`outline: 2px solid #1a73e8`)
- User preset swatches: same size, with ×-delete button overlaid
- Error text: `.pattern-picker-error` — red, small

---

## Responsive

- Content max-width: `640px` for activity/card pages, `628px` for editor
- Mobile: cards fill screen with `padding: 0 16px`
- Navbar: stacks to hamburger menu on small screens
