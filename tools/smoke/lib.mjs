// Shared helpers for the smoke checks. See README.md.
import { chromium } from '../../client/node_modules/playwright/index.mjs';

export { chromium };

export const USERS = {
  test: { username: 'test', password: 'test' },
  test2: { username: 'test2', password: 'test2' },
  test3: { username: 'test3', password: 'test3' },
};

// ---- registry ---------------------------------------------------------------

const registry = [];
/** check(name, async (t) => {...}, { expectNew, area }) */
export function check(name, fn, opts = {}) {
  registry.push({ name, fn, opts });
}
export function allChecks() { return registry; }

/** Thrown by t.need() when an entry point of a not-yet-built feature is absent. */
export class NotInBuild extends Error {}
export class Skip extends Error {}

// ---- small utilities ----------------------------------------------------------

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

export function uniq(prefix = 'smoke') {
  return `${prefix} ${Date.now().toString(36)}${Math.floor(Math.random() * 1e3)}`;
}

/** Waits until the network has been quiet briefly; never throws. */
export async function waitForIdle(page, quietMs = 400, maxMs = 8000) {
  let last = Date.now();
  let pending = 0;
  const onReq = () => { pending++; last = Date.now(); };
  const onDone = () => { pending = Math.max(0, pending - 1); last = Date.now(); };
  page.on('request', onReq); page.on('requestfinished', onDone); page.on('requestfailed', onDone);
  const start = Date.now();
  try {
    while (Date.now() - start < maxMs) {
      if (pending === 0 && Date.now() - last >= quietMs) break;
      await sleep(80);
    }
  } finally {
    page.off('request', onReq); page.off('requestfinished', onDone); page.off('requestfailed', onDone);
  }
}

// ---- API from inside the page (cookies included) ------------------------------------

/** fetch() in the page, so the session cookies ride along. Returns { status, ok, body, text }. */
export async function api(page, method, url, body) {
  await ensureOrigin(page);
  return page.evaluate(async ({ method, url, body }) => {
    const init = { method, credentials: 'include', headers: {} };
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const r = await fetch(url, init);
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: r.status, ok: r.ok, text, body: json };
  }, { method, url, body });
}

async function ensureOrigin(page) {
  const u = page.url();
  if (!u.startsWith('http')) {
    const base = page.context().__base;
    await page.goto(base + '/robots.txt', { waitUntil: 'commit' });
  }
}

// ---- sign in ------------------------------------------------------------------------

/**
 * Signs `page`'s context in as `user` ('test' | 'test2' | 'test3') through the
 * login endpoint, and sets what the sign-in form would have stored. Faster
 * than the form; the auth check covers the form itself.
 */
export async function login(page, user = 'test') {
  const u = USERS[user] || { username: user, password: user };
  const ctx = page.context();
  const base = ctx.__base;
  const r = await ctx.request.post(base + '/api/loginSessionAttempt', { data: u });
  if (!r.ok()) throw new Error(`login as ${u.username} failed: HTTP ${r.status()}`);
  let isAdmin = '0';
  try { isAdmin = (await (await ctx.request.get(base + '/api/admin/me')).json()).isAdmin ? '1' : '0'; } catch { /* not admin */ }
  await ctx.addInitScript(({ name, isAdmin }) => {
    try { localStorage.setItem('userName', name); localStorage.setItem('isAdmin', isAdmin); } catch { /* ignore */ }
  }, { name: u.username, isAdmin });
  return u.username;
}

// ---- posts ----------------------------------------------------------------------------

/** Lexical state for plain paragraphs, one per string. */
export function lexicalDoc(...paragraphs) {
  return JSON.stringify({
    root: {
      type: 'root', version: 1, direction: 'ltr', format: '', indent: 0,
      children: paragraphs.map(text => ({
        type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0,
        children: [{ type: 'text', version: 1, text, detail: 0, format: 0, mode: 'normal', style: '' }],
      })),
    },
  });
}

/** Creates a post through the API as the signed-in user; returns its id. Deleted on cleanup when `t` is given. */
export async function createDraftPost(page, { title, paragraphs = ['smoke body'], summary = null, published = false, section = 'profile', description } = {}, t) {
  const r = await api(page, 'POST', '/api/posts', {
    title: title ?? uniq('smoke post'),
    description: description ?? lexicalDoc(...paragraphs),
    published, summary, section,
  });
  if (r.status !== 201) throw new Error(`createDraftPost: HTTP ${r.status} ${r.text.slice(0, 120)}`);
  const id = Number(r.text);
  if (t) t.onCleanup(() => deletePost(page, id));
  return id;
}

export async function deletePost(page, id) {
  try { await api(page, 'DELETE', `/api/posts/${id}`); } catch { /* page may be closed */ }
}

/** Posts of the signed-in user whose title starts with `prefix`; deletes them. Used as a safety net by cleanups. */
export async function deletePostsTitled(page, username, prefix) {
  const r = await api(page, 'GET', `/api/user/${username}?limit=200&offset=0`);
  const list = Array.isArray(r.body) ? r.body : (r.body?.posts || []);
  for (const p of list) if ((p.title || '').startsWith(prefix)) await deletePost(page, p.id);
}

// ---- UI helpers -------------------------------------------------------------------------

export async function openEditor(page, id) {
  await page.goto(id ? `/editor/${id}` : '/editor');
  await page.locator('.editor-contenteditable').first().waitFor({ timeout: 15000 });
  await page.locator('.title-input').waitFor({ timeout: 5000 });
}

/** Expands a folded toolbar section of the editor by its heading ("Insert", "Page" ...). */
export async function openSection(page, label) {
  const head = page.locator(`.pe-section-head[title$=" ${label}"]`).first();
  await head.waitFor();
  const text = (await head.getAttribute('title')) || '';
  if (/^Show/.test(text)) await head.click();
}

export async function noHorizontalScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

/** Id of the signed-in user's post with exactly this title, or null. */
export async function findPostId(page, username, title) {
  const r = await api(page, 'GET', `/api/user/${username}?limit=200&offset=0`);
  const list = Array.isArray(r.body) ? r.body : (r.body?.posts || []);
  const hit = list.find(p => p.title === title);
  return hit ? hit.id : null;
}

/** Waits for an input's value to become `value`; returns whether it did. */
export async function valueBecomes(locator, value, ms = 6000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await locator.inputValue().catch(() => null) === value) return true;
    await sleep(150);
  }
  return false;
}

/** Waits for text to appear in a locator's innerText; returns whether it did. */
export async function textBecomes(locator, text, ms = 6000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if ((await locator.innerText().catch(() => '')).includes(text)) return true;
    await sleep(150);
  }
  return false;
}
