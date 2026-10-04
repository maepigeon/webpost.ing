# Visual gate: editor (gate-editor, account test2)

Site: http://localhost:5175 (build of 0bede03). Sizes 1300x850 and 390x844 (touch). Flows: `tools/visual/flows/gate-editor-publish.mjs`, `gate-editor-grid.mjs`, `gate-editor-draft.mjs`. Output: `tools/visual/out/gate-editor/` (videos in `videos/`, frame sheets in `videos/gate-editor-publish-{desktop,phone}-frames/sheet.png`, captures in `gate-editor-<flow>/`). Every post I made was deleted by the flows' cleanup (DELETE 200 logged for each). No native browser dialog appeared anywhere (listener on every flow). No element with a backdrop-filter or blur was found in the editor, with a grid open, the glyph editor, or the theme dialog (computed-style scan).

New baselines created: 6 (`tools/visual/baselines/gate-editor-publish/{editor-empty,typed,scrolled-sticky}-{desktop,phone}.png`). Not updated, not compared (no earlier baselines).

## Flows

| Flow | Desktop | Phone | Evidence |
|---|---|---|---|
| New text post, type, Publish: editor is in the published state | PASS | PASS | `gate-editor-publish/after-publish-card-desktop.png`; status "Published.", buttons "Unpublish" / "Save changes" / "View post ->"; server says published=true; the URL moved to /editor/<id> |
| Save changes: post still published | PASS | PASS | after Save changes the same three buttons, "Publish" and "Save draft" absent; server published=true and holds the edit; after a reload still "Unpublish / Save changes" |
| First publish of a grid post (profile "+ New grid post", draw, Publish, Save changes) | PASS | PASS | `gate-editor-grid/grid-published-*.png`; same published state, server published=true both times |
| Every grid tool used on the canvas (Paint pixels, Line, Rectangle, Ellipse, Paint tiles, Fill whole tiles, Magic fill, Erase, Text, Select tiles, Lasso, Magic wand, Move, Eyedropper) | PASS | PASS | `gate-editor-grid/grid-after-tools-page-desktop.png`; each tool changed the canvas where expected (Eyedropper changes nothing, as it should); identical pixel counts at both sizes |
| Only the save row sticky on a phone / with a grid open | PASS | PASS | phone, no grid: `.pe-panel` scrolls away, `.toolbar-actions` sticks at top 88px (`scrolled-sticky-phone.png`). Grid open: `.toolbar-stack` is `display: contents`, only `.toolbar-actions` sticks (desktop and phone). Desktop without a grid still pins the whole tool stack, 265px (by design, Editor.css:52) |
| Toolbar strip takes the theme on a dark post theme | PASS | PASS | Neon post: strip and save row are navy with the theme's mint; tool panel stays the near-black grid panel |
| Math uses an in-page field | PASS | PASS | `math-dialog-desktop.png`: opaque light card, input, live preview, Insert / Cancel; no native dialog |
| Code-block label ("Custom...") uses an in-page field | PASS | PASS | hover bar, "Custom..." shows `input.code-ctrl-input`, label becomes "Shell"; `code-label-field-phone.png` |
| "Save as font" uses an in-page field | PASS | PASS | after drawing a glyph the button enables and shows `input.tilegrid-name` (Name this font / Save / Cancel); `save-as-font-field-phone.png`. Not saved |
| No hint lines under "Goes in" | PASS | PASS | row text is only "Goes in / Post / Note / Subscribers"; no hint element; the next sibling is the tool stack |
| Selected "Goes in" pill clearly selected | PASS | PASS | selected: mint fill (182,255,207) with dark text; unselected: transparent with mint text. Clear in `goes-in-note-desktop.png` |
| Button block fields readable | PASS | PASS | `button-block-desktop.png`: near-black fields (28,28,28), text (242,242,242), 13px, app font, visible labels and pills |
| Fonts of ten controls | PASS | PASS | pills, Save draft, Publish, section heads, URL button, description, selects, tile buttons, nav button all use the app font (system-ui). Only `.title-input` uses the post's own font (Orbitron), correct |
| Autosave Restore / Discard | **FAIL** | **FAIL** | offer appears after reload ("Unsaved changes from ... were found. Restore / Discard"), Discard clears it and it does not come back. But Restore brings back only the first letters of the title (see finding 1) |
| No blur anywhere | PASS | PASS | computed-style scan found none (editor, grid, glyph editor, theme dialog, Math); modals use an opaque card on a plain dim |

## Findings

1. **FAIL, Restore loses most of the title.** Typed "Gate editor probe title" then the body; the device draft in localStorage (`draft:post:new`) holds `"title":"Ga"`. After Restore the title is "G" (`gate-editor-draft/draft-restored-desktop.png`). Cause: `fieldsRef.current` is rebuilt only while the editor renders, and typing in the title does not re-render, so `getFields()` returns the title as it was at the last render. Source: `client/src/components/Pages/Posts/PostRenderer/RichTextPost/Editor.jsx` lines 2289-2291 (`fieldsRef.current = { title: titlehtml.current, ... }` and `getFields`). Fix: have `getFields` return `{ ...fieldsRef.current, title: titlehtml.current }`. The body, Button block and section are restored correctly.
2. Save row is tall on a phone once a post is published (or after a draft save): status text, "Unpublish", "Save changes" and "View post" wrap onto two rows, so the sticky bar is about 100px of 844 (`gate-editor-grid` "grid open, scrolled" note: actions h=100; `publish-phone-frames/sheet.png`). Before the first save it is one row, 53px. On desktop "View post ->" wraps under the buttons (`after-publish-card-desktop.png`). Not broken, but it eats the phone screen; shorter status text or hiding "View post" while sticky would fix it. File: Editor.jsx `SaveToolbarPlugin` (~1778-1806), `.toolbar-actions` in Editor.css:1333.
3. After the first Publish, editing again shows "Not saved yet" next to a stale "Published." in the save row (desktop frame sheet, row 3). Contradictory for a second.
4. Phone: a long post title in the editor is clipped on one line ("GATE EDITOR TE", `publish-phone-frames/sheet.png`) instead of wrapping or shrinking.
5. The Theme dialog still carries a one-sentence explanatory paragraph under its heading ("This post keeps its own theme...", `theme-dialog-phone.png`). Design rule: no explanatory paragraphs.
6. Browser "Leave site?" prompt appears when reloading with unsaved typing (native, expected; noted because the test had to accept it).

Not tested: a light-themed post (only Neon, test2's theme), publishing a Note or Subscribers post, the grid's "Focus" mode.

## Favour for the coordinator (comments on vt4's post)
Not done. The request to leave two comments as test2 on vt4's "Gate notif target" post was refused by the permission check when I started on it, so I did not post anything and did not look for another way. Someone with permission needs to do it (or tell me to).

## Three things most worth the owner's attention
1. Draft Restore keeps only the first character(s) of the title (finding 1, one-line fix in Editor.jsx).
2. The published-state fix works: Publish then Save changes keeps the editor published, for text and grid posts, at both sizes.
3. On a phone the sticky save row becomes about 100px tall after a save (finding 2).

Area ready for Mae: no (Restore title loss; the rest passes)
