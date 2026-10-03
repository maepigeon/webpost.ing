# 2026-10-03-visual-tester-core-flows  (visual-tester, Sonnet)
First run: build the reusable recorder and baseline the core flows. Local site http://localhost:5175 (do not rebuild or restart; other workers are editing source; the lead may rebuild between your runs, which is exactly what baselines are for). You own `tools/visual/**` only; a different worker owns `tools/smoke/**` (DOM-level checks) — do not edit it, but you may read its `lib.mjs` for login helpers and copy what you need.
Flows to record at 1300×850 and 390×844, with bursts where things move:
1. **Grid editor drawing**: new post → insert grid → type text → rectangle → magic fill inside it → lasso some tiles → link them → flatten text → focus view on and off. Check the canvas after each tool actually shows the result (compare the canvas region before/after: it must change where expected and nowhere else).
2. **Write and publish**: title, text, description, a Button block, publish, view the post, back to the profile card, delete.
3. **Profile**: own profile top to bottom, each tab (Posts, Notes, Drafts, Subscribers), View as visitor, an empty profile (test3); on the default theme and on a dark theme set through `PUT /api/users/test/theme` (restore after).
4. **Top bar**: account menu and More menu opening and closing, at both sizes.
5. **Messages**: send a message test2 → test3, react to it (picker position on the first message), notification click opens the conversation.
6. **Settings**: every section opened one by one.
7. **Audio**: if a post with audio exists, play it, navigate away, the mini player persists, close it. Skip with a reason otherwise.
Mask dynamic regions (times, dates, counts that change, the build hash). Write the report to `guide/visual-test-2026-10-03.md` and tell the lead where the recordings are so the owner can watch them. Final reply: failures (flow, step, what you saw), the recordings folder, and how to rerun.
