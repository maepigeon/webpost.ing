// Shared helpers for the visual tester. See README.md.
import { chromium } from '../../client/node_modules/playwright/index.mjs';
import { mkdirSync, existsSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export { chromium };
export const here = path.dirname(fileURLToPath(import.meta.url));
export const BASELINES = path.join(here, 'baselines');
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const USERS = { test: 'test', test2: 'test2', test3: 'test3' };

export const SIZES = {
  desktop: { width: 1300, height: 850, hasTouch: false, isMobile: false },
  phone: { width: 390, height: 844, hasTouch: true, isMobile: true },
};

/** Regions that change on their own (times, counts, build hash). Masked on every capture. */
export const GLOBAL_MASKS = [
  'time', '.post-date', '.profile-post-date', '.messages-conv-time', '.messages-bubble-time', '.inbox-time', '.inbox-item-time', '.msg-time', '.message-time',
  '.cursor-glow', '.cursor-glow-dot', '[data-visual-mask]', '.nav-badge', '.profile-owner-btn', '.post-delete-btn', 'button:text-is("+ New grid post")', 'button:text-is("Edit")', ':text-matches("^Saved on this device")', '.audio-time', '.profile-tab-count', '.datestring', 'span:text-matches("^\\s*\\d+ views?")', '.messages-badge', '.security-devices', '.security-list', '.storage-summary', '.nav-more-dot', '.navButton-badge', '.unread-badge',
];

export function py(args, input) {
  return execFileSync('python3', [path.join(here, 'compare.py'), ...args], { input, maxBuffer: 1 << 26 }).toString();
}

/**
 * The thing a flow receives. One per (flow, size). Captures are collected in
 * `v.captures`; run.mjs compares them with the baselines afterwards.
 */
export class Visit {
  constructor({ flow, size, page, context, outDir, base }) {
    this.flow = flow; this.size = size; this.page = page; this.context = context;
    this.phone = size === 'phone'; this.base = base;
    this.outDir = outDir; this.captures = []; this.bursts = []; this.notes = []; this.stepsDone = [];
    this.cleanups = [];
    this.errors = [];   // console errors / page errors / 5xx seen while the flow ran
    mkdirSync(outDir, { recursive: true });
  }
  onCleanup(fn) { this.cleanups.push(fn); }
  note(msg) { this.notes.push(msg); }
  step(name) { this.stepsDone.push(name); }

  /** Signs the context in. Call before the first page.goto. */
  async login(user = 'test') {
    const r = await this.context.request.post(this.base + '/api/loginSessionAttempt', { data: { username: user, password: user } });
    if (!r.ok()) throw new Error(`login as ${user} failed: HTTP ${r.status()}`);
    await this.context.addInitScript(u => { try { localStorage.setItem('userName', u); localStorage.setItem('isAdmin', '0'); } catch {} }, user);
    return user;
  }

  /** fetch() inside the page so cookies ride along. */
  async api(method, url, body) {
    if (!this.page.url().startsWith('http')) await this.page.goto(this.base + '/robots.txt', { waitUntil: 'commit' });
    return this.page.evaluate(async ({ method, url, body }) => {
      const init = { method, credentials: 'include', headers: {} };
      if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
      const r = await fetch(url, init);
      const text = await r.text();
      let json = null; try { json = JSON.parse(text); } catch {}
      return { status: r.status, ok: r.ok, text, body: json };
    }, { method, url, body });
  }

  async goto(url) {
    await this.page.goto(url);
    await this.settle();
  }

  /** Network quiet, fonts loaded, a short pause so entrance animations end. */
  async settle(ms = 900) {
    const p = this.page;
    await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await p.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
    await sleep(ms);
  }

  /** Moves the pointer to the centre of an element in steps, pauses, clicks. */
  async click(target, opts = {}) {
    const loc = typeof target === 'string' ? this.page.locator(target).first() : target;
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    // smooth scrolling: measure only once the element has stopped moving
    let box = await loc.boundingBox();
    for (let i = 0; i < 25; i++) {
      await sleep(120);
      const b2 = await loc.boundingBox();
      if (b2 && box && Math.abs(b2.y - box.y) < 0.5 && Math.abs(b2.x - box.x) < 0.5) { box = b2; break; }
      box = b2;
    }
    if (!box) throw new Error('click: element has no box');
    // Pinned bars (the editor's tool stack) can sit over the element: scroll it toward the lower
    // part of the window until the pointer would really reach it.
    for (let i = 0; i < 4; i++) {
      const hit = await loc.evaluate((e, [x, y]) => { const t = document.elementFromPoint(x, y); return !!t && (e === t || e.contains(t)); }, [box.x + box.width / 2, box.y + box.height / 2]);
      if (hit) break;
      await this.page.evaluate(dy => window.scrollBy(0, dy), box.y + box.height / 2 - this.page.viewportSize().height * 0.72);
      await sleep(500);
      box = await loc.boundingBox();
      if (!box) throw new Error('click: element has no box');
    }
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await this.page.mouse.move(x, y, { steps: 8 });
    await sleep(opts.hover ?? 90);
    await this.page.mouse.click(x, y, { delay: 40 });
  }
  async type(text, delay = 45) { await this.page.keyboard.type(text, { delay }); }

  /** Real drag with intermediate moves, in page coordinates. */
  async drag(a, b, steps = 10) {
    const m = this.page.mouse;
    await m.move(a.x, a.y, { steps: 4 });
    await sleep(60);
    await m.down();
    await m.move(b.x, b.y, { steps });
    await sleep(60);
    await m.up();
  }

  _shotOpts(opts) {
    const pg = opts.page || this.page;
    const mask = [...GLOBAL_MASKS, ...(opts.mask || [])].map(s => typeof s === 'string' ? pg.locator(s) : s);
    return { mask, maskColor: '#000000', animations: 'disabled', caret: 'hide', fullPage: !!opts.fullPage };
  }

  /** A second signed-in browser context (no video), for the other person in a conversation. */
  async otherUser(user) {
    const S = SIZES[this.size];
    const ctx = await this.context.browser().newContext({ viewport: { width: S.width, height: S.height }, hasTouch: S.hasTouch, isMobile: S.isMobile, deviceScaleFactor: 1, baseURL: this.base });
    ctx.setDefaultTimeout(10000);
    const r = await ctx.request.post(this.base + '/api/loginSessionAttempt', { data: { username: user, password: user } });
    if (!r.ok()) throw new Error(`login as ${user} failed: HTTP ${r.status()}`);
    await ctx.addInitScript(u => { try { localStorage.setItem('userName', u); localStorage.setItem('isAdmin', '0'); } catch {} }, user);
    this.onCleanup(() => ctx.close());
    return ctx.newPage();
  }

  /**
   * One capture, compared with its baseline later.
   * opts: { fullPage, locator (region), mask: [selectors], dynamic: true (not compared, only looked at) }
   */
  async shot(step, opts = {}) {
    const file = path.join(this.outDir, `${step}-${this.size}.png`);
    if (opts.fullPage) { await (opts.page || this.page).evaluate(() => window.scrollTo(0, 0)); await sleep(250); }
    if (!opts.keepPointer) { const pg0 = opts.page || this.page; const vs = pg0.viewportSize(); await pg0.mouse.move(2, vs.height - 2); await sleep(120); }   // hover states would differ run to run
    const so = this._shotOpts(opts);
    const pg = opts.page || this.page;
    if (opts.locator) {
      const loc = typeof opts.locator === 'string' ? pg.locator(opts.locator).first() : opts.locator;
      await loc.screenshot({ path: file, animations: so.animations, caret: so.caret, mask: so.mask, maskColor: so.maskColor });
    } else {
      await pg.screenshot({ path: file, ...so, ...(opts.clip ? { clip: opts.clip, fullPage: false } : {}) });
    }
    this.captures.push({ step, file, compare: opts.dynamic ? false : true });
    return file;
  }

  /** A burst of frames for anything that moves. The last frame is also the step's baseline capture. */
  async burst(step, opts = {}) {
    const n = opts.frames ?? 6, gap = opts.gap ?? 80;
    const files = [];
    for (let i = 0; i < n; i++) {
      const f = path.join(this.outDir, `${step}-${this.size}-b${i + 1}.png`);
      const so = this._shotOpts(opts);
      const pg = opts.page || this.page;
      if (opts.locator) {
        const loc = typeof opts.locator === 'string' ? pg.locator(opts.locator).first() : opts.locator;
        await loc.screenshot({ path: f, animations: 'allow', caret: 'hide', mask: so.mask, maskColor: so.maskColor });
      } else {
        await pg.screenshot({ path: f, animations: 'allow', caret: 'hide', mask: so.mask, maskColor: so.maskColor, fullPage: !!opts.fullPage, ...(opts.clip ? { clip: opts.clip } : {}) });
      }
      files.push(f);
      if (i < n - 1) await sleep(gap);
    }
    const sheet = path.join(this.outDir, `${step}-${this.size}-sheet.png`);
    py(['sheet', sheet, ...files]);
    const stats = JSON.parse(py(['burst', ...files]));
    this.bursts.push({ step, files, sheet, stats });
    // the steady state is the last frame
    const last = path.join(this.outDir, `${step}-${this.size}.png`);
    copyFileSync(files[files.length - 1], last);
    this.captures.push({ step, file: last, compare: opts.dynamic ? false : true });
    return { files, sheet, stats };
  }

  /** Bounding box facts that back up what is seen: no box off-screen, no sideways scroll. */
  async geometry(selector) {
    return this.page.evaluate(sel => {
      const vw = window.innerWidth, vh = window.innerHeight;
      return [...document.querySelectorAll(sel)].map(e => {
        const r = e.getBoundingClientRect();
        return { cls: e.className?.toString().slice(0, 40), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), inside: r.x >= -1 && r.y >= -1 && r.right <= vw + 1 && r.bottom <= vh + 1 };
      });
    }, selector);
  }
  noSideScroll() { return this.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1); }
}

export function baselinePath(flow, step, size) { return path.join(BASELINES, flow, `${step}-${size}.png`); }
