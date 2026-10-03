# integrator-batch-b (Sonnet, `integrator`)

Apply the insertions the evening wave's workers left for files they could not
touch. Every worker named here has finished and is committed, so these files
are free. **Still being edited by others, do not touch:** `PostsViewer.jsx`,
`profileTabs.js`, `BasicTextPostServerApi.js`, `JdbcPostRepository.java`,
`PostSectionTest.java`, `ProfileSummary*` (profile summary worker), and
`pom.xml`, `AuthController`, `JdbcLoginRepository`, `LoginRepository`,
`DatabaseSchemaTest`, `Sso*`, `Login.*`, `Registration.*`, `SettingsPage.*`,
`SecuritySection.*` (sign-in worker). Do not run the full server suite; run
the classes named.

## Client
1. `Viewer.jsx` about line 484: the Discussion `<Link>` gets
   `className="viewer-discussion-link"`; add `.viewer-discussion-link` to the
   list in the app-font rule in `components/PageTheme/themes.css` (the rule
   that starts `#appBody .th-scope :is(`).
2. `App.css` about 134–168: add `:not(.pb)` to the "neo" button rule's skip
   lists, so the rule stops repainting a post's solid and outline Button
   blocks. Check `ButtonNode.css` still gives all three looks their own
   colours afterwards.
3. `animator/animator.css`: the blue `#5ea0ff` focus ring becomes
   `outline: none; box-shadow: var(--focus-ring)`.
4. `components/Social/Social.css`, append (phone overflow of the discussion
   header):
   ```css
   .discussion-page-header { flex-wrap: wrap; row-gap: 8px; }
   .discussion-page-header > div { flex: 1 1 160px; min-width: 0; }
   .discussion-post-subtitle { overflow-wrap: anywhere; }
   .discussion-style-badge { margin-left: auto; }
   ```
5. `components/Pages/Auth/AdminPanel/SettingsTab.jsx`: import `errorMessage`
   from `utils/errorMessage.js`; both catch blocks (`toggle`, `saveLimit`)
   flash `errorMessage(e, 'Could not save that setting.')`.
6. Badge refresh: in `components/Social/InboxPage.jsx`, `markAll`, `markOne`
   and clear dispatch `window.dispatchEvent(new Event('wp:counts-changed'))`;
   the actor link inside a row also marks that row read (as the post link
   does); `useUnreadCounts.js` listens for the event and refreshes. Test it.
7. `themes.css`: delete the rules that are now dead: about 248–257 (the 999px
   Edit/Delete pill) and about 397 (`.editor-post-card .toolbar-sticky` with
   the undefined `--th-card-bg`). Check with grep that nothing else relies on
   them. `styles/touch.css` line 17 likewise if it is the same pill.
8. `Editor.jsx`: Mae dislikes explanatory notes under controls ("i dont like
   these kinds ofn notes Description Goes in. they are bad design"). The Note
   and Subscribers hints under the "Goes in" pills are still visible text:
   move each into its pill's `title` (hover), as was done for Post, and drop
   the visible line. Replace the audio-upload `alert()` calls with the app's
   dialog (`Dialog` `alert`, as the rest of the editor uses). Update tests.

## Server
9. Replies notify the person replied to. Today replying to a comment tells
   only the post owner. In `DiscussionController.addComment`, after the owner
   notification, add a `reply` notification for the parent comment's author
   (`social.createNotification(parentAuthorId, "reply", username, postId,
   commentId)`), skipping it when that person is the replier, is the post
   owner (already told), or was @mentioned in the same comment (already
   told): nobody gets two notifications for one comment. Respect blocks the
   way the comment notification does. Tests for each skip. Run your new tests,
   `NotificationSubjectTest`, `SocialControllerTest` and the discussion tests.

## Checks and report
`npx vitest run` in `client/` (all); the server classes above. Report per item:
done / not done and why, files, test counts. No commit, no `vite build`, no
server start.
