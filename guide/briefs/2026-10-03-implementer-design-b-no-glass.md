# implementer-design-b-no-glass (Sonnet, `implementer`)

Mae's rule: **no glass panels, no blur**. Remove every `backdrop-filter` and
frosted fill from the interface and make those surfaces solid. Read first:
`guide/DESIGN-RULES.md`, finding **F3** in `guide/design-audit-2026-10-03.md`
(it lists file and line), and **Broken 3** in
`guide/ui-review-2026-10-03-new-features.md`.

## Your files (only these)
`Dialog.css`, `AvatarPopup.css`, `FollowListModal.css`, `ReportDialog.css`,
`Social.css`, `MessagesPage.css`, `ImagePicker.css`, `ImageCropDialog.css`,
`Packs.css`, `SharePackDialog.jsx`, `PostWindow.css`, `App.css`, `Viewer.css`,
`Title.css`, `SearchPage.css`, `Logout.css`, `AppErrorBoundary.css`,
`tokens.css`, `guide/style-guide.md` (find the CSS under `client/src`).

## What must be true after
1. `grep -rn "backdrop-filter" client/src` finds nothing in your files. Report
   any hit left in files that are not yours.
2. A dialog dims the page with a plain translucent black scrim (no blur) and
   its card is an opaque surface from the existing grey tokens. Popovers and
   menus are opaque too. Keep borders, radius and shadow as they are: this is a
   fill change, not a redesign. Nothing changes size or position.
3. `tokens.css` and `guide/style-guide.md` no longer prescribe glass; the style
   guide says solid surfaces, in two or three plain sentences.
4. `App.css` 134–153 (the "neo" button rule, which also blurs) no longer beats
   a selected state: `.is-on` on the editor's "Goes in" pills and the Button
   block pills must show clearly as selected on every theme. Lower the
   specificity of the general rule rather than adding `!important`.
5. `App.css` near line 114 still names `.cursor-glow`; the component was
   removed. Delete the dead rule.

## Not yours
`index.css`, `themes.css`, `Editor.css`, `ProfileEditor.css`, `AdminPanel.css`,
`ActivityPage.css`, `InboxPage` styles: other workers have them now. Report
insertions for them instead of editing.

## Checks
`npx vitest run` in `client/` (whole client suite is fine, it is quick; note
that other workers are editing, so a failure outside your files is theirs:
name it and move on). You cannot see the result: list the screens a checker
should open (a confirm dialog, avatar popup, followers list, share menu,
search, messages, image picker, crop dialog).

No commit, no `vite build`, no servers.
