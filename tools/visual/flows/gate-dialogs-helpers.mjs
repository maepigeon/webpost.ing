// Helpers for the gate-dialogs flows. Not a flow itself (no default export), so run.mjs skips it.
import { sleep } from '../lib.mjs';

/** Runs in the page: facts about blur, opacity and fonts for the open overlay + card. */
export async function probe(page, cardSel, overlaySel) {
  return page.evaluate(({ cardSel, overlaySel }) => {
    const alpha = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return c === 'transparent' ? 0 : null; const p = m[1].split(/[ ,\/]+/).filter(Boolean); return p.length > 3 ? Number(p[3]) : 1; };
    const q = s => (s ? document.querySelector(s) : null);
    const card = q(cardSel), over = q(overlaySel) || (card && card.parentElement);
    const cs = e => e && getComputedStyle(e);
    const out = {};
    out.card = card ? { bg: cs(card).backgroundColor, alpha: alpha(cs(card).backgroundColor), img: cs(card).backgroundImage !== 'none', blur: cs(card).backdropFilter + '|' + cs(card).filter, font: cs(card).fontFamily.split(',')[0] } : null;
    out.overlay = over ? { bg: cs(over).backgroundColor, alpha: alpha(cs(over).backgroundColor), blur: cs(over).backdropFilter + '|' + cs(over).filter } : null;
    // every element anywhere with a blur/backdrop filter
    out.blurred = [...document.querySelectorAll('*')].filter(e => { const s = getComputedStyle(e); return (s.backdropFilter && s.backdropFilter !== 'none') || (s.webkitBackdropFilter && s.webkitBackdropFilter !== 'none') || /blur/.test(s.filter); }).slice(0, 6).map(e => (e.tagName + '.' + String(e.className).split(' ')[0]).slice(0, 50));
    // fonts of controls in the card
    const appFont = getComputedStyle(document.querySelector('nav button, nav a, header button') || document.body).fontFamily;
    const ctrls = card ? [...card.querySelectorAll('button, input, select, textarea, [role=tab], a')].filter(e => e.offsetParent).slice(0, 10) : [];
    out.appFont = appFont.split(',')[0];
    out.fonts = ctrls.map(e => ({ el: (e.tagName + '.' + String(e.className).split(' ')[0] + ':' + (e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 14)), font: getComputedStyle(e).fontFamily.split(',')[0] }));
    out.badFonts = out.fonts.filter(f => f.font.replace(/["']/g, '') !== appFont.split(',')[0].replace(/["']/g, '')).map(f => f.el + ' -> ' + f.font);
    out.trap = []; for (let e = card && card.parentElement; e && e !== document.documentElement; e = e.parentElement) { const s = getComputedStyle(e); if (s.transform !== 'none' || s.filter !== 'none' || s.perspective !== 'none' || /paint|layout|strict|content/.test(s.contain) || /transform|filter/.test(s.willChange)) out.trap.push(e.tagName + '.' + String(e.className).split(' ')[0] + ' ' + (s.transform !== 'none' ? 'transform' : s.filter !== 'none' ? 'filter' : 'contain/will-change')); }
    out.position = card && card.parentElement ? getComputedStyle(card.parentElement).position : null;
    // box inside window
    if (card) { const r = card.getBoundingClientRect(); out.box = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), inside: r.x >= 0 && r.y >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 }; }
    return out;
  }, { cardSel, overlaySel });
}

