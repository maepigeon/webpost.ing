# implementer-notifications-subject (Sonnet, `implementer`) — server half

Mae: "notifications should always have links to what theyre talking about
otherwise they are useless. someone commented on my post: great, what did they
command and on what post. this should be shown in my notifications".

The client half (`InboxPage.jsx`) belongs to `implementer-design-h`, who has
been given the contract below. You build the server half so that every
notification carries what the client needs to name and link its subject.

## Your files (only these)
`posts/repository/SocialRepository.java` (the Notifications section only:
the inserts near 339–378, `getNotifications`, `NOTIF_MAPPER`),
`posts/model/Notification.java`, `posts/controller/SocialController.java` only
if a creation call has to pass an id it does not pass today, and tests (a new
`NotificationSubjectTest` against the real test database; extend existing
ones where they already cover this). No migration unless you find a column is
truly missing: if so, stop and report, do not write one (V021 is taken).

## The contract (field names the client will read)
Each item from the notifications list keeps what it has (`type`,
`actorUsername`, `postId`, `postOwner`, `postTitle`, `commentId`, `message`,
read state, time) and gains:

| Field | Meaning |
|---|---|
| `commentExcerpt` | For `comment`, `reply`, `mention`: the comment's own text, plain, whitespace collapsed, at most 160 characters, cut on a character boundary with `…` when cut. `null` when the comment no longer exists. |
| `subjectGone` | `true` when the post (or, for comment types, the comment) the notification is about no longer exists or is no longer visible to the recipient; else `false`. |
| `reaction` | For `reaction`: which reaction it was, if the table stores it; else omit. |

Rules:
- Every notification written for a comment, reply or mention stores both
  `post_id` and `comment_id`; every reaction and new-post notification stores
  `post_id`. Read each creation site and fix any that drops an id. Say in your
  report which did.
- `postTitle` is the post's current title; an empty title stays empty (the
  client words it).
- **Who can see what does not change.** An excerpt is only ever the text of a
  comment on a post the recipient can open. If the post has since become a
  draft and the recipient is not its owner, or the comment's author has
  blocked the recipient or been blocked, send `subjectGone: true`, no excerpt
  and no title. Test each of these.
- One query for the page of notifications, no query per row. The page is 20 to
  50 rows; the joins must use existing indexes (say which).
- Old rows without a `comment_id` simply have a null excerpt.

## Checks
Your new test class and `SocialControllerTest`, `SocialFollowsMessagesTest`.
Workers share one test database: a strange failure in a class you did not
touch is probably another run colliding; rerun once, then report. If the
module does not compile because of the SSO worker's half-finished files, wait
two minutes and retry (three tries).

## Report
What each notification type now carries, files, test counts, creation sites
you fixed, anything the client must know that differs from the table above.

No commit, no `vite build`, no servers, no migration.
