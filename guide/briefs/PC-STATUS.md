# PC status (the Windows session's notes; the Mac session reads, does not edit)

Started 2026-10-03. Rules and the split of work: `guide/HANDOFF-WINDOWS.md`.

## The machine

Windows 11, 32 GB memory. Installed for this work, with Mae's yes: Git for
Windows 2.55 and the GitHub CLI (signed in as her). **Not installed:** Docker
Desktop and WSL (they need an administrator and a restart; Mae's to do), Node,
Java, PostgreSQL. Mae wants development kept inside a container so the rest of
the computer is not touched, so Node, Java and PostgreSQL are not going onto
Windows itself unless she says otherwise.

Both repositories are cloned side by side with `core.autocrlf=false` and
`core.eol=lf` set in each clone: Git for Windows defaults to converting text
to CRLF on checkout, which breaks every `.sh` file inside a Linux container.

## Branch `pc/windows-dev`

| What | State |
|---|---|
| `tools/webposting.cmd` stored normalised (it showed as modified on every fresh clone) | committed |
| `tools/docker/` (dev container: Node 22, JDK 21, PostgreSQL 15 client; `postgres:15` with `testdb` and `webposting_test`) | written, **never built or run**: Docker is not installed yet |

## Not run on this machine yet

Everything. No suite, no build, no launcher, nothing seen in a browser.

## Next, in order

1. When Docker is installed: build the container, run both suites one at a
   time, and compare with the handoff's numbers (client 580, server 679,
   `tools/menu.test.mjs` 17). Fix what the container setup gets wrong, then
   write its short guide.
2. `tools/run-local.sh` and `node tools/menu.mjs` inside the container.
3. The Windows launchers (`tools\webposting.cmd`, `.ps1`) and `run-local.sh`
   under Git Bash need Node, Java and PostgreSQL on Windows itself. Waiting
   for Mae to say whether she wants that on this computer.
4. webpaint.ing engine work (`pc/webgpu`): only when Mae says go.
