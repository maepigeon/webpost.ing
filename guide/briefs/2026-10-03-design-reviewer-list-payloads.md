# 2026-10-03-design-reviewer-list-payloads  (design-reviewer, Fable)
**Design task.** Read `guide/performance-review-2026-10-03.md` items 3, 6, 8, 9 (WP-F, WP-G, WP-H) and the code they cite. The site's list endpoints (profile, Following, Discover, crawler profile page) send every post's full body (`posts.description`, Lexical JSON, up to 5 MB) when the cards only need a title, the description line and the first tile grid; every save runs about 35 queries, mostly the storage-quota check; search does `ILIKE` over all bodies; a profile view makes about 14 requests. One 2 GB server, one maintainer.
Write `guide/design-list-payloads.md`: the design for fixing these safely, as a plan Sonnet implementers can build without further questions:
- the data model (the review proposes `card_preview` and `search_text` columns filled at save, with a backfill; decide whether that is right, what exactly goes in each, how they stay correct when a post is edited, autosaved, or its "Grid on card" switch changes, and what happens for posts not yet backfilled);
- the exact response shapes so the React cards (`BasicTextPost.jsx`, `gridPost.js`, `FollowingPage.jsx`, `DiscoverPage.jsx`, `ProfilePostList.jsx`: read them) keep working, and which client files must change, if any;
- the quota check: how to make a save cost a handful of queries without letting usage drift (cache, single query, or incremental accounting; pick one and say how it is verified against the truth);
- search: the interim and the proper version;
- the profile-summary endpoint: one response for what the profile page needs first;
- the migration (number V020; must be safe to run twice and cheap on a live database) and the backfill (batch size, when it runs, how an admin triggers and watches it, what happens if the server restarts mid-way);
- failure modes and how each is tested; rollout order so each step is shippable alone;
- **work packages** with disjoint file lists for parallel implementers, and the order they must land in.
Be decisive and brief: this document is the brief for the next batch.
