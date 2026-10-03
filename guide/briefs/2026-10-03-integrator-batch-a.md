# integrator-batch-a (Sonnet, `integrator`)

Apply the insertions that finished workers left for files they could not
touch, and one lead decision. **Do not run the full server suite yet**: the
SSO worker is mid-edit in `server/` (pom.xml, `JdbcLoginRepository`,
`LoginRepository`, `Sso*.java`, V021). Do not touch those files. Run only the
test classes named below; if the module does not compile because of SSO's
half-finished files, wait two minutes and try again (three tries), then report.

## 1. Lead decision: a frozen account cannot save anything
`StorageAccountService.fitsQuota` returns early when `addBytes <= freedBytes`.
That lets a frozen user (limit 0 bytes, a moderation state) rewrite an existing
sticker or post with different content of the same size.
`SharedPackTest.stickersAndPacksAreRefusedWith413WhenTheStorageLimitIsReached`
is right and stays as it is. Change the code:

- read the limit first (`fileLimitBytes`); `null` → true;
- limit `0` → false, always (frozen: nothing is saved);
- then the early return for a save that does not grow (keeps the skipped usage
  query for everyone else, and lets a user over a lowered limit shrink);
- then the usage sum as now.

Add a `StorageAccountTest` case for each of the three branches. Run
`StorageAccountTest`, `SharedPackTest`, `PostControllerTest`.

## 2. Insertions
- `server/src/test/resources/config/application.properties`: add
  `app.preview-sweep.enabled=false`. Run `PreviewSweepTest`,
  `PreviewAdminControllerTest` after.
- `tools/release.sh`: after the line that copies `tools/server/*.sh` into
  `$OUT/server-tools/`, add `cp tools/backup.sh "$OUT/server-tools/"`.
  `bash -n` it.
- `.gitattributes`: add `*.sh text eol=lf`, `*.mjs text eol=lf`,
  `tools/*.cmd text eol=crlf`.
- `config/release.env.example`: commented `SERVER_BACKUP_DIR`,
  `SERVER_UPLOAD_DIR`, `BACKUP_DIR`, `KEEP_DOWNLOADS` (see
  `tools/download-backup.sh` header for meanings).
- `config/deploy.env.example` and `guide/CONFIGURATION.md`: optional
  `HEARTBEAT_URL`, `BACKUP_KEEP_DAILY=7`, `BACKUP_KEEP_WEEKLY=4`,
  `PREVIEW_SWEEP_ENABLED` (default true). No real values anywhere.
- `guide/WORKING-HERE.md`: latest migration is V020 (V021 is in progress).
- `guide/project-structure.md`: rows for `PostPreview`, `PreviewSweep`,
  `PreviewAdminController`, `tools/menu.mjs` and its launchers,
  `tools/download-backup.sh`, `tools/restore-test.sh`,
  `tools/server/install-backup-timer.sh`. Fix the "add a font" recipe if it
  still says to add an index.html link (fonts go in `GOOGLE_FONTS` in
  `client/src/utils/fontLoader.js`).
- `guide/DEPLOYMENT.md`: "One-time steps" item 5 and section 3 must not tell
  Mae to copy `server-start.sh` by hand (it ships with a release now).
- `client/src/utils/codeDisplay.js` `applyCodeDisplay`: call
  `ensureFontsIn(font.stack)` (import from `./fontLoader.js`) if it does not
  already.

## 3. The animator files nobody committed
`client/src/animator/` and `client/src/test/animator*.test.js` are untracked
and not routed in `App.jsx`. Run `npx vitest run src/test/animator` in
`client/` and report pass/fail counts. Change nothing there.

## 4. Local tidy
An audit left an empty grid post, id 99, on the local `test` account. Delete it
through the local API (http://localhost:8081, sign in as test/test) if the
server answers; if it does not, say so.

## Report
What you changed per file, test counts, anything you could not do.
No commit, no `vite build`, no server start.
