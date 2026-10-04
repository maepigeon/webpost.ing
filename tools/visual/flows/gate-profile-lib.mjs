// Helpers shared by the gate-profile-* flows (not a flow itself: no default export).
import { sleep, py } from '../lib.mjs';
import { readFileSync } from 'node:fs';

export const MASKS = ['.profile-banner-hit', '.profile-post-meta time', '.post-meta', '.profile-tab-count', '.profile-tab small'];
export const DARK = JSON.parse(readFileSync(new URL('../dark-theme.json', import.meta.url), 'utf8'));

export function lexicalDoc(...paragraphs) {
  return JSON.stringify({ root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0,
    children: paragraphs.map(text => ({ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0,
      children: [{ type: 'text', version: 1, text, detail: 0, format: 0, mode: 'normal', style: '' }] })) } });
}

/** Creates a throwaway post as the signed-in user; deleted at cleanup if it still exists. */
export async function makePost(v, title, published = true) {
  await v.goto('/robots.txt');
  const r = await v.api('POST', '/api/posts', { title, description: lexicalDoc('gate-profile test post, safe to delete'), published, summary: null, section: 'profile' });
  if (r.status !== 201) throw new Error(`could not create post: HTTP ${r.status} ${r.text.slice(0, 100)}`);
  const id = Number(r.text);
  v.onCleanup(async () => { await v.api('DELETE', `/api/posts/${id}`).catch(() => {}); });
  return id;
}

export async function saveTheme(v) {
  await v.goto('/robots.txt');
  const orig = await v.api('GET', '/api/users/test/theme');
  const origTheme = orig.body?.theme ?? null;
  v.onCleanup(async () => {
    const r = await v.api('PUT', '/api/users/test/theme', { theme: origTheme });
    if (!r.ok) v.note(`COULD NOT RESTORE test's theme: HTTP ${r.status}`);
  });
  return origTheme;
}

/** font-family of up to `max` distinct controls matching the selectors, and which differ from the top bar's. */
export async function fonts(v, label, selectors, max = 12) {
  const res = await v.page.evaluate(({ selectors, max }) => {
    const ref = document.querySelector('nav button, header button, nav a');
    const refFont = ref ? getComputedStyle(ref).fontFamily : '';
    const out = [];
    const seen = new Set();
    for (const sel of selectors) {
      for (const e of [...document.querySelectorAll(sel)].slice(0, 2)) {
        const r = e.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const key = sel + '|' + (e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 20);
        if (seen.has(key)) continue; seen.add(key);
        out.push({ sel, text: (e.innerText || e.getAttribute('aria-label') || e.placeholder || '').trim().slice(0, 24), font: getComputedStyle(e).fontFamily.slice(0, 50) });
        if (out.length >= max) break;
      }
      if (out.length >= max) break;
    }
    return { refFont: refFont.slice(0, 50), out };
  }, { selectors, max });
  const bad = res.out.filter(o => o.font !== res.refFont);
  v.note(`fonts[${label}]: top bar = ${res.refFont}; ${res.out.length} controls measured; ${bad.length ? 'DIFFERENT: ' + bad.map(b => `${b.sel} "${b.text}" = ${b.font}`).join('; ') : 'all match'}`);
  return { res, bad };
}

/** Mouse click leaves no focus ring; Tab shows one. Returns {mouseRing, keyRing}. */
export async function ringCheck(v, label, target) {
  const { page } = v;
  await v.click(target);
  await sleep(250);
  const mouse = await page.evaluate(() => { const e = document.activeElement; const s = getComputedStyle(e); return { vis: e.matches(':focus-visible'), outline: s.outlineStyle + ' ' + s.outlineWidth, shadow: s.boxShadow.slice(0, 50), tag: e.tagName + '.' + String(e.className).slice(0, 25) }; });
  v.note(`ring[${label}] after mouse click: focus-visible=${mouse.vis} outline=${mouse.outline} on ${mouse.tag}`);
  return mouse;
}
export async function keyRing(v, label, key = 'Tab') {
  const { page } = v;
  await page.keyboard.press(key);
  await sleep(250);
  const k = await page.evaluate(() => { const e = document.activeElement; const s = getComputedStyle(e); return { vis: e.matches(':focus-visible'), outline: s.outlineStyle + ' ' + s.outlineWidth + ' ' + s.outlineColor, shadow: s.boxShadow.slice(0, 60), tag: e.tagName + '.' + String(e.className).slice(0, 25) + ' "' + (e.innerText || '').trim().slice(0, 16) + '"' }; });
  v.note(`ring[${label}] after Tab: focus-visible=${k.vis} outline=${k.outline} shadow=${k.shadow} on ${k.tag}`);
  return k;
}

/** Combine several already-taken captures into one contact sheet so fewer images need opening. */
export function sheetOf(outPath, files) { py(['sheet', outPath, ...files]); }

export const CONTROLS = ['nav button', '.edit-bio-btn', '.profile-tab', '.profile-owner-btn', '.post-delete-btn', '.profile-post-folder-btn', '.profile-folder-toggle-btn', '#profile-tabpanel button', '.arrange-done', '.arrange-new-folder'];
