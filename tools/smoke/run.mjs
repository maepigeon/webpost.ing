#!/usr/bin/env node
// Smoke suite runner. Local copies only. See README.md.
import { mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { chromium, allChecks, NotInBuild, Skip } from './lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const flag = name => args.includes(name);

const base = opt('--base', 'http://localhost:5175').replace(/\/+$/, '');
const only = opt('--only', '') ? opt('--only').split(',').map(s => s.trim()).filter(Boolean) : null;
const headed = flag('--headed');
const phone = flag('--phone');
const verbose = flag('--verbose');

let host;
try { host = new URL(base).hostname; } catch { console.error(`Not a URL: ${base}`); process.exit(2); }
if (!['localhost', '127.0.0.1'].includes(host)) {
  console.error(`Refusing to run against "${host}": the smoke suite only ever targets a local copy (localhost or 127.0.0.1).`);
  process.exit(2);
}

// Load every checks/*.mjs; each registers itself through check().
for (const f of readdirSync(path.join(here, 'checks')).filter(f => f.endsWith('.mjs')).sort())
  await import(pathToFileURL(path.join(here, 'checks', f)).href);

let checks = allChecks();
if (only) checks = checks.filter(c => only.some(o => c.opts.area === o || c.name.includes(o)));
if (!checks.length) { console.error('No checks match --only.'); process.exit(2); }

try { const r = await fetch(base + '/api/seo/robots.txt'); if (r.status >= 500) throw new Error('HTTP ' + r.status); }
catch (e) { console.error(`Cannot reach ${base}: ${e.message}. Start a local copy first (guide/WORKING-HERE.md, "Checking work").`); process.exit(2); }

mkdirSync(path.join(here, 'out'), { recursive: true });
const browser = await chromium.launch({ headless: !headed });

const IGNORED_CONSOLE = [
  /Failed to load resource/,               // HTTP errors are judged by status (>= 500 fails)
  /fonts\.(googleapis|gstatic)\.com/,
  /ERR_(INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|CONNECTION|BLOCKED)/,
  /favicon/,
];

const results = [];
const pad = (s, n) => String(s).padEnd(n);

for (const c of checks) {
  const t0 = Date.now();
  const cleanups = [];
  const problems = [];
  const viewport = phone ? { width: 390, height: 844 } : { width: 1280, height: 800 };
  const context = await browser.newContext({ viewport, baseURL: base, acceptDownloads: true });
  context.__base = base;
  context.setDefaultTimeout(10000);
  const pages = new Set();
  const wire = page => {
    pages.add(page);
    page.on('console', m => {
      if (m.type() !== 'error') return;
      const text = m.text();
      if (IGNORED_CONSOLE.some(re => re.test(text))) return;
      if (c.opts.allowConsole && c.opts.allowConsole.some(re => re.test(text))) return;
      problems.push(`console error: ${text.slice(0, 160)}`);
    });
    page.on('pageerror', e => problems.push(`uncaught: ${String(e.message).slice(0, 160)}`));
    page.on('response', r => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`); });
  };
  context.on('page', wire);
  const page = await context.newPage();

  const t = {
    base, page, context, browser, phone,
    onCleanup: fn => cleanups.push(fn),
    /** Names the stage a long check has reached; shown with a failure. */
    step: label => { t.stage = label; },
    stage: '',
    skip: reason => { throw new Skip(reason); },
    /** Entry point of a feature that may not be in this build: absent -> SKIP. */
    async need(target, label, ms = 2500) {
      const loc = typeof target === 'string' ? page.locator(target).first() : target;
      try { await loc.waitFor({ timeout: ms }); }
      catch { throw new NotInBuild(label); }
    },
    /** A second signed-in browser context (another user, or the same one with a different size). */
    async newUser(user, vp) {
      const ctx = await browser.newContext({ viewport: vp || viewport, baseURL: base });
      ctx.__base = base; ctx.setDefaultTimeout(10000);
      ctx.on('page', wire);
      const p = await ctx.newPage();
      if (user) { const { login } = await import('./lib.mjs'); await login(p, user); }
      cleanups.push(() => ctx.close());
      return p;
    },
    /** A signed-out visitor. */
    visitor: vp => t.newUser(null, vp),
  };

  let status = 'PASS', reason = '';
  try {
    await Promise.race([
      c.fn(t),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after 60s')), 60000)),
    ]);
  } catch (e) {
    if (e instanceof NotInBuild) { status = 'SKIP'; reason = `skipped (not in this build): ${e.message}`; }
    else if (e instanceof Skip) { status = 'SKIP'; reason = e.message; }
    else {
      status = 'FAIL'; reason = (t.stage ? `[${t.stage}] ` : '') + String(e.message || e).split('\n')[0].slice(0, 200);
      if (verbose) console.log(String(e.stack || e).split('\n').slice(0, 14).join('\n'));
    }
  }
  if (status === 'PASS' && problems.length) { status = 'FAIL'; reason = [...new Set(problems)].slice(0, 3).join(' | '); }
  if (status === 'FAIL') {
    const file = path.join(here, 'out', `${c.name.replace(/[^\w.-]+/g, '_')}.png`);
    try { await [...pages].reverse().find(p => !p.isClosed() && p.url() !== 'about:blank')?.screenshot({ path: file }); } catch { /* ignore */ }
  }
  for (const fn of cleanups.reverse()) { try { await fn(); } catch { /* best effort */ } }
  try { await context.close(); } catch { /* ignore */ }

  const ms = Date.now() - t0;
  results.push({ name: c.name, status, ms, reason });
  console.log(`${pad(status, 5)} ${pad(c.name, 34)} ${pad(ms + 'ms', 8)} ${reason}`);
}

await browser.close();
const n = s => results.filter(r => r.status === s).length;
const total = results.reduce((a, r) => a + r.ms, 0);
console.log(`\n${n('PASS')} passed, ${n('FAIL')} failed, ${n('SKIP')} skipped, in ${(total / 1000).toFixed(1)}s (${base}${phone ? ', phone' : ''})`);
if (n('FAIL')) console.log('Failures:\n' + results.filter(r => r.status === 'FAIL').map(r => `  ${r.name}: ${r.reason}`).join('\n') + '\nScreenshots: tools/smoke/out/');
process.exit(n('FAIL') ? 1 : 0);
