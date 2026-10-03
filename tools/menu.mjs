#!/usr/bin/env node
// menu.mjs — the control menu for the copy of webpost.ing on this computer.
//
//     node tools/menu.mjs              the menu
//     node tools/menu.mjs view         one action, no menu:
//       view | restart | stop | deploy | backup | backups | smoke
//     node tools/menu.mjs --actions    the action table as JSON
//     node tools/menu.mjs deploy --yes skip the typed confirmation
//
// It does nothing by itself: each choice runs one of the repository's own
// bash scripts in this terminal, so progress, errors and password prompts are
// in plain sight. On macOS and Linux that is `bash`; on Windows it is Git
// Bash (Git for Windows) or, failing that, WSL. ACTIONS below is the single
// list of what can be done; the Mac app (tools/mac-app) mirrors it.
//
// No dependencies; Node is already needed to build the site.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SITE = 'http://localhost:5174';

const BUILD_TOOLS = ['java', 'node', 'git'];

// One row per thing the menu can do. `command` is run by bash from the
// repository root. `script` is the file it needs. `needs` are programs that
// must be installed first. `confirm` is the question to ask before a typed
// `confirmWord`. `view` opens the browser instead when the site already runs.
export const ACTIONS = [
  { id: 'view', label: 'Build and view locally', command: './tools/run-local.sh',
    script: 'tools/run-local.sh', needs: BUILD_TOOLS, confirm: null, confirmWord: null,
    whenRunning: { label: 'Open the local site', open: SITE } },
  { id: 'restart', label: 'Rebuild and restart locally', command: './tools/run-local.sh',
    script: 'tools/run-local.sh', needs: BUILD_TOOLS, confirm: null, confirmWord: null },
  { id: 'stop', label: 'Stop the local site', command: './tools/run-local.sh stop',
    script: 'tools/run-local.sh', needs: [], confirm: null, confirmWord: null },
  { id: 'deploy', label: 'Deploy to webpost.ing…', command: './tools/deploy.sh',
    script: 'tools/deploy.sh', needs: [...BUILD_TOOLS, 'ssh'],
    confirm: 'Deploy this build to the live site? This pushes main to GitHub, then logs in to the server and updates it. It asks for your server password here. The first time, it also asks where the server is.',
    confirmWord: 'deploy' },
  { id: 'backup', label: 'Download a backup', command: './tools/download-backup.sh',
    script: 'tools/download-backup.sh', needs: ['ssh'], confirm: null, confirmWord: null },
  { id: 'backups', label: 'List server backups', command: './tools/download-backup.sh --list',
    script: 'tools/download-backup.sh', needs: ['ssh'], confirm: null, confirmWord: null },
  { id: 'smoke', label: 'Run the smoke tests on the local copy', command: `node tools/smoke/run.mjs --base ${SITE}`,
    script: 'tools/smoke/run.mjs', needs: ['node'], confirm: null, confirmWord: null },
];

// What to install, in plain words, for each program an action can need.
export const INSTALL_HINTS = {
  java: 'Java 21 (https://adoptium.net)',
  node: 'Node 20.19 or newer (https://nodejs.org)',
  git: 'Git (https://git-scm.com; on Windows, Git for Windows)',
  ssh: 'an ssh client (included with Git for Windows; on Linux, the openssh-client package)',
};

export function actionsJson() {
  return JSON.stringify(ACTIONS.map(({ id, label, command, script, needs, confirm, whenRunning }) =>
    ({ id, label, command, script, needs, confirm, whenRunning: whenRunning ?? null })), null, 2);
}

// ── Finding bash ─────────────────────────────────────────────────────────────

const WINDOWS_WSL_STUB = /\\windows\\system32\\bash\.exe$/i; // starts WSL, not Git Bash

export const BASH_HELP_WINDOWS =
  'bash was not found. Install Git for Windows (https://git-scm.com/download/win), which includes Git Bash, then run this again. ' +
  '(WSL also works: https://learn.microsoft.com/windows/wsl/install, but Java and Node then have to be installed inside it.)';

