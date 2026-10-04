# senior-engineer-webpaint-server-setup-tool (Opus `senior-engineer`, one Sonnet helper for the AppleScript and menu rows)

Mae (2026-10-03): "include any commands ill need to run for webpainting in one
of the mac webposting app's tools". She has pointed webpaint.ing's DNS at the
droplet (done and confirmed with `dig`). What is left is on the server, and she
should not have to type or paste any of it: the Webposting app (and
`tools/menu.mjs` for Windows and Linux) gets entries that run each step in a
Terminal window, where she types her own SSH and sudo passwords. Nobody else
ever has them.

Read first: `guide/webpaint-architecture.md` sections 2.6 (nginx snippet) and
10.5 (the steps in order), `/Users/mae/workspace/webpainting/guide/phase0-results.md`
(nginx notes: `engine/manifest.json` must be `no-cache`; a location with its
own `add_header` drops the server-level policy headers), `tools/release.sh`,
`tools/install-release.sh`, `tools/server/enable-mail.sh` (the house style for
a server script: checks first, dry run, says what it will do, changes nothing
it does not own), `tools/mac-app/Webposting.applescript`, `tools/menu.mjs`.

## Build
1. `tools/server/setup-webpaint-site.sh` (runs ON the server with sudo; the
   app copies it over the existing SSH connection and runs it, as the deploy
   does). Steps, each checked before and after, each safe to run twice:
   - `--check` (default when run without `--apply`): prints what exists and
     what it would do; changes nothing.
   - web root `/srv/webpaint/html` with a one-line placeholder page if empty;
   - a port-80 nginx server block for `webpaint.ing` and `www.webpaint.ing`
     in its OWN file; never edits webpost.ing's file or the default site;
     refuses if a block for those names already exists elsewhere;
   - `nginx -t` before any reload; on failure it removes its own new file,
     tests again, and says so. webpost.ing must never go down because of this
     script;
   - `--certificate`: only after DNS answers with this server's address (it
     checks), runs certbot for both names with the nginx plugin, then replaces
     the block with the full HTTPS snippet from section 2.6 (headers, caching,
     `no-cache` manifest), `nginx -t`, reload, with the same roll-back;
   - `--status`: DNS, port 80, port 443, certificate expiry, and that
     `https://webpost.ing` still answers.
   No secrets, no addresses or usernames in the file: everything comes from
   arguments or from what the server reports.
2. App entries (shown when the site chooser is on webpaint.ing) and the same
   actions in `tools/menu.mjs`: "Check the server for webpaint.ing" (`--check`),
   "Set up webpaint.ing on the server" (`--apply`, typed confirmation as Deploy
   has), "Get the certificate" (`--certificate`), "Status" (`--status`). Each
   opens Terminal and leaves the output on screen.
3. `guide/DEPLOYMENT.md`: a short section "webpaint.ing, first time", in the
   order she presses the buttons, and what each should print.

## Proof
Rehearse the script against a scratch nginx prefix and a fake `certbot` and
`systemctl` (as the backup installer was rehearsed): first run, second run
("already done"), a broken config (roll-back leaves the old state and
`nginx -t` passes), an existing foreign block (refused). `bash -n`.
`node --test tools/menu.test.mjs`. Compile both app variants with
`osacompile`, and RUN the app's menu once in a scratch build (it has only been
compiled so far) to see that every row opens Terminal with the right command;
do not press Deploy or any server row for real. Never ssh to the server.

## Report
What each entry runs, the rehearsal results, what only the real server can
prove, and the exact order of buttons for Mae. No commit.
