# Smoke suite

One repeatable browser run over the things users notice, against a LOCAL copy
of the site, before a deploy. It prints one line per check and exits non-zero
if anything failed.

## Run it

Start a local copy first (see `guide/WORKING-HERE.md`, "Checking work": the jar
on 8081 with database `testdb`, `client/dist` served on 5175 with `/api` and
`/uploads` proxied). The suite does not build or start anything.

```
node tools/smoke/run.mjs                              # everything, desktop 1280x800
node tools/smoke/run.mjs --only seo,security          # by area, or by part of a check's name
node tools/smoke/run.mjs --phone                      # every check at 390x844
node tools/smoke/run.mjs --base http://localhost:5174 # another local port
node tools/smoke/run.mjs --verbose                    # print the stack of a failure
node tools/smoke/run.mjs --headed                     # watch it
```

- It refuses any base that is not `localhost` or `127.0.0.1`.
- Chromium comes from `client/node_modules/playwright`. No other dependency.
- Accounts used: `test`/`test` (admin), `test2`/`test2`, `test3`/`test3` (empty
  profile). Local database only.
- Each check gets a fresh browser context. A console error, an uncaught
  exception or an HTTP 5xx during a check fails it, whatever it asserted.
  Expected noise (font fetches, "Failed to load resource") is ignored.
- A failure leaves a screenshot in `tools/smoke/out/` (ignored by git).
- A full run takes about a minute. Each check has a 60 s limit.
- Exit code: 0 all passed or skipped, 1 a check failed, 2 bad arguments or the
  site is not reachable.

## What a result means

`PASS`, `FAIL` (with the first line of the reason and the stage it reached),
`SKIP` (the feature's entry point is not in this build, or the check says why).
A check that fails because the site has a real bug stays failing and is listed
in the report; do not weaken it to get green.

## What it leaves behind

Checks delete the posts they create and put back anything they change. Two
things cannot be undone through the site: the messages `messages:` sends from
`test` to `test2` (there is no delete-message call), and uploaded MP3s from
`audio:` (they stay until the admin "delete orphan uploads" is run). Both are
tiny. Nothing ever deletes an account or changes a password.

## Add a check

1. Pick the area's file in `checks/` (or add `checks/<area>.mjs`; every `*.mjs`
   there is loaded in name order).
2. Register it:

```js
import { check, login, assert, uniq, createDraftPost } from '../lib.mjs';

check('area: what a user would notice', async t => {
  const { page } = t;                         // a fresh page, 1280x800 (390x844 with --phone)
  await login(page, 'test');                  // 'test' | 'test2' | 'test3', through the API
  const id = await createDraftPost(page, { title: uniq('smoke thing'), published: true }, t); // deleted on cleanup
  await page.goto('/test/' + id);
  await page.locator('h1').waitFor();
  assert(await page.locator('h1').count() === 1, 'say what the user would see wrong');
}, { area: 'area' });
```

What `t` gives you: `page`, `context`, `phone`, `step(label)` (names the stage
shown with a failure), `onCleanup(fn)` (runs after the check, even on failure),
`newUser('test2', {width, height})` and `visitor()` (more browser contexts, closed
for you), `skip(reason)`, and `need(selector, label)` (SKIP when a feature's entry
point is not in this build).

`lib.mjs` has the shared helpers: `api(page, method, url, body)` (fetch inside the
page, cookies included), `createDraftPost`, `deletePost`, `deletePostsTitled`,
`findPostId`, `openEditor`, `openSection`, `lexicalDoc`, `waitForIdle`,
`noHorizontalScroll`, `valueBecomes`, `textBecomes`, `uniq`, `sleep`, `assert`.

Rules for a check:

- Assert what a person would notice (text, position, a link that works), not
  class names, unless there is nothing else to hold on to.
- Title everything you create `smoke ...` (use `uniq('smoke ...')`) and delete it
  in `t.onCleanup`.
- Never touch the real accounts' passwords, never delete an account, never send
  anything outside localhost.
- Wait for the thing you need (`waitFor`, `waitForURL`), not a fixed sleep; a short
  sleep is only for "nothing should happen".
- Run it twice in a row before you trust it.

## Areas

`auth`, `nav`, `editor-text`, `editor-grid`, `editor-button`, `autosave`,
`themes`, `profile`, `messages`, `settings`, `security`, `seo`, `discover`, `audio`.
