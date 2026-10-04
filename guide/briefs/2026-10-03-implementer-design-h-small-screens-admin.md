# implementer-design-h-small-screens-admin (Sonnet, `implementer`)

Notifications, Activity, mini player, scroll-to-top, discussion header and the
admin panel. Read first: `guide/DESIGN-RULES.md`, findings **F17, F19, F20,
F22** in `guide/design-audit-2026-10-03.md`, **Broken 4** and the Admin,
Notifications and phone items under "Confusing" in
`guide/ui-review-2026-10-03-new-features.md`, and the section on **WP-5** in
`guide/design-list-payloads.md` (only its admin status line; the profile
summary is someone else's).

## Your files (only these)
`InboxPage.jsx` and its CSS, `ActivityPage.*`, `MiniPlayer.*`,
`ScrollToTop.*`, `AdminPanel.*`, `DiscoverPage.css`, the discussion page's CSS
file (not its JSX), and their existing tests.

## Fix
1. "commented on your post your post" (`InboxPage.jsx:39`, fallbacks at 23 and
   31): the sentence reads correctly with and without a post title.
2. The Notifications badge clears when the mention it counts has been opened.
   If the cause is in `useUnreadCounts.js` or the server, report the insertion
   rather than editing.
3. Phone (390px): the Notifications title is not cut off; the discussion
   header does not overflow sideways (445px today); Admin fields stay inside
   the card.
4. Scroll-to-top never sits on top of "+ New grid post" or the editor's tiles:
   move it clear of them, and hide it on the editor.
5. Activity tabs read "Posts", "Comments"… with the count shown the way the
   profile tabs show theirs (`ProfileTabs`), not "Posts (4)".
6. The mini player looks like the in-post audio player (dark, pixel controls,
   the same progress bar), not a white box with a browser range slider. Reuse
   the in-post player's styles; do not edit `AudioNode.css`.
7. **Admin:** the selected tab is readable (`AdminPanel.css:53`, white on pale
   grey today). The sign-up settings that are true/false are switches (the
   switch control Settings already uses), not text boxes; a number stays a
   number field. A failed save shows the server's message. The admin-set
   password field accepts up to 128 characters (32 today). The Security
   activity list does not cut a row in half.
8. **Admin: card previews line** (WP-5): one quiet line, "Card previews: N
   left" with a "Run now" button, from `GET /api/admin/previews` and
   `POST /api/admin/previews/run` (`PreviewAdminController`). When nothing is
   left it reads "Card previews: up to date" and has no button. No paragraph
   of explanation.

## Not yours
`index.css`, `themes.css`, `App.css`, `Social.css`, `MessagesPage.css`,
`SettingsPage.*`, `AudioNode.css`: report insertions.

## Checks
`npx vitest run` for these pages; `npx eslint` on your files. You cannot see
the result: list what a checker should open.

No commit, no `vite build`, no servers.
