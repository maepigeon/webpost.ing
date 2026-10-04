#!/usr/bin/env node
// Visual tester: replays the flows, records video, captures, compares with baselines.
//   node tools/visual/run.mjs [--flow name[,name]] [--size desktop|phone] [--update] [--base http://localhost:5175]
//   --out name  write to tools/visual/out/<name>/ instead of out/latest/ (use one name per tester when running in parallel)
//   --update   overwrite baselines with this run's captures (use after judging a diff intended)
// Output: tools/visual/out/latest/ (videos/, <flow>/ captures, diffs/, results.json)
import { mkdirSync, readdirSync, rmSync, existsSync, copyFileSync, renameSync, writeFileSync, readdirSync as ls } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { chromium, here, Visit, SIZES, baselinePath, py, sleep } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const base = opt('--base', 'http://localhost:5175').replace(/\/+$/, '');
const onlyFlows = opt('--flow', '') ? opt('--flow').split(',') : null;
const onlySize = opt('--size', '');
const update = args.includes('--update');
const outName = opt('--out', 'latest');   // parallel testers: give each its own folder, e.g. --out alice
const THRESHOLD_PCT = Number(opt('--threshold', '0.05'));   // percent of changed pixels that makes a finding

const host = new URL(base).hostname;
if (!['localhost', '127.0.0.1'].includes(host)) { console.error(`Refusing ${host}: local site only.`); process.exit(2); }
try { const r = await fetch(base + '/api/seo/robots.txt'); if (r.status >= 500) throw new Error('HTTP ' + r.status); }
catch (e) { console.error(`Site is down at ${base}: ${e.message}`); process.exit(2); }

const out = path.join(here, 'out', outName);
if (!onlyFlows && !onlySize) rmSync(out, { recursive: true, force: true });
mkdirSync(path.join(out, 'videos'), { recursive: true });
mkdirSync(path.join(out, 'diffs'), { recursive: true });
mkdirSync(path.join(out, 'traces'), { recursive: true });

const flows = [];
for (const f of readdirSync(path.join(here, 'flows')).filter(f => f.endsWith('.mjs')).sort()) {
  const m = (await import(pathToFileURL(path.join(here, 'flows', f)).href)).default;
  if (m && (!onlyFlows || onlyFlows.includes(m.name))) flows.push(m);
}
if (!flows.length) { console.error('No flows match.'); process.exit(2); }

const browser = await chromium.launch({ headless: true });
const results = [];

for (const flow of flows) {
  for (const size of (flow.sizes || ['desktop', 'phone'])) {
    if (onlySize && onlySize !== size) continue;
    const S = SIZES[size];
    // The server keeps at most 5 sessions per account and evicts the oldest, so other workers
    // logging in as the same test account can end our session mid-flow. One retry for that case.
    let attempt = 0, again = true;
    while (again) {
      attempt++; again = false;
      const tmpVideo = path.join(out, 'videos', `.tmp-${flow.name}-${size}`);
      const context = await browser.newContext({
        viewport: { width: S.width, height: S.height }, hasTouch: S.hasTouch, isMobile: S.isMobile,
        deviceScaleFactor: 1, baseURL: base, acceptDownloads: true, reducedMotion: 'no-preference',
        recordVideo: { dir: tmpVideo, size: { width: S.width, height: S.height } },
      });
      context.setDefaultTimeout(10000);
      await context.tracing.start({ screenshots: true, snapshots: true });
      const page = await context.newPage();
      const v = new Visit({ flow: flow.name, size, page, context, outDir: path.join(out, flow.name), base });
      page.on('pageerror', e => v.errors.push('pageerror: ' + String(e.message).slice(0, 160)));
      page.on('console', m => {
        if (m.type() !== 'error') return;
        const t = m.text();
        if (/Failed to load resource|fonts\.(googleapis|gstatic)|favicon|ERR_(INTERNET|NAME|CONNECTION|BLOCKED)/.test(t)) return;
        v.errors.push('console: ' + t.slice(0, 160));
      });
      page.on('response', r => { if (r.status() >= 500) v.errors.push(`HTTP ${r.status()} ${r.url().replace(base, '')}`); });

      const t0 = Date.now();
      let error = null;
      try { await flow.run(v); }
      catch (e) { error = e; try { await page.screenshot({ path: path.join(v.outDir, `FAILED-${size}.png`) }); } catch {} }
      let sessionLost = false;
      if (error) { try { sessionLost = /session ended|Sign in to your account/i.test(await page.locator('body').innerText({ timeout: 2000 })); } catch {} }
      for (const fn of v.cleanups.reverse()) { try { await fn(); } catch (e) { v.notes.push('cleanup failed: ' + e.message); } }
      const tracePath = path.join(out, 'traces', `${flow.name}-${size}.zip`);
      await context.tracing.stop(error ? { path: tracePath } : undefined).catch(() => {});
      const vid = page.video();
      await context.close();                       // writes the .webm
      let videoPath = null;
      try { videoPath = path.join(out, 'videos', `${flow.name}-${size}.webm`); renameSync(await vid.path(), videoPath); } catch { videoPath = null; }
      rmSync(tmpVideo, { recursive: true, force: true });
      results.push({
        flow: flow.name, size, error: error ? (String(error.message || error).split('\n')[0].slice(0, 240) + ((String(error.stack||'').match(/flows\/([\w-]+\.mjs:\d+)/) || [])[1] ? ' @' + String(error.stack).match(/flows\/([\w-]+\.mjs:\d+)/)[1] : '')) : null,
        seconds: Math.round((Date.now() - t0) / 1000), steps: v.stepsDone, notes: v.notes, errors: [...new Set(v.errors)].slice(0, 8),
        video: videoPath, trace: error ? tracePath : null, sessionLost,
        captures: v.captures, bursts: v.bursts,
      });
      if (error && attempt < 2 && results.at(-1).sessionLost) { results.pop(); again = true; console.log(`retry ${flow.name} ${size}: session was ended by someone else logging in`); }
    }
    { const last = results.at(-1); console.log(`${last.error ? 'FAIL' : 'ok  '} ${flow.name} ${size} (${last.seconds}s)${last.error ? '  ' + last.error : ''}`); }
  }
}
await browser.close();

