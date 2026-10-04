# implementer-webpaint-deploy-setup (Sonnet)

Mae (2026-10-03, late): "get webpainting deployment setup please". DNS for
webpaint.ing already points at her droplet (confirmed). What is missing is the
server side and a first page there. You make that a short sequence of commands
she runs herself in Terminal, typing her own SSH and sudo passwords. You never
connect to the server, never see a password, and never write an address,
username or secret into a file.

This is the first half of
`guide/briefs/2026-10-04-senior-engineer-webpaint-server-setup-tool.md` (read
its "Build" item 1 for the script's required behaviour and its "Proof"
section). The Mac app rows and the AppleEvent work in that brief are NOT
yours; another worker does them later and will call the commands you make.

## Where
The webpaint.ing repository: `/Users/mae/workspace/webpainting` (private,
not pushed; do not push, do not commit: the lead commits after reading your
diff). Read its `guide/ARCHITECTURE.md` sections 2.6 (nginx snippet) and
10.5 (steps in order), `guide/phase0-results.md` (nginx notes:
`engine/manifest.json` must be `no-cache`; a location with its own
`add_header` drops the server-level headers), and its `tools/deploy.sh`,
`tools/release.sh`, `tools/install-release.sh`. For house style read, in the
webpost.ing worktree
(`/Users/mae/workspace/webposting/.claude/worktrees/kind-driscoll-e5fb5f`),
`tools/server/enable-mail.sh`, `tools/server/install-backup-timer.sh` and
`tools/release.sh` (one shared SSH connection, the archive sent through
`ssh cat`, checks first, a dry run, plain messages).

## Build (all in the webpainting repository)
1. `tools/server/setup-site.sh`: runs ON the server under sudo. Modes
   `--check` (default; changes nothing), `--apply`, `--certificate`,
   `--status`, exactly as the other brief's item 1 describes: its own nginx
   file only, `nginx -t` before every reload with roll-back of its own file on
   failure, refuses if another file already serves those names, safe to run
   twice, webpost.ing never touched. The port-80 block must also serve
   certbot's challenge. `--certificate` checks first that the name resolves to
   an address this server has.
2. `tools/setup-server.sh`: runs on HER computer. `check | apply |
   certificate | status`. Opens one SSH connection, sends `setup-site.sh`
   through it, runs it with `sudo` on a terminal (`ssh -t`) so she is asked
   for her sudo password there. Where the login comes from: `release.env` in
   the webpainting repository (`DEPLOY_HOST`); if that file is missing and
   `/Users/mae/workspace/webposting/release.env` exists, offer to reuse its
   `DEPLOY_HOST` (show it, ask y/n, write only that one line into the new
   `release.env`, which must be git-ignored: check `.gitignore`); otherwise
   ask once and validate `user@host`. `apply` asks for the typed word `setup`.
3. Make the first deploy work end to end with what `--apply` creates:
   `tools/deploy.sh` → `release.sh` → `install-release.sh` must put the built
   site into the same web root `setup-site.sh` serves, with the same owner
   and permissions, and must not need the phase 1 service. They have never
   been run against a server: read them against each other and against
   `setup-site.sh`, fix any disagreement (paths, ownership, sudo, the missing
   `deploy.env` in phase 0), and rehearse.
4. `guide/DEPLOYMENT.md` in the webpainting repository (create or extend):
   "First time", five numbered steps with the exact command for each and what
   it should print: check, apply, deploy the first page, certificate, status.

## Proof (no real server)
Rehearse `setup-site.sh` against a scratch nginx prefix with fake `nginx`,
`certbot` and `systemctl` on your PATH: first run, second run, a config that
fails the test (roll-back leaves the old state), a foreign block already
serving the names (refused), certificate before DNS answers (refused).
Rehearse `setup-server.sh` and the deploy chain with a fake `ssh` that runs
locally, as webpost.ing's backup tools were rehearsed. `bash -n` on every
script. Run the repository's own tools tests. Never run the real `ssh`.

## Report
What each command does, the rehearsal results, every assumption about the
server that only the real server can prove (nginx layout: `sites-enabled` or
`conf.d`; certbot installed; who owns the web root), and the five commands in
order for Mae. Be economical with output.
