#!/usr/bin/env node
// Pull still frames out of a recorded flow video (no ffmpeg needed: Chromium plays the file and is screenshotted).
//   node tools/visual/frames.mjs <video.webm> [--fps 2] [--from 0] [--to <seconds>] [--out dir]
// Writes <out>/t0000.0s.png ... and a contact sheet <out>/sheet.png (first 24 frames).
import { mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, py } from './lib.mjs';

const a = process.argv.slice(2);
const video = a.find(x => x.endsWith('.webm'));
const opt = (n, d) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : d; };
if (!video) { console.error('usage: frames.mjs <video.webm> [--fps 2] [--from s] [--to s] [--out dir]'); process.exit(2); }
const out = opt('--out', path.join(path.dirname(video), path.basename(video, '.webm') + '-frames'));
mkdirSync(out, { recursive: true });
const fps = Number(opt('--fps', '2'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 850 } });
await page.goto(pathToFileURL(path.resolve(video)).href);
const vid = page.locator('video');
await vid.waitFor();
await page.evaluate(() => { document.querySelector('video').controls = false; });
await page.evaluate(() => new Promise(r => { const v = document.querySelector('video'); v.pause(); v.currentTime = 1e6; v.onseeked = r; if (v.readyState >= 1) setTimeout(r, 500); }));
let dur = await page.evaluate(() => document.querySelector('video').duration);
if (!isFinite(dur)) dur = Number(opt('--to', '60'));
const from = Number(opt('--from', '0')), to = Math.min(Number(opt('--to', dur)), dur);
const files = [];
for (let t = from; t <= to; t += 1 / fps) {
  await page.evaluate(t => new Promise(r => { const v = document.querySelector('video'); v.onseeked = () => setTimeout(r, 60); v.currentTime = t; }), t);
  const f = path.join(out, `t${t.toFixed(1).padStart(6, '0')}s.png`);
  await vid.screenshot({ path: f });
  files.push(f);
}
await browser.close();
console.log(`${files.length} frames (${from}s to ${to.toFixed(1)}s) in ${out}`);
if (files.length) { py(['sheet', path.join(out, 'sheet.png'), ...files.slice(0, 24)]); console.log('contact sheet: ' + path.join(out, 'sheet.png')); }
