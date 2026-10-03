# implementer-design-a-font-focus (Sonnet, `implementer`)

Fix the font regression and the coloured focus ring. Read first:
`guide/DESIGN-RULES.md`, then findings **F1, F2** in
`guide/design-audit-2026-10-03.md` (exact selectors are there) and the "Font
audit" section plus **Broken 1 and 5** in
`guide/ui-review-2026-10-03-new-features.md`.

## Your files (only these)
`client/src/index.css`, `client/src/components/PageTheme/themes.css`,
`client/src/styles/touch.css`, `GridUI.css`, `AudioNode.css`,
`ButtonNode.css`, `ProfileStickies.css` (find them under `client/src`).

## What must be true after
1. **One interface font.** A page theme's font styles the *content* (post
   title, post body, bio text, profile name), never the interface. Every
   button, input, select, textarea, tab, pill, menu, popover, status line and
   bar inside `.th-scope` is in `var(--app-font)`. Do it with one rule in
   `themes.css` that returns controls inside `.th-scope` to the app font,
   written so that content which is *meant* to take the theme font still does:
   the editor's writing surface, a post's Button block label, comment text.
   List in your report every selector you exempted and why.
2. `button:focus` from the Vite starter is gone. Keyboard focus shows the
   house grey ring (`button:focus-visible { outline: none; box-shadow:
   var(--focus-ring) }`); a mouse click shows no ring. Replace the blue
   `#5ea0ff` / `#1a73e8` rings in your files with the same grey token.
3. Typed text in `.pb-input` fields (Button block Label and Web address, grid
   Link-tool field) is readable on every theme: `themes.css` around 304–316
   overrides their colours. Inputs that sit on an interface surface use
   interface colours, not theme ink.
4. A pixel-style Button block is legible on a light card and on a dark card
   (`ButtonNode.css` 50–59): take the ink from the theme variables that are
   already contrast-checked (`--th-ink`, `--th-card-solid`), no fixed colours.

## Not yours
`App.css`, `Editor.css`, `ProfileEditor.css`, `SettingsPage.css` belong to
other workers running now. If F1 needs a line in one of them
(`ProfileEditor.css:329,333`, `SettingsPage.css:373`, `Editor.css:237–244`),
put the exact line in your report as an insertion.

## Checks
`npx vitest run` in `client/` for anything that tests these files; `npx eslint`
is not needed for CSS. You cannot see the result (no build, no server): say so,
and list the six screens a checker should open to confirm it.

No commit, no `vite build`, no servers.