/** Focus ring of the active element: what an owner would see. */
export async function ring(page) {
  return page.evaluate(() => {
    const e = document.activeElement; if (!e || e === document.body) return { el: 'body' };
    const s = getComputedStyle(e);
    return { el: (e.tagName + '.' + String(e.className).split(' ')[0] + ':' + (e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 18)), focusVisible: e.matches(':focus-visible'), outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`, shadow: s.boxShadow.slice(0, 90) };
  });
}

/** True if the element handle is the focused element. */
export async function isFocused(page, handle) {
  return page.evaluate(e => document.activeElement === e, handle);
}

/**
 * Opens one dialog/menu by a real click, records facts and shots, closes it, checks focus returned.
 * spec: { id, opener (Locator), card (css), overlay? (css), waitFor? (Locator), closeWith: ['Escape'| Locator ...], themeTag }
 * Returns a result object; never throws (a failure is recorded as a finding).
 */
export async function dialogRound(v, spec) {
  const { page } = v;
  const r = { id: spec.id, ok: true, findings: [], facts: {} };
  const bad = m => { r.ok = false; r.findings.push(m); };
  try {
    const focusLoc = (spec.focusEl || spec.opener).first();
    const openerEl = await focusLoc.elementHandle();
    if (!openerEl) throw new Error('opener not found');
    if (spec.openSeq) await spec.openSeq(); else await v.click(spec.opener.first());
    await (spec.waitFor || page.locator(spec.card).first()).waitFor({ timeout: 8000 });
    await sleep(350);
    r.facts = await probe(page, spec.card, spec.overlay);
    // sharp, opaque, no blur
    if (r.facts.blurred.length) bad('blur found on: ' + r.facts.blurred.join(', '));
    if (r.facts.card && r.facts.card.alpha !== null && r.facts.card.alpha < 1 && !r.facts.card.img) bad(`card background not opaque (${r.facts.card.bg})`);
    if (spec.overlay && r.facts.overlay && r.facts.overlay.alpha === 0) bad('overlay has no dim');
    if (r.facts.box && !r.facts.box.inside) bad('card is partly off screen ' + JSON.stringify(r.facts.box));
    if (r.facts.badFonts.length) bad('controls not in app font: ' + r.facts.badFonts.join('; '));
    await raw(v, spec.id + '-open');
    if (spec.during) await spec.during(r);
    // close
    for (const how of spec.closeWith || ['Escape']) {
      if (how === 'Escape') await page.keyboard.press('Escape');
      else await v.click(how);
      await sleep(400);
      const still = await page.locator(spec.card).count();
      if (!still) { r.closedBy = how === 'Escape' ? 'Escape' : 'button'; break; }
      r.facts['stillOpenAfter_' + (how === 'Escape' ? 'Escape' : 'click')] = true;
    }
    if (await page.locator(spec.card).count()) { bad('could not close it'); }
    else {
      const foc = await isFocused(page, openerEl);
      r.facts.focusReturned = foc;
      if (!foc) { const a = await ring(page); r.facts.focusWentTo = a.el; bad('focus did not return to the opener (went to ' + a.el + ')'); }
    }
  } catch (e) {
    bad('exception: ' + String(e.message).split('\n')[0]);
    try { await page.screenshot({ path: v.outDir + `/FAIL-${spec.id}-${v.size}.png` }); } catch {}
    try { await page.keyboard.press('Escape'); } catch {}
  }
  v.note(`[${spec.id}] ${r.ok ? 'ok' : 'FINDING'} ${JSON.stringify({ closedBy: r.closedBy, focusReturned: r.facts.focusReturned, card: r.facts.card && r.facts.card.bg, overlay: r.facts.overlay && r.facts.overlay.bg, blurred: r.facts.blurred, trap: r.facts.trap, pos: r.facts.position, box: r.facts.box, fonts: r.facts.badFonts })} ${r.findings.join(' ; ')}`);
  (v.rounds ||= []).push(r);
  return r;
}

export function finish(v) {
  const bad = (v.rounds || []).filter(r => !r.ok);
  if (bad.length) throw new Error(bad.map(r => `${r.id}: ${r.findings.join(' / ')}`).join(' || ').slice(0, 900));
}

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const SESSION = '/private/tmp/claude-501/-Users-mae-workspace-webposting--claude-worktrees-kind-driscoll-e5fb5f/87be1c04-857d-4336-9a7a-4bd52c5ce943/scratchpad/run/gate-dialogs-session.json';
/** Sign in as test3 once; later flows reuse the saved cookies (login again only if the server refuses them). */
export async function loginOnce(v) {
  const ctx = v.context;
  let ok = false;
  if (existsSync(SESSION)) {
    try { await ctx.addCookies(JSON.parse(readFileSync(SESSION, 'utf8'))); ok = (await ctx.request.get(v.base + '/api/conversations')).status() === 200; } catch {}
  }
  if (!ok) {
    await ctx.clearCookies();
    const r = await ctx.request.post(v.base + '/api/loginSessionAttempt', { data: { username: 'test3', password: 'test3' } });
    if (!r.ok()) throw new Error('login as test3 failed: HTTP ' + r.status());
    mkdirSync(SESSION.replace(/\/[^/]+$/, ''), { recursive: true });
    writeFileSync(SESSION, JSON.stringify(await ctx.cookies()));
    v.note('signed in as test3 (new session)');
  } else v.note('reused saved test3 session');
  await ctx.addInitScript(() => { try { localStorage.setItem('userName', 'test3'); localStorage.setItem('isAdmin', '0'); } catch {} });
}

/** Unmasked screenshot of the window (masks would paint black bars over the dialog). Not compared with baselines. */
export async function raw(v, name, opts = {}) {
  const f = v.outDir + `/${name}-${v.size}.png`;
  await v.page.screenshot({ path: f, animations: 'allow', caret: 'hide', ...opts });
  return f;
}

/** Elements anywhere on the page that still carry a blur or backdrop filter. */
export function blurScan(page) {
  return page.evaluate(() => [...document.querySelectorAll('*')].filter(e => { const s = getComputedStyle(e); return (s.backdropFilter && s.backdropFilter !== 'none') || /blur/.test(s.filter); }).slice(0, 8).map(e => e.tagName + '.' + String(e.className).split(' ')[0] + ' ' + getComputedStyle(e).backdropFilter.slice(0, 30)));
}
/** Focus facts for one element handle or for the active element. */
export async function ringOf(page, loc) {
  return page.evaluate(e => { e = e || document.activeElement; if (!e) return null; const s = getComputedStyle(e); return { el: (e.tagName + '.' + String(e.className).split(' ')[0] + ':' + (e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 16)), focused: document.activeElement === e, focusVisible: e.matches(':focus-visible'), outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`, shadow: s.boxShadow.slice(0, 80) }; }, loc ? await loc.first().elementHandle() : null);
}
