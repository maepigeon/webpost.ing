# implementer-design-c-editor (Sonnet, `implementer`)

Post editor fixes from the two reviews. Read first: `guide/DESIGN-RULES.md`,
findings **F5, F11, F12 (toolbar), F14, F15** in
`guide/design-audit-2026-10-03.md`, and **Broken 2** plus the editor items
under "Confusing" in `guide/ui-review-2026-10-03-new-features.md`.

## Your files (only these)
`Editor.jsx`, `Editor.css`, `GlyphEditor.jsx`, `TileGrid.jsx`, `TileGrid.css`,
`ButtonNode.jsx` (under `client/src`), and their existing tests.

## Fix, most important first
1. **Publishing a new post (data-loss bug).** After the first Publish of a new
   post the editor still says "Draft saved" and still shows "Save draft" /
   "Publish"; clicking "Save draft" then unpublishes the post. The create
   branch (about `Editor.jsx` 1652–1670) never tells the editor the post is
   published (`onPublishedChange`). After a first Publish the editor must be in
   exactly the state it is in when a published post is opened for editing. Add
   a test that fails before the fix.
2. `Editor.jsx:1657` "Uploaded — your post is live." → "Published."
3. **No floating notes.** Mae: "i dont like these kinds of notes Description
   Goes in. they are bad design". At about lines 1490, 1523, 1531 confirm the
   words "Description", "Goes in" and "Shown on your profile when published."
   are not visible text (a visually hidden label for screen readers and a
   placeholder inside the field are right). Remove any that still show.
4. **Sticky toolbar too tall** (F5): about 340px on desktop and more than half
   the screen at 390px. While a grid is open only the Save row stays sticky;
   the tool rows scroll with the page. Nothing else moves.
5. **Rows line up** (F14): the URL, description and "Goes in" rows share the
   tool panel's left and right edges.
6. **The toolbar strip takes the theme** (F12): no hard-coded cream on a dark
   card; use the `--th-*` variables that are already contrast-checked.
7. **No browser prompts or native selects in tools** (F11):
   `Editor.jsx:1232` (Math), `:561`, `:2085`, `GlyphEditor.jsx:25`, and the
   selects at `ButtonNode.jsx:137`, `GlyphEditor.jsx:47`. Use the dropdown and
   inline-field components the editor already uses elsewhere; do not invent a
   new one.
8. "Open one of my posts" in the Button block lists only published posts.
9. The Insert-row toolbar button without an accessible name gets one (and a
   hover label through `tips.js`, as its neighbours have).
10. After Restore / Discard on the autosave bar, focus goes to the editor's
    writing surface, not `<body>`. The two buttons look like buttons (the same
    small grey button the editor uses beside them).

## Not yours
`App.css`, `index.css`, `themes.css`, `ButtonNode.css`, `ThemeEditor.*`: other
workers have them. Report insertions.

## Checks
`npx vitest run` for the editor, tile grid and button tests; `npx eslint` on
your files. You cannot see the result: list what a checker should click.

No commit, no `vite build`, no servers.
