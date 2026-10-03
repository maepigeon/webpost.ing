# webpaint.ing — Mae's brief (2026-10-03). Future work; nothing built yet.

Mae owns the domain **webpaint.ing**. This is where the animation and video
editor project lives. It supersedes the "where it lives" and "which engine"
parts of [animator-design.md](animator-design.md); the rest of that document
(feature checklist, codecs, server-side limits, phases) still applies.

## What she asked for, in her words

"i have a domain webpaint.ing. i want webpaint.ing's architecture to be based
partially on the drawing canvas i have at https://github.com/maepigeon/Drawing-app.
i will want to have it connected to webpost.ing, create a new github project
for webpaint.ing. and have webpost.ing and webpaint.ing hosted on the same
digitalocean droplet, connected to separate domains. but make it in godot,
integrated into the website for webpaint.ing. design the UI and UX very well
and have 3d model referencing in it. this is where the animation and video
editor project i was talking about should live. the accounts should be the
same but the application data should be separate. ideally i would like to be
able to have webpaint.ing content have a direct upload to webpaint.ing button.
i would like to be able to have shaders and scripts the editor for animating
that involves such things. have export options to standard video formats.
have well made timeline features and well placed UI considerations."

## Decisions this settles

- **Engine: Godot 4**, exported to the web and embedded in the webpaint.ing
  site (also runnable standalone). animator-design.md recommended a native
  web build; Mae has chosen Godot. Its 3D support covers the 3D reference
  models; its shader language and GDScript cover "shaders and scripts".
- **Separate product, separate repository** (a new GitHub project for
  webpaint.ing), separate application data, **same accounts** as webpost.ing.
- **Same droplet, two domains**: nginx serves both; webpaint.ing gets its own
  server block, static root and (if it needs one) its own service and
  database or schema. The droplet has 2 GB: no video transcoding on it.
- **Starting point for the canvas**: her existing project
  https://github.com/maepigeon/Drawing-app. Read it first and reuse its
  architecture where it fits.
- **Link between the sites**: a direct "upload/post to webpost.ing" (and
  into webpaint.ing) button for finished work. She wrote "direct upload to
  webpaint.ing button" for webpaint.ing content; confirm which direction(s)
  she means before building.
- Must have: a well-made timeline, careful UI/UX, 3D model reference, export
  to standard video formats, scripting and shaders in the animation editor.

## What the first session on this should do

1. Read Drawing-app and animator-design.md; write a short architecture note
   for the Godot version (web export constraints: cross-origin isolation
   headers for threads, download size, pen pressure on the web, memory on
   iPad; how the page and the engine talk through JavaScriptBridge).
2. Decide shared sign-in: one account system for two domains (cookies do not
   cross domains, so this needs a small hand-off, e.g. a one-time token from
   webpost.ing, or the SSO work in [SSO-PLAN.md](SSO-PLAN.md)).
3. Ask Mae: create the GitHub repository (she must do or approve this), DNS
   for webpaint.ing, and whether the droplet should be resized before video.
4. Only then start a spike. A half-built native-web animator prototype from
   2026-10-03 was stopped early and left uncommitted; it is not the plan now.

## Dropped

- **"AI compression" for video.** Mae dropped it on 2026-10-03. Use standard
  codecs (AV1 or VP9 in WebM, H.264 in MP4), encoded in the browser.

## Not decided

- Storage allowance for video, maximum length and size.
- Whether scripts written by users run only on their own machine (safe) or
  can be shared (needs sandboxing and review).
