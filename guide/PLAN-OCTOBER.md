# October plan: a strong product with real users by November

Written 2026-10-03. One line per day: what the workers build, and what only
Mae can do ("You:"). The order is deliberate: make it safe, make it reachable,
make it worth arriving at, then invite people in small groups and fix what
they hit. webpaint.ing runs alongside but is not what November depends on.
Update this file as days slip or finish.

## Week 1 — safe and solid (Oct 4–10)
| Day | Workers | You |
|---|---|---|
| Sun 4 | Finish the current batch (previews V020, SSO code, backups, menu); full tests; design guardian + visual tester on every changed screen; fix findings | Deploy; click through profile, editor, Settings on desktop and phone |
| Mon 5 | Fix what your testing and the reviews found; sessions stored in the database (no sign-out on deploy) | On the server: memory limit + swap + nginx block (DEPLOYMENT.md §9). Turn on DigitalOcean alerts |
| Tue 6 | Mail work: job queue so mail survives restarts; reset/confirm emails checked end to end | Create Brevo account, add its DNS records at GoDaddy, run `enable-mail.sh` |
| Wed 7 | Maintenance page; site survives a restart mid-use; migration lock; prune old release backups | Download a first backup with the app; run the restore test once |
| Thu 8 | Phone pass: editor tools on small screens, install-as-app, audio player, More menu | Test on your phone; install to home screen |
| Fri 9 | Fix phone findings; smoke suite green; performance check against the review's numbers | Deploy |
| Sat 10 | Buffer day: leftovers only | Write 3 posts you are proud of (grid, text, mixed) |

## Week 2 — ready for strangers (Oct 11–17)
| Day | Workers | You |
|---|---|---|
| Sun 11 | First-visit experience: what a signed-out visitor and a brand-new account see (empty profile, first post prompt, Discover with content) | Register the Google and Microsoft sign-in apps; get a Turnstile key |
| Mon 12 | SSO finished and tested with your keys on the local copy; "Set a password"; "this wasn't me" lock | Add the keys to deploy.env |
| Tue 13 | Moderation basics: report a comment or user, block a user, admin freeze/restore, admin view of reports on phone | Decide house rules: write a short "what's welcome here" page |
| Wed 14 | Home page: two or three designs as screenshots for you to choose, then build the one you pick | Choose the home page |
| Thu 15 | Sharing outward: link previews verified in real apps, crawler pages live (nginx), profile feeds | Apply the crawler nginx snippet; share one post link somewhere and look at the preview |
| Fri 16 | Sign-up switches rehearsed locally: confirmed email required, bot check on, invite code optional | Deploy. Turn on "confirmed email" and the bot check; keep invites required |
| Sat 17 | Fixes; smoke + visual suites green | Invite 5 people you trust with invite codes; ask each to make a profile and one post |

## Week 3 — learn from the first people (Oct 18–24)
| Day | Workers | You |
|---|---|---|
| Sun 18 | Watch errors and the security log; fix what the five hit first | Talk to each tester: what confused them, what they wanted |
| Mon 19 | Top three confusions fixed; onboarding hints where they got stuck | Deploy |
| Tue 20 | Following/Discover polish: who to follow, what's new since last visit, notification digest email | Post something new; reply to testers' posts |
| Wed 21 | Artist features testers asked for (expect: image galleries in posts, grid templates, sticker packs sharing) | Pick which requests matter |
| Thu 22 | Performance under real use: slow queries, page weight, uploads; fix the worst two | — |
| Fri 23 | Backup + restore drill; security re-audit of everything added since Oct 3 | Deploy. Download a backup |
| Sat 24 | webpaint.ing phase 0/1 demo polished enough to show (single-user drawing, save, export) | Try webpaint locally; connect its domain if the page is on the droplet |

## Week 4 — open the door a little (Oct 25–31)
| Day | Workers | You |
|---|---|---|
| Sun 25 | "About" and "what's welcome here" pages; sign-up page copy; a starter set of example profiles and posts | Choose ONE community to invite first (pixel artists, a Discord, friends-of-friends) |
| Mon 26 | Invite flow: shareable invite links with a limit each, "invited by" shown to you in admin | Send 20–30 invites to that community |
| Tue 27 | Daily fix cycle from real reports; rate limits tuned to real use | Be present: welcome people, follow them, react |
| Wed 28 | Daily fix cycle; a "new here" highlight on Discover | Post a how-to grid post |
| Thu 29 | Daily fix cycle; phone issues first | — |
| Fri 30 | Stability day: no new features; suites green; backup; deploy | Deploy. Decide whether to drop the invite requirement |
| Sat 31 | If the week was calm: open sign-ups with confirmed email + bot check; otherwise another invite round | Flip the switch (or send 30 more invites) |

## Sun Nov 1 — review
Numbers to look at together: accounts created, people who posted at least
once, people who came back in week 2, errors per day, server memory and disk,
backup age. Then plan November: subscribers, webpaint.ing phase 1 on its
domain, and whatever the first users asked for most.

## What decides whether there are users in November
Not the feature count. It is: a first visit that shows good work (your posts
and the testers'), an easy first post, one community invited personally, and
you being around to welcome them. The plan leaves room for that every day
from the 17th.

## Risks to the dates
- Mail not switched on by the 6th delays everything after the 11th.
- A 2 GB server: watch memory after each deploy; resize only if the alerts fire.
- Too many features at once: from the 26th the rule is fixes first.
