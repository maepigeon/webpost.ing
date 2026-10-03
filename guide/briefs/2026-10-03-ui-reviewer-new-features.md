# 2026-10-03-ui-reviewer-new-features  (ui-reviewer, Sonnet)
Review the LOCAL build only: http://localhost:5175 (API on 8081, database testdb; accounts test/test admin, test2/test2, test3/test3). Do not start, stop or rebuild anything; if it is down, stop and say so. Other workers are editing source at the same time; you only test the built site. Restore anything you change on existing posts or themes.
Test at 1300px and at 390px (touch), on the default theme and on a dark profile theme (set through Customize or `PUT /api/users/test/theme`, then restore):
1. Profile tabs (Posts/Notes/Drafts/Subscribers): look, counts, empty panels, `?tab=` on reload, keyboard arrows, visitor view.
2. Post editor: theme matches the published post; Description; "Goes in"; autosave status and the Restore/Discard bar (and that it does NOT appear on an untouched saved post); Button block (web page, own post, audio); grid tools (Link tool, Magic fill, Lasso, Flatten text, Focus view, typed size, Symbols font).
3. Post page: a post's own theme and wallpaper end to end (set a theme on a post in the editor's Page → Theme, publish, view signed out); buttons; audio mini player across navigation and Close.
4. Discover (Posts, People), @mentions in comments (suggestions, link, notification opens the comment).
5. Settings: Security (devices, recent activity), Password (wrong current password message only), App, Delete account (do NOT delete), Email notes.
6. Top bar: account menu, More, unread dot, keyboard.
7. Admin (as test): build box, Settings tab shows and saves the sign-up switches (set them back); as test2: access denied.
8. Customize: all presets and fonts including Sand, Oak, the restyled Neon Terminal and Sticky Pad, the Links colour.
9. Contrast on a dark theme across profile, post, discussion, editor.
Write the report to `guide/ui-review-2026-10-03-new-features.md`: Broken / Confusing / Cosmetic, each with where, steps, what happened, what should happen, screenshot path, likely source file. Then "Tested and fine". Final reply: the Broken and Confusing findings, compact.