// ---- compare with baselines ----------------------------------------------------------------
const manifest = [];
const created = [], updated = [];
for (const r of results) for (const c of r.captures) {
  if (!c.compare) continue;
  const bp = baselinePath(r.flow, c.step, r.size);
  c.name = `${r.flow}/${c.step}-${r.size}`;
  c.baseline = bp;
  if (!existsSync(bp)) { mkdirSync(path.dirname(bp), { recursive: true }); copyFileSync(c.file, bp); c.status = 'new'; created.push(c.name); continue; }
  c.diff = path.join(out, 'diffs', `${r.flow}__${c.step}-${r.size}.png`);
  manifest.push({ name: c.name, new: c.file, base: bp, diff: c.diff });
}
if (manifest.length) {
  const cmp = JSON.parse(py(['compare', '/dev/stdin'], JSON.stringify(manifest)));
  const by = Object.fromEntries(cmp.map(c => [c.name, c]));
  for (const r of results) for (const c of r.captures) {
    const x = by[c.name]; if (!x) continue;
    Object.assign(c, { status: x.status === 'same' ? 'same' : (x.status === 'size' ? 'size' : (x.pct >= THRESHOLD_PCT ? 'DIFF' : 'minor')), pct: x.pct, regions: x.regions });
    if (update && c.status !== 'same') { copyFileSync(c.file, c.baseline); updated.push(c.name); }
  }
}
writeFileSync(path.join(out, 'results.json'), JSON.stringify({ base, when: new Date().toISOString(), created, updated, results }, null, 1));

// ---- table -------------------------------------------------------------------------------
const pad = (s, n) => String(s).padEnd(n);
console.log('\nflow'.padEnd(20) + pad('size', 9) + pad('result', 8) + pad('shots', 7) + pad('new', 5) + pad('same', 6) + pad('minor', 7) + pad('DIFF', 6) + 'worst');
for (const r of results) {
  const n = s => r.captures.filter(c => c.status === s).length;
  const worst = r.captures.filter(c => c.pct !== undefined).sort((a, b) => b.pct - a.pct)[0];
  console.log(pad(r.flow, 20) + pad(r.size, 9) + pad(r.error ? 'FAIL' : 'pass', 8) + pad(r.captures.length, 7) + pad(n('new'), 5) + pad(n('same'), 6) + pad(n('minor'), 7) + pad(n('DIFF') + n('size'), 6) + (worst && worst.pct > 0 ? `${worst.step} ${worst.pct}%` : ''));
}
for (const r of results) {
  for (const c of r.captures.filter(c => c.status === 'DIFF' || c.status === 'size')) console.log(`  DIFF ${c.name} ${c.pct}%  ${c.diff || ''}`);
  for (const n of r.notes) console.log(`  note ${r.flow}/${r.size}: ${n.replace(/\n/g,' ')}`);
  for (const e of r.errors) console.log(`  console ${r.flow}/${r.size}: ${e}`);
}
if (created.length) console.log(`\n${created.length} new baselines saved.`);
if (updated.length) console.log(`${updated.length} baselines updated.`);
console.log(`Output: ${out}`);
process.exit(results.some(r => r.error) ? 1 : 0);
