# implementer-design-d-profile (Sonnet, `implementer`)

Profile page fixes from the two reviews. Read first: `guide/DESIGN-RULES.md`,
findings **F6, F7, F9, F10, F12 (popovers), F21** in
`guide/design-audit-2026-10-03.md`, and the profile rows of the "Font audit"
table plus "Profile counts disagree" in
`guide/ui-review-2026-10-03-new-features.md`.

## Your files (only these)
`PostsViewer.jsx`, `ProfileEditor.css`, `ProfilePostList.*`,
`ProfileArrange.*`, `ProfileTabs.*`, `BannerEditor.jsx`, `BasicTextPost.jsx`,
`Dialog/Dialog.jsx` (under `client/src`), and their existing tests.

## Fix
1. **One button look on the profile.** Today five shapes sit on one screen
   (table in the UI review). Make the owner pills, Follow / Send message /
   Block DMs / Mutuals, Edit bio Save / Cancel, the folder button, the arrange
   view's buttons and the card's Edit / Delete share one size, weight, height
   and radius: use the existing `.profile-owner-btn` look (system font 13px
   600, 32px tall, 6px radius) as the one to match. "Send message"
   (`PostsViewer.jsx:584`) is an unclassed button: give it the class. A primary
   action (Follow) may be the filled variant; nothing else differs.
   `ProfileEditor.css:329,333` set a font the audit flags: remove.
2. **Phone (390px):** the owner pills sit in tidy rows, text never breaks
   inside a pill, each is at least 36px tall. Keep every pill (Mae has not
   chosen which to drop).
3. **A tab bar with one tab is not shown** (a visitor who can only see Posts
   sees the list with no bar). Keep the Subscribers tab for the owner: Mae
   asked for it.
4. **The header does not jump** (F10): top-align the profile column so the
   header is the same distance from the top whether the list is short or long.
5. **Folder popover and other profile popovers take the theme** (F12): no
   hard-coded white on a dark theme.
6. **Delete confirm says "Delete"**, not "Continue" (`BasicTextPost.jsx:36`,
   pass `confirmLabel`). If `Dialog.jsx` has no such prop, add it with
   "Continue" as the default.
7. **Counts agree.** The header's "N public posts" and the Posts tab count
   must be the same number for the same viewer, and the Posts tab does not
   include drafts (Drafts has its own tab). Find where each number comes from
   and say in your report which was wrong.

## Leave alone (Mae decides)
The storage breakdown on the profile card (F13), which pills a phone keeps
(F7), the banner on a phone (F4). Do not move or remove them.

## Not yours
`themes.css`, `index.css`, `App.css`, `StorageSummary.*`, `ProfileBanner.*`:
report insertions.

## Checks
`npx vitest run` for profile tests; `npx eslint` on your files. You cannot see
the result: list what a checker should open, at 1300px and 390px, as owner and
as visitor.

No commit, no `vite build`, no servers.
