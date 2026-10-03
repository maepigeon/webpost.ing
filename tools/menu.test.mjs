// Tests for tools/menu.mjs. Run: node --test tools/menu.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  ACTIONS, ROOT, SITE, INSTALL_HINTS, actionsJson, findBash, missingTools, missingMessage,
  openCommand, confirmed, runInBash, runAction,
} from './menu.mjs';

// A faked computer: `files` exist, `programs` maps a name to what `where` finds.
const fake = ({ platform, env = {}, files = [], programs = {} }) => ({
  platform,
  env,
  exists: p => files.includes(p),
  where: name => programs[name] ?? [],
});

test('the action table has the ids the menu and the Mac app use, each once', () => {
  assert.deepEqual(ACTIONS.map(a => a.id), ['view', 'restart', 'stop', 'deploy', 'backup', 'backups', 'smoke']);
  assert.equal(new Set(ACTIONS.map(a => a.id)).size, ACTIONS.length);
});

test('every action runs a script that exists, or is named for one owned elsewhere', () => {
  for (const a of ACTIONS) {
    assert.ok(a.label && a.command && a.script, a.id);
    assert.ok(a.command.includes(a.script.replace(/^tools\//, './tools/')) || a.command.includes(a.script), `${a.id}: command mentions its script`);
  }
  // download-backup.sh is written by another worker; the others must exist now.
  for (const a of ACTIONS.filter(a => !a.script.includes('download-backup'))) {
    assert.ok(existsSync(path.join(ROOT, a.script)), a.script);
  }
});

test('deploy asks for a typed confirmation; nothing else does', () => {
  for (const a of ACTIONS) {
    if (a.id === 'deploy') assert.equal(a.confirmWord, 'deploy');
    else assert.equal(a.confirm, null, a.id);
  }
});

test('commands match what the Mac app runs', () => {
  const byId = Object.fromEntries(ACTIONS.map(a => [a.id, a.command]));
  assert.equal(byId.view, './tools/run-local.sh');
  assert.equal(byId.restart, './tools/run-local.sh');
  assert.equal(byId.stop, './tools/run-local.sh stop');
  assert.equal(byId.deploy, './tools/deploy.sh');
  assert.equal(byId.backup, './tools/download-backup.sh');
  assert.equal(byId.backups, './tools/download-backup.sh --list');
  assert.equal(byId.smoke, `node tools/smoke/run.mjs --base ${SITE}`);
});

test('--actions prints the table as JSON', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/menu.mjs'), '--actions'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  const rows = JSON.parse(r.stdout);
  assert.deepEqual(rows, JSON.parse(actionsJson()));
  assert.equal(rows.length, ACTIONS.length);
  assert.equal(rows.find(a => a.id === 'view').whenRunning.open, SITE);
});

test('an unknown action exits 2', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/menu.mjs'), 'nope'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Unknown action: nope/);
});

test('bash on macOS and Linux is the one on the path, else /bin/bash', () => {
  for (const platform of ['darwin', 'linux']) {
    const found = findBash(fake({ platform, programs: { bash: ['/usr/local/bin/bash'] } }));
    assert.deepEqual(found, { kind: 'bash', command: '/usr/local/bin/bash', args: ['-c'] });
    const fallback = findBash(fake({ platform, files: ['/bin/bash'] }));
    assert.equal(fallback.command, '/bin/bash');
    assert.match(findBash(fake({ platform })).error, /bash was not found/);
  }
});

const GIT_BASH = 'C:\\Program Files\\Git\\bin\\bash.exe';

test('Windows: Git for Windows in Program Files comes first', () => {
  const sys = fake({
    platform: 'win32',
    env: { ProgramFiles: 'C:\\Program Files' },
    files: [GIT_BASH, 'C:\\other\\bash.exe'],
    programs: { bash: ['C:\\other\\bash.exe'], wsl: ['C:\\Windows\\System32\\wsl.exe'] },
  });
  assert.deepEqual(findBash(sys), { kind: 'bash', command: GIT_BASH, args: ['-c'] });
});

test('Windows: %ProgramFiles% and the per-user install are tried', () => {
  const pf = fake({ platform: 'win32', env: { ProgramFiles: 'D:\\Programs' }, files: ['D:\\Programs\\Git\\bin\\bash.exe'] });
  assert.equal(findBash(pf).command, 'D:\\Programs\\Git\\bin\\bash.exe');
  const user = fake({
    platform: 'win32', env: { LOCALAPPDATA: 'C:\\Users\\m\\AppData\\Local' },
    files: ['C:\\Users\\m\\AppData\\Local\\Programs\\Git\\bin\\bash.exe'],
  });
  assert.equal(findBash(user).command, 'C:\\Users\\m\\AppData\\Local\\Programs\\Git\\bin\\bash.exe');
});

test('Windows: a Git installed elsewhere is found through git.exe', () => {
  const sys = fake({
    platform: 'win32',
    files: ['E:\\Tools\\Git\\bin\\bash.exe'],
    programs: { git: ['E:\\Tools\\Git\\cmd\\git.exe'] },
  });
  assert.equal(findBash(sys).command, 'E:\\Tools\\Git\\bin\\bash.exe');
});

test('Windows: `where bash` is used, but the WSL stub in System32 is not Git Bash', () => {
  const stub = 'C:\\Windows\\System32\\bash.exe';
  const sys = fake({
    platform: 'win32', files: [stub, 'F:\\gitportable\\bin\\bash.exe'],
    programs: { bash: [stub, 'F:\\gitportable\\bin\\bash.exe'] },
  });
  assert.equal(findBash(sys).command, 'F:\\gitportable\\bin\\bash.exe');
  const onlyStub = fake({ platform: 'win32', files: [stub], programs: { bash: [stub], wsl: ['C:\\Windows\\System32\\wsl.exe'] } });
  assert.equal(findBash(onlyStub).kind, 'wsl');
});

test('Windows: WSL is the last resort, then a plain instruction', () => {
  const wsl = findBash(fake({ platform: 'win32', programs: { wsl: ['C:\\Windows\\System32\\wsl.exe'] } }));
  assert.deepEqual(wsl, { kind: 'wsl', command: 'wsl.exe', args: ['bash', '-c'] });
  const none = findBash(fake({ platform: 'win32' }));
  assert.match(none.error, /Install Git for Windows/);
  assert.match(none.error, /git-scm\.com/);
});

test('missing tools are named, with what to install', () => {
  const has = name => ['node', 'git'].includes(name);
  const deploy = ACTIONS.find(a => a.id === 'deploy');
  assert.deepEqual(missingTools(deploy.needs, has), ['java', 'ssh']);
  assert.deepEqual(missingTools(ACTIONS.find(a => a.id === 'stop').needs, () => false), []);
  const msg = missingMessage(deploy.label, ['java', 'ssh']);
  assert.match(msg, /needs java, ssh, which were not found/);
  assert.match(msg, /Java 21/);
  assert.match(msg, /ssh client/);
  assert.match(missingMessage('X', ['git']), /which was not found/);
  for (const a of ACTIONS) for (const n of a.needs) assert.ok(INSTALL_HINTS[n], `a hint for ${n}`);
});

test('the browser is opened the way each OS does it', () => {
  assert.deepEqual(openCommand('darwin', SITE), { command: 'open', args: [SITE] });
  assert.deepEqual(openCommand('win32', SITE), { command: 'cmd', args: ['/c', 'start', '', SITE] });
  assert.deepEqual(openCommand('linux', SITE), { command: 'xdg-open', args: [SITE] });
});

test('the deploy confirmation takes only the typed word', () => {
  assert.ok(confirmed('deploy', 'deploy'));
  assert.ok(confirmed('  Deploy ', 'deploy'));
  assert.ok(!confirmed('', 'deploy'));
  assert.ok(!confirmed('yes', 'deploy'));
  assert.ok(!confirmed(null, 'deploy'));
});

test('a command runs through bash in the given folder and its exit code comes back', async () => {
  const bash = findBash();
  if (bash.error) return; // no bash here; the discovery tests above cover it
  assert.equal(await runInBash(bash, 'exit 3', ROOT), 3);
  assert.equal(await runInBash(bash, 'test -f tools/menu.mjs', ROOT), 0);
});

test('an action stops with a plain message, and runs nothing, when a tool is missing', async () => {
  const errors = [];
  const original = console.error;
  console.error = msg => errors.push(msg);
  try {
    const bash = { kind: 'bash', command: '/bin/false', args: ['-c'] }; // would fail loudly if it ran
    const sys = fake({ platform: 'linux', programs: { git: ['/usr/bin/git'] } });
    const code = await runAction(ACTIONS.find(a => a.id === 'restart'), { bash, sys });
    assert.equal(code, 1);
    assert.match(errors.join('\n'), /needs java, node/);
  } finally {
    console.error = original;
  }
});
