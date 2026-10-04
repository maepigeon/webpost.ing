# implementer-payloads-wp5-profile-summary (Sonnet, `implementer`)

Build the profile half of **WP-5** in `guide/design-list-payloads.md`
(section 6, "Profile summary", and the WP-5 entry in section 10), plus the
profile count fix the profile worker handed back. WP-1 to WP-4 are committed.
The admin half (the "Card previews" line in `AdminPanel`) belongs to
`implementer-design-h`, running now: do not touch `AdminPanel.*`.

## Your files (only these)
- new `posts/controller/ProfileSummaryController.java`, new
  `ProfileSummaryTest.java`;
- `posts/repository/JdbcPostRepository.java` (only `countSections` and its
  Javadoc, lines about 148–162) and `PostSectionTest.java`;
- `client/src/components/Pages/Posts/PostsViewer/PostsViewer.jsx`,
  `profileTabs.js` and its test, in the same folder;
- `client/src/components/Pages/Posts/BasicTextPostServerApi.js`: add
  `GET_PROFILE_SUMMARY`, and also `ADMIN_PREVIEW_STATUS`
  (`/api/admin/previews`) and `ADMIN_PREVIEW_RUN` (`/api/admin/previews/run`)
  so the admin worker's insertion is already there.

Read `PostsViewer.jsx` in full before editing and keep every `useState` name.
It was changed an hour ago (committed): the header's public post count now
comes from `publicPostCount(counts, banner.publicPosts)` in `profileTabs.js`,
and a single tab draws no bar.

## 1. Profile summary
As section 6 designs it: one request replaces the several the profile makes on
load; the pinned post comes back as a card (preview, no body). Same visibility
as the calls it replaces: test that a visitor gets `pinnedPost: null` for a
pinned draft, that a blocked viewer gets what the old calls gave them, and
that an unknown username is a 404 (today an unknown username shows an empty
profile: the page must say the profile does not exist, in one plain line).
Not `/api/users/{u}/pinned-post`: leave that route working, just stop calling
it from `PostsViewer`.

## 2. Counts agree (lead decision)
- `countSections`: `profile` and `notes` count **published** posts only, for
  the owner as for anyone; drop the two `owner` arguments; update the Javadoc.
  `drafts` and `subscribers` stay as they are. Update
  `PostSectionTest.countsDifferForTheOwnerAndAVisitor` (owner's `profile` 1,
  `notes` 1).
- The header's "N public posts" is the same number as the Posts tab for the
  same viewer (the client already takes it from the tab counts).
- **Drafts live in Drafts.** In the normal view the owner's Posts and Notes
  lists show published posts only, so the list length equals the tab count;
  an unpublished post appears under Drafts. The **arrange view keeps showing
  everything** (it needs drafts for Make public / private and for order), each
  draft with its DRAFT badge. Do this as a filter at render time in
  `PostsViewer.jsx`, not by changing what is loaded, so arranging and saving
  order keep working. Test both views.

## Must hold
- Who can see what does not change. No list or summary response carries a
  post body.
- Paging of the list still works after the filter (a page that is all drafts
  must not leave the owner looking at an empty Posts tab with more to load:
  keep loading until the page has something to show or the list ends, and
  test it).

## Checks
Server: `ProfileSummaryTest`, `PostSectionTest`, `ProfilePagingTest`,
`PostControllerTest`. Client: `npx vitest run`. Workers share one test
database: a strange failure in a class you did not touch is probably another
run colliding; rerun once, then report. If the module does not compile because
of the SSO worker's half-finished files, wait two minutes and retry.

## Report
What works, files, test counts, insertions for files not yours, the number of
requests a profile makes on load before and after (count them in the code),
and what a checker must open.

No commit, no `vite build`, no servers, no migration.
