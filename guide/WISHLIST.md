# Wishlist — what's still to do

The one place for future work. Add to it whenever Mae asks for something that
isn't done in the same session; tick or delete items as they land. Detail for
each lives in the linked guide. Last updated 2026-10-03.

## 1. Waiting on Mae (nothing more the AI can do first)

- **Switch mail on.** Pick a mail-sending service, add its DNS records, then
  run `tools/server/enable-mail.sh` on the server. → [EMAIL.md](EMAIL.md)
- **nginx additions**, when she chooses: crawler pages for search engines and
  AI ([SEO.md](SEO.md)); security headers, caching, and `sw.js` caching
  ([DEPLOYMENT.md](DEPLOYMENT.md) sections 7–8,
  [performance review](performance-review-2026-10-03.md) section 5).
- **Memory limits for the server process** (heap cap, service memory limit,
  swap). → performance review, item 2
- **Open sign-ups.** Needs mail on, then a Turnstile key if she wants the bot
  check; the switches are in the admin Settings tab. → [CONFIGURATION.md](CONFIGURATION.md)
- **Old database passwords in git history**: rotate them. → [SECURITY.md](SECURITY.md) item 1
- **The five dafont fonts**: only if she gets permission or licences; free
  look-alikes are in. → [fonts-dafont-licences.md](fonts-dafont-licences.md)
- **Answers to the open questions** in [SSO-PLAN.md](SSO-PLAN.md),
  [animator-design.md](animator-design.md) and [webpaint-plan.md](webpaint-plan.md).

## 2. Next up (ready to build)

- **Performance for the small server** → [performance review](performance-review-2026-10-03.md)
  - database indexes (one migration)
  - stop sending whole post bodies in profile, feed and Discover lists
  - fewer queries per save and autosave; faster search
  - load fonts on demand instead of 24 families up front
  - one slower unread poll that pauses in hidden tabs; fewer requests per profile view
- **Finish the browser review of 2026-10-03's features** (it was stopped
  before writing its report) and fix what it finds.
- **Smoke test suite** (`tools/smoke/`, half-written, uncommitted): finish it
  so every deploy can be checked the same way.
- **Check on a real phone**: install-as-app, the pop-up audio player, the
  top bar's More menu.
- **Small UI follow-ups**: a clearer selected state on the editor's
  "Goes in" choice; centred and right-aligned post buttons should sit in a
  row like left-aligned ones.
- **Post themes**: confirm each post's own theme works end to end and is easy
  to find.

## 3. Features Mae has asked for, not started

- **Sign in with Google, Apple, Microsoft**, plus set-a-password afterwards,
  a "this wasn't me" lock, and admin freeze/restore. → [SSO-PLAN.md](SSO-PLAN.md)
- **Subscribers** (a Patreon-like feature): the Subscribers section exists
  and is private to the owner; subscriptions themselves are not designed.
- **Let members upload their own fonts** (today only admins can).
- **More social features** beyond Discover and @mentions (ideas: mentions in
  posts, reposts, lists, an activity digest). To specify.
- **Remix / gallery idea** proposed earlier: awaiting her yes or no.
- **A home page she likes.** The 2026-10-03 redesign was reverted; show her
  a design before changing it again.
- **Maintenance page** shown during a deploy (from the older task list).
- **Self-serve data**: export exists; import is admin-only.

## 4. Big projects

- **webpaint.ing**: the animator and video editor as its own site, in
  Godot 4, on the same droplet with its own domain, repository and data and
  the same accounts; based partly on her Drawing-app; 3D reference models,
  shaders and scripts, a real timeline, export to standard video formats,
  and a direct link with webpost.ing. → [webpaint-plan.md](webpaint-plan.md)
- **Video on the sites**: uploads encoded in the browser, served with range
  requests, counted in the storage allowance; no transcoding on the server.
  → [animator-design.md](animator-design.md)

## 5. Housekeeping

- Commits earlier in this branch carry Co-Authored-By lines; removing them
  means rewriting pushed history (ask first).
- Code tidy-ups the code map found: unused endpoints (FontController's public
  routes, follow-counts, admin import), eleven copies of the same `authorize`
  helper, limits defined twice (client and server). → [project-structure.md](project-structure.md)
- `guide/backlog-2026-10-03.md` is the dated record of that day's queue; new
  items go here instead.