/**
 * Where to run scripts. `sys` is injectable so each OS can be faked:
 * { platform, env, exists(path), where(name) -> string[] }.
 * Returns { kind: 'bash' | 'wsl', command, args } or { error }.
 */
export function findBash(sys = realSystem()) {
  if (sys.platform !== 'win32') {
    for (const p of sys.where('bash')) return { kind: 'bash', command: p, args: ['-c'] };
    if (sys.exists('/bin/bash')) return { kind: 'bash', command: '/bin/bash', args: ['-c'] };
    return { error: 'bash was not found. Install it with your package manager (for example: sudo apt install bash).' };
  }
  const w = path.win32;
  const env = sys.env;
  const candidates = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    env.ProgramFiles && w.join(env.ProgramFiles, 'Git', 'bin', 'bash.exe'),
    env['ProgramFiles(x86)'] && w.join(env['ProgramFiles(x86)'], 'Git', 'bin', 'bash.exe'),
    env.LOCALAPPDATA && w.join(env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe'),
  ].filter(Boolean);
  // A Git for Windows installed anywhere else: git.exe sits in Git\cmd.
  for (const g of sys.where('git')) {
    const dir = w.dirname(g);
    if (/^(cmd|bin)$/i.test(w.basename(dir))) candidates.push(w.join(w.dirname(dir), 'bin', 'bash.exe'));
  }
  for (const p of candidates) if (sys.exists(p)) return { kind: 'bash', command: p, args: ['-c'] };
  for (const p of sys.where('bash')) {
    if (!WINDOWS_WSL_STUB.test(p) && sys.exists(p)) return { kind: 'bash', command: p, args: ['-c'] };
  }
  if (sys.where('wsl').length > 0) return { kind: 'wsl', command: 'wsl.exe', args: ['bash', '-c'] };
  return { error: BASH_HELP_WINDOWS };
}

export function realSystem() {
  const win = process.platform === 'win32';
  return {
    platform: process.platform,
    env: process.env,
    exists: existsSync,
    where(name) {
      const r = win
        ? spawnSync('where', [name], { encoding: 'utf8' })
        : spawnSync('sh', ['-c', 'command -v "$0"', name], { encoding: 'utf8' });
      return r.status === 0 ? r.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [];
    },
  };
}

// ── Checking the tools an action needs ───────────────────────────────────────

/** Names (from `needs`) that `has(name)` says are missing. */
export function missingTools(needs, has) {
  return needs.filter(n => !has(n));
}

export function missingMessage(actionLabel, missing) {
  const list = missing.map(n => INSTALL_HINTS[n] ?? n).join('; ');
  return `"${actionLabel}" needs ${missing.join(', ')}, which ${missing.length > 1 ? 'were' : 'was'} not found. Install ${list}, then try again.`;
}

// Tools are looked for where the script will look: inside WSL when bash is WSL.
function toolChecker(bash, sys) {
  if (bash.kind === 'wsl') {
    return name => spawnSync(bash.command, ['bash', '-c', `command -v ${name}`], { stdio: 'ignore' }).status === 0;
  }
  return name => sys.where(name).length > 0;
}

// ── Running things ───────────────────────────────────────────────────────────

export function openCommand(platform, url) {
  if (platform === 'darwin') return { command: 'open', args: [url] };
  if (platform === 'win32') return { command: 'cmd', args: ['/c', 'start', '', url] };
  return { command: 'xdg-open', args: [url] };
}

function openBrowser(url) {
  const { command, args } = openCommand(process.platform, url);
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.on('error', () => console.log(`Open ${url} in your browser.`));
  child.unref();
}

/** Runs `command` in bash from the repository root, in this terminal. Resolves with its exit code. */
export function runInBash(bash, command, cwd = ROOT) {
  return new Promise(resolve => {
    // Ctrl-C reaches the script too; this menu stays up to show how it ended.
    const ignore = () => {};
    process.on('SIGINT', ignore);
    const done = code => { process.off('SIGINT', ignore); resolve(code); };
    const child = spawn(bash.command, [...bash.args, command], { cwd, stdio: 'inherit' });
    child.on('error', err => { console.error(`Could not start ${bash.command}: ${err.message}`); done(127); });
    child.on('exit', (code, signal) => done(code ?? (signal ? 130 : 1)));
  });
}

