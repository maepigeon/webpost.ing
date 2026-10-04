# implementer-gate-fix-accounts-admin (Sonnet, `implementer`)

Fix what the visual gate failed in the accounts and admin area. Read first:
`guide/visual-gate-2026-10-03-accounts-admin.md` (the failures, with evidence
paths) and `guide/DESIGN-RULES.md`. Keep each change as small as it can be:
these go on top of a frozen deploy candidate.

## Your files (only these)
`client/src/components/Pages/Auth/Login/Login.css`,
`client/src/index.css`,
`client/src/components/Pages/Settings/SettingsPage.css`,
`client/src/components/Pages/Settings/DeleteAccount.jsx` and its CSS if it has one,
`client/src/components/Pages/Auth/AdminPanel/AdminPanel.css`, `AdminPanel.jsx`,
`PreviewLine.jsx`, the Limits and Users tab files in that folder,
the forgot-password page (`ForgotPasswordPage.jsx` and its CSS),
`client/src/utils/session.js`, and tests for them.

## Fix
1. Provider buttons ("Continue with Google / Microsoft") are 48px, the main
   button 46px: make them exactly the main button's height at both widths
   (`.login-sso-btn`, about `Login.css:296`: padding plus border).
2. Keyboard focus on a Settings section heading (`summary`) draws the
   browser's blue ring: `index.css` gives `summary:focus-visible`, and any
   other focusable that is not a button (`a`, `[tabindex]`, `[role=tab]`,
   `[role=button]`), the same grey ring as buttons, and no ring after a mouse
   click. Inputs keep their own focus style.
3. The Settings "i" info button is in Georgia italic: app font, same glyph
   size as its neighbours (`SettingsPage.css` about 373).
4. The disabled "Delete my account" button is nearly invisible: it must read
   as a disabled button (visible outline and muted label, contrast at least
   3:1 against its background).
5. Admin, Stats and Limits: "Card previews: …", "Orphaned uploads …" and the
   Limits hint are bare text on the page wallpaper. Every line of text in the
   admin panel sits on the panel's card surface, like the rows around it.
6. Admin at 390px: the Limits tab's Save buttons are clipped to "Sa" and the
   Users table is cut off on the right. Nothing in the admin panel may be cut
   off or unreachable at 390px: each Limits row wraps so its field and Save
   button are whole; the Users table becomes stacked rows (or scrolls sideways
   inside its own card with a visible edge), your choice of the simpler one.
   The Users role dropdown is the browser's own: leave it for now, say so.
7. Forgot-password page has a two-line explanatory paragraph: one short plain
   line at most (what will happen when they press the button).
8. `utils/session.js`, last line of `clearLocalSession()`:
   `window.dispatchEvent(new Event('wp:session-cleared'));` (the top bar
   already listens). Guard for environments without `window`.

## Checks
`npx vitest run` in `client/`; eslint on your JS files. No commit, no
`vite build`, no servers. Report per item, files, test counts, and what a
checker must look at.
