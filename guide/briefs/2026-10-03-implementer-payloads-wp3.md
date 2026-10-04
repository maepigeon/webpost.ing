# implementer-payloads-wp3 (Sonnet, `implementer`)

Build **WP-3** of `guide/design-list-payloads.md` (section 8: feeds, Discover,
SEO, hashtags) exactly as designed, on top of WP-1, which is committed.

## What WP-1 gives you (committed, do not edit)
`posts/service/PostPreview.java`:
```java
public static final int VERSION = 1;
public static Object previewValue(String storedPreview, String bodyFallback); // RawValue or null, for Map items
public static String previewJson(String storedPreview, String bodyFallback);  // same, as a String
```
Columns `posts.card_preview`, `posts.search_text`, `posts.preview_version`
(V020). A row below `VERSION` has not been computed yet: fall back to the body
for that row, as section 8 shows. Map items may carry an explicit
`"preview": null`; they never carry `description`.

## Your files
The ones section 8 names (`FeedController`, `SocialRepository`,
`SeoController`, the search query, and their tests). Read the section's file
list and keep to it. **Not** `PostController`, `JdbcPostRepository`,
`PostPreview`, `PreviewSweep`, `AuthController`, `JdbcLoginRepository`,
`LoginRepository`, `pom.xml`, any `Sso*` file or any migration: the SSO worker
is editing some of those right now.

## Must hold
- Who can see what does not change: every `WHERE` that hides drafts, blocked
  authors or private things stays as it is. `search_text` exists for drafts
  too, so the search query keeps its `published` filter. Add a test that a
  draft's words are not findable by another user.
- No list response carries a post body.
- The client's cards already read `preview` (WP-4): check `cardGridOf` in
  `client/src` to confirm the shape you send is the shape it reads; do not
  edit client files, report a mismatch instead.

## Checks
Run only your own test classes plus `FeedController`/Discover/SEO tests that
exist. Workers share one test database and one `target/`: a strange failure in
a class you did not touch is probably another run colliding; rerun once, then
report it. If the module does not compile because of SSO's half-finished
files, wait two minutes and retry (three tries), then report.

## Report
What works, files, test counts, insertions for files not yours, what needs a
running server to confirm (response sizes before and after for the Following
feed and Discover).

No commit, no `vite build`, no servers.