function currentBuild() {
  const r = spawnSync('git', ['log', '-1', '--format=%h  %s'], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) return `(could not read the repository at ${ROOT})`;
  return r.stdout.trim().slice(0, 70);
}

async function siteIsUp() {
  try {
    await fetch(SITE, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}

// One question at a time with a fresh interface, so a child process that
// reads the terminal afterwards does not compete with a half-open reader.
// Resolves null at end of input.
function ask(question) {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    let answered = false;
    rl.once('close', () => { if (!answered) resolve(null); });
    rl.on('SIGINT', () => rl.close());   // Ctrl-C at a question leaves the menu
    rl.question(question, answer => { answered = true; rl.close(); resolve(answer.trim()); });
  });
}

/** True when the typed answer is the confirm word (any case, spaces ignored). */
export function confirmed(answer, word) {
  return typeof answer === 'string' && answer.trim().toLowerCase() === word;
}

/**
 * Runs one action. `yes` skips the typed confirmation. Returns an exit code.
 */
export async function runAction(action, { yes = false, bash, sys = realSystem() } = {}) {
  if (action.whenRunning && await siteIsUp()) {
    openBrowser(action.whenRunning.open);
    console.log(`Opened ${action.whenRunning.open}`);
    return 0;
  }
  if (!existsSync(path.join(ROOT, action.script))) {
    console.error(`"${action.label}" needs ${action.script}, which is not in this checkout yet. Update the checkout (git pull) and try again.`);
    return 1;
  }
  bash ??= findBash(sys);
  if (bash.error) { console.error(bash.error); return 1; }
  const missing = missingTools(action.needs, toolChecker(bash, sys));
  if (missing.length) { console.error(missingMessage(action.label, missing)); return 1; }
  if (action.confirm && !yes) {
    console.log(`\n${action.confirm}\n\nBuild: ${currentBuild()}`);
    const answer = await ask(`Type ${action.confirmWord} to go ahead, or press Enter to cancel: `);
    if (!confirmed(answer, action.confirmWord)) { console.log('Cancelled. Nothing was changed.'); return 0; }
  }
  console.log(`\n── ${action.label} ──`);
  return runInBash(bash, action.command);
}

// ── The menu ─────────────────────────────────────────────────────────────────

async function menu() {
  if (!process.stdin.isTTY) {
    console.error('The menu needs a terminal. For scripting, name an action: node tools/menu.mjs <' + ACTIONS.map(a => a.id).join('|') + '>');
    return 2;
  }
  const sys = realSystem();
  for (;;) {
    const up = await siteIsUp();
    console.log(`\nWebposting\nCurrent build: ${currentBuild()}\nLocal site: ${up ? `Running at ${SITE}` : 'Not running'}\n`);
    const shown = ACTIONS.map(a => (a.whenRunning && up ? { ...a, label: a.whenRunning.label } : a));
    shown.forEach((a, i) => console.log(`  ${i + 1}. ${a.label}`));
    console.log('  q. Quit\n');
    const answer = await ask('Choose: ');
    if (answer === null || /^(q|quit|exit)$/i.test(answer)) return 0;
    const picked = shown[Number(answer) - 1];
    if (!picked) { console.log('Type a number from the list, or q.'); continue; }
    const code = await runAction(ACTIONS[Number(answer) - 1], { sys });
    if (code !== 0) console.log(`\n(It stopped with exit code ${code}. The messages above say why.)`);
    await ask('\nPress Enter to go back to the menu. ');
  }
}

async function main(argv) {
  const [first, ...rest] = argv;
  if (first === '--actions') { console.log(actionsJson()); return 0; }
  if (first === '-h' || first === '--help') {
    console.log('Usage: node tools/menu.mjs [' + ACTIONS.map(a => a.id).join('|') + '|--actions] [--yes]');
    return 0;
  }
  if (!first) return menu();
  const action = ACTIONS.find(a => a.id === first);
  if (!action) { console.error(`Unknown action: ${first} (try --help)`); return 2; }
  return runAction(action, { yes: rest.includes('--yes') });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(code => process.exit(code));
}
