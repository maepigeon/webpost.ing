// gate-small: mini player across navigation, scroll-to-top position (vt4).
import { sleep } from '../lib.mjs';
import { loginVt4, fontReport } from './gate-small-lib.mjs';

export default {
  name: 'gate-small-player',
  async run(v) {
    const { page } = v;
    const bad = [];
    await loginVt4(v);
    await v.goto('/robots.txt');
    const r = await v.api('GET', '/api/user/test2?limit=200&offset=0');
    const list = Array.isArray(r.body) ? r.body : (r.body?.posts || []);
    const post = list.find(p => /audio/i.test(p.title || ''));
    if (!post) { v.note('no audio post'); throw new Error('no audio post to play'); }
    await v.goto(`/test2/${post.id}`);
    await page.locator('h1').first().waitFor();
    const play = page.locator('.audio-node button, .pa-play, button[aria-label="Play"], button[aria-label^="Play"]').first();
    await play.waitFor();
    await v.click(play);
    await page.locator('.mini-player').waitFor({ timeout: 6000 });
    await sleep(1200);
    await v.shot('player-on-post', { dynamic: true });
    const mpStyle = () => page.evaluate(() => { const e = document.querySelector('.mini-player'); const c = getComputedStyle(e); const r = e.getBoundingClientRect(); return { bg: c.backgroundColor, font: c.fontFamily.split(',')[0], blur: c.backdropFilter, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight }; });
    v.note('mini player on post: ' + JSON.stringify(await mpStyle()));
    // navigate in-app, no reload
    const hops = [];
    await v.click(page.locator('a.navButton:visible', { hasText: 'Home' }).first());
    await page.waitForURL(u => new URL(u).pathname === '/'); await v.settle(500);
    hops.push(['home', await page.locator('.mini-player').count()]);
    await v.shot('player-home', { dynamic: true });
    const more = page.getByRole('button', { name: /^More/ }).first();
    for (const label of ['Discover', 'Search']) {
      const direct = page.locator('a.navButton:visible', { hasText: label }).first();
      if (await direct.count()) { await v.click(direct); await v.settle(500); hops.push([label, await page.locator('.mini-player').count()]); await v.shot('player-' + label.toLowerCase(), { dynamic: true }); continue; }
      await v.click(more);
      const item = page.getByRole('menuitem', { name: new RegExp('^' + label) }).first();
      if (!await item.count()) { v.note('More has no ' + label + ': ' + (await page.getByRole('menuitem').allInnerTexts()).join('|')); await page.keyboard.press('Escape'); continue; }
      await v.click(item); await v.settle(500);
      hops.push([label, await page.locator('.mini-player').count()]);
      await v.shot('player-' + label.toLowerCase(), { dynamic: true });
    }
    v.note('mini player present after hops: ' + JSON.stringify(hops));
    if (hops.some(h => !h[1])) bad.push('mini player vanished during navigation ' + JSON.stringify(hops));
    await v.burst('player-controls', { frames: 3, gap: 120, locator: '.mini-player', dynamic: true });
    v.note('mini player after nav: ' + JSON.stringify(await mpStyle()));
    await fontReport(v, '.mini-player button, .mini-player .mp-title', 'mini player');
    const mb = await page.locator('.mini-player').boundingBox();
    if (mb.x < -1 || mb.x + mb.width > page.viewportSize().width + 1) bad.push('mini player off-screen');
    v.step('mini player across navigation');
    // Scroll-to-top: make a long owner profile
    await v.goto('/robots.txt');
    const ids = [];
    for (let i = 1; i <= 7; i++) {
      const doc = JSON.stringify({ root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', version: 1, text: 'filler ' + i + ' '.repeat(1) + 'lorem ipsum dolor sit amet', detail: 0, format: 0, mode: 'normal', style: '' }] }] } });
      const c = await v.api('POST', '/api/posts', { title: 'Gate filler ' + i, description: doc, published: true, summary: null, section: 'profile' });
      if (c.status === 201) ids.push(Number(c.text));
    }
    v.onCleanup(async () => { for (const id of ids) await v.api('DELETE', '/api/posts/' + id); });
    await v.goto('/vt4');
    const btn = page.locator('button:text-is("+ New grid post"), a:text-is("+ New grid post")').first();
    v.note('filler posts: ' + ids.length + '; New grid post present: ' + await btn.count());
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    for (const where of ['bottom', 'mid']) {
      await page.evaluate(w => window.scrollTo({ top: w === 'bottom' ? document.documentElement.scrollHeight : 400, behavior: 'instant' }), where);
      await sleep(600);
      const st = await page.locator('.scroll-to-top').count();
      const geo = await page.evaluate(() => { const q = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), r: Math.round(r.right), b: Math.round(r.bottom) }; }; return { stt: q('.scroll-to-top'), grid: [...document.querySelectorAll('button')].filter(b => b.innerText.trim() === '+ New grid post').map(b => { const r = b.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), r: Math.round(r.right), b: Math.round(r.bottom) }; })[0] || null, mini: q('.mini-player') }; });
      v.note('scroll ' + where + ' ' + JSON.stringify(geo));
      await v.shot('scroll-' + where, { dynamic: true, keepPointer: true });
      const g = geo.grid, s = geo.stt;
      if (s && g && !(s.r < g.x || s.x > g.r || s.b < g.y || s.y > g.b)) bad.push('scroll-to-top covers + New grid post at ' + where);
    }
    // grid button scrolled into view with the arrow near it
    if (await btn.count()) {
      await btn.scrollIntoViewIfNeeded(); await sleep(700);
      const geo = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === '+ New grid post'); const r = b.getBoundingClientRect(); const s = document.querySelector('.scroll-to-top'); const sr = s && s.getBoundingClientRect(); return { grid: [r.x, r.y, r.right, r.bottom].map(Math.round), stt: sr ? [sr.x, sr.y, sr.right, sr.bottom].map(Math.round) : null }; });
      v.note('grid button in view: ' + JSON.stringify(geo));
      await v.shot('scroll-gridbtn', { dynamic: true, keepPointer: true });
      if (geo.stt) { const [gx, gy, gr, gb] = geo.grid, [sx, sy, sr, sb] = geo.stt; if (!(sr < gx || sx > gr || sb < gy || sy > gb)) bad.push('scroll-to-top covers + New grid post when it is in view'); }
    }
    // editor
    await v.goto('/editor');
    const ce = page.locator('[contenteditable=true]').last();
    await v.click(ce);
    for (let i = 0; i < 45; i++) await page.keyboard.press('Enter');
    await page.evaluate(() => window.scrollTo({ top: 1500, behavior: 'instant' })); await sleep(700);
    const inEditor = await page.locator('.scroll-to-top').count();
    v.note('scroll-to-top in editor: ' + inEditor + ' (scrollY ' + await page.evaluate(() => scrollY) + ')');
    await v.shot('scroll-editor', { dynamic: true, keepPointer: true });
    if (inEditor) bad.push('scroll-to-top shows in the editor');
    if (bad.length) throw new Error(bad.join('; '));
  },
};
