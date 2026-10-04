// gate-editor: new grid post from the profile, every grid tool used on the canvas, sticky rows while the grid is open,
// "Save as font" field, first Publish of a grid post, Save changes, theme dialog (no blur).
import { sleep } from '../lib.mjs';

const me = 'test2';
const tool = (page, start) => page.locator(`button[aria-label^="${start}"]`).first();

export default {
  name: 'gate-editor-grid',
  async run(v) {
    const { page } = v;
    await v.login(me);
    const dialogs = [];
    page.on('dialog', d => { dialogs.push(d.type() + ':' + d.message().slice(0, 60)); d.dismiss().catch(() => {}); });
    let gid = null;
    const delAll = async () => {
      const ids = new Set(); if (gid) ids.add(gid);
      const m = page.url().match(/\/editor\/(\d+)/); if (m) ids.add(Number(m[1]));
      const r = await v.api('GET', `/api/user/${me}?limit=200&offset=0`).catch(() => null);
      const list = Array.isArray(r?.body) ? r.body : (r?.body?.posts || []);
      for (const p of list) if (/^Gate editor/.test(p.title || '')) ids.add(p.id);
      for (const id of ids) { const x = await v.api('DELETE', `/api/posts/${id}`); v.note(`cleanup DELETE ${id} -> ${x.status}`); }
    };
    await v.goto('/robots.txt'); await delAll();
    v.onCleanup(delAll);

    await v.goto('/' + me);
    await v.click(page.getByRole('button', { name: '+ New grid post' }));
    await page.waitForURL(/\/editor\/\d+/); gid = Number(page.url().match(/\/editor\/(\d+)/)[1]);
    await page.locator('.title-input').waitFor(); await sleep(1200);
    v.note('new grid post id ' + gid);
    await v.click('.title-input');
    await page.keyboard.press('Meta+a'); await page.keyboard.press('Control+a');
    await v.type('Gate editor grid post');
    await v.shot('grid-post-new', { fullPage: false, dynamic: true });

    const noBlur = async label => {
      const r = await page.evaluate(() => [...document.querySelectorAll('*')].filter(e => { const s = getComputedStyle(e); return (s.backdropFilter && s.backdropFilter !== 'none') || (s.webkitBackdropFilter && s.webkitBackdropFilter !== 'none') || /blur/.test(s.filter); }).map(e => e.tagName + '.' + String(e.className).slice(0, 40)));
      v.note(`blur scan (${label}): ${r.length ? JSON.stringify(r.slice(0, 6)) : 'none'}`);
    };
    await noBlur('grid post editor');

    // open the grid editor
    await v.click(page.getByRole('button', { name: 'Edit grid' }));
    await page.locator('.tg-panel').waitFor(); await sleep(600);
    const canvas = page.locator('.tilegrid-canvas').first();
    const stuck = () => page.evaluate(() => {
      const f = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return { top: Math.round(r.top), h: Math.round(r.height), pos: cs.position, disp: cs.display }; };
      return { scrollY: Math.round(scrollY), stack: f('.toolbar-stack'), panel: f('.pe-panel'), actions: f('.toolbar-actions'), tgpanel: f('.tg-panel'), canvas: f('.tilegrid-canvas') };
    });
    v.note('grid open, at top: ' + JSON.stringify(await stuck()));
    await v.shot('grid-open', { fullPage: false, dynamic: true });
    await page.mouse.move(150, 500); await page.mouse.wheel(0, 500); await sleep(600);
    v.note('grid open, scrolled: ' + JSON.stringify(await stuck()));
    await v.shot('grid-open-scrolled', { fullPage: false, dynamic: true });
    await noBlur('grid open');

    // ---- tools on the canvas ----------------------------------------------------------------------
    const dims = async () => ({
      cols: Number(await page.getByRole('spinbutton', { name: 'Width in tiles' }).getAttribute('aria-valuenow')),
      rows: Number(await page.getByRole('spinbutton', { name: 'Height in tiles' }).getAttribute('aria-valuenow')),
    });
    const place = async () => {
      for (let i = 0; i < 3; i++) {
        await canvas.evaluate(c => { const bar = document.querySelector('.toolbar-actions'); const floor = bar ? bar.getBoundingClientRect().bottom + 12 : 80; window.scrollBy(0, c.getBoundingClientRect().top - floor); });
        await sleep(450);
      }
    };
    const snap = name => canvas.evaluate((c, name) => { const t = document.createElement('canvas'); t.width = c.width; t.height = c.height; const g = t.getContext('2d'); g.drawImage(c, 0, 0); (window.__snaps ||= {})[name] = g.getImageData(0, 0, c.width, c.height); }, name);
    const diff = (a, b) => canvas.evaluate((c, [a, b]) => { const A = window.__snaps[a], B = window.__snaps[b]; let n = 0; for (let i = 0; i < A.data.length; i += 4) if (Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]) > 24) n++; return n; }, [a, b]);
    const tileAt = async (r, c) => { const box = await canvas.boundingBox(); const { cols, rows } = await dims(); const x = box.x + (c + 0.5) * box.width / cols, y = box.y + (r + 0.5) * box.height / rows; const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.className, [x, y]); if (!String(hit).includes('tilegrid-canvas')) throw new Error(`tile (${r},${c}) covered by .${hit}`); return { x, y }; };
    const results = [];
    let prev = 'blank'; await place(); await snap('blank');
    const use = async (label, start, fn) => {
      try {
        await v.click(tool(page, start)); await place();
        await fn(); await sleep(300);
        const key = 's' + results.length; await snap(key);
        const n = await diff(prev, key); prev = key; results.push(`${label}: ${n} px changed`);
      } catch (e) { results.push(`${label}: ERROR ${String(e.message).slice(0, 100)}`); }
    };
    const drag = async (r0, c0, r1, c1) => { const a = await tileAt(r0, c0), b = await tileAt(r1, c1); await v.drag(a, b, 12); };
    const clickTile = async (r, c) => { const p = await tileAt(r, c); await page.mouse.move(p.x, p.y, { steps: 5 }); await page.mouse.click(p.x, p.y); };
    await v.click(page.locator('button[aria-label="Colour #ff3b30"]'));
    await use('Paint pixels', 'Paint pixels', () => drag(0, 0, 1, 5));
    await use('Line', 'Line', () => drag(2, 0, 3, 7));
    await use('Rectangle', 'Rectangle', () => drag(4, 1, 6, 6));
    await v.click(page.locator('button[aria-label="Colour #0a84ff"]'));
    await use('Ellipse', 'Ellipse', () => drag(0, 8, 3, 13));
    await use('Paint tiles', 'Paint tiles', () => drag(5, 9, 5, 12));
    await v.click(page.locator('button[aria-label="Colour #34c759"]'));
    await use('Fill whole tiles', 'Fill whole tiles', () => clickTile(7, 14));
    await use('Magic fill', 'Magic fill', () => clickTile(5, 3));
    await use('Erase', 'Erase', () => drag(2, 0, 2, 4));
    await use('Text', 'Text: type on tiles', async () => { await clickTile(6, 9); await page.keyboard.type('Hi', { delay: 100 }); });
    await use('Select tiles', 'Select tiles', () => drag(0, 0, 1, 2));
    await use('Lasso', 'Lasso', async () => { const pts = [[3, 8], [3, 12], [4, 12], [4, 8], [3, 8]]; const p0 = await tileAt(...pts[0]); await page.mouse.move(p0.x, p0.y); await page.mouse.down(); for (const q of pts.slice(1)) { const p = await tileAt(...q); await page.mouse.move(p.x, p.y, { steps: 6 }); } await page.mouse.up(); });
    await use('Magic wand', 'Magic wand', () => clickTile(5, 3));
    await use('Move', 'Move', () => drag(5, 3, 6, 4));
    await use('Eyedropper', 'Eyedropper', () => clickTile(0, 0));
    v.note('tools: ' + results.join(' ; '));
    await place();
    await v.shot('grid-after-tools', { locator: canvas, keepPointer: true, dynamic: true });
    await v.shot('grid-after-tools-page', { fullPage: false, dynamic: true });
    v.step('every grid tool used');

    // ---- Save as font: in-page field ----------------------------------------------------------------
    await v.click(page.locator('button[aria-label^="Draw your own characters"]'));
    await sleep(800);
    const gd = page.getByRole('dialog', { name: 'Custom characters' });
    if (await gd.count()) {
      await gd.scrollIntoViewIfNeeded(); await sleep(500);
      await v.click(gd.locator('input.tilegrid-char')); await page.keyboard.type('A', { delay: 80 });
      const cells = gd.locator('.tilegrid-bitmap span');
      v.note('glyph bitmap cells: ' + await cells.count());
      for (const i of [40, 41, 56, 57, 72, 73, 88, 89]) { const c = cells.nth(i); await c.scrollIntoViewIfNeeded().catch(() => {}); const b = await c.boundingBox(); if (b) { await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 3 }); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); } }
      await sleep(300);
      await v.click(gd.getByRole('button', { name: /^Save .A.$/ })); await sleep(500);
      await v.shot('glyph-drawn', { fullPage: false, dynamic: true });
    }
    const saveBtn = page.getByRole('button', { name: /Save as font/ });
    v.note('glyph editor open: Save as font present=' + await saveBtn.count() + ' enabled=' + (await saveBtn.count() ? await saveBtn.first().isEnabled() : null));
    if (await saveBtn.count() && await saveBtn.first().isEnabled()) {
      await v.click(saveBtn.first()); await sleep(400);
      const f = page.locator('input.tilegrid-name'); const vis = await f.isVisible().catch(() => false);
      v.note('Save as font field in page: ' + vis + '; native dialogs: ' + JSON.stringify(dialogs));
      await v.shot('save-as-font-field', { fullPage: false, dynamic: true });
      if (vis) await page.keyboard.press('Escape');
    } else { await v.shot('glyph-editor', { fullPage: false, dynamic: true }); }
    await noBlur('glyph editor');

    // close the grid editor (Done), then first Publish
    const done = page.getByRole('button', { name: 'Done', exact: true });
    for (let i = 0; i < 2 && await done.count(); i++) { await v.click(done.first()); await sleep(500); }
    await page.evaluate(() => window.scrollTo(0, 0)); await sleep(500);
    await v.shot('before-publish', { fullPage: false, dynamic: true });
    await v.click(page.getByRole('button', { name: 'Publish', exact: true }));
    await page.getByText('Published.', { exact: false }).first().waitFor({ timeout: 8000 }).catch(() => v.note('no "Published." appeared'));
    await sleep(600);
    const state = async label => { const s = await page.evaluate(() => ({ btns: [...document.querySelectorAll('.toolbar-actions button')].map(b => b.innerText.trim()), status: [...document.querySelectorAll('.toolbar-actions [role=status], .toolbar-save-status')].map(e => e.innerText.trim()) })); v.note(label + ': ' + JSON.stringify(s)); return s; };
    const g1 = await state('grid post after Publish');
    await v.shot('grid-published', { fullPage: false, dynamic: true });
    const ok1 = ['Unpublish', 'Save changes'].every(t => g1.btns.includes(t)) && !g1.btns.includes('Publish');
    const srv1 = (await v.api('GET', `/api/posts/${gid}`)).body; v.note('server: published=' + srv1?.published);
    await v.click(page.getByRole('button', { name: 'Save changes', exact: true })); await sleep(1200);
    const g2 = await state('grid post after Save changes');
    const ok2 = ['Unpublish', 'Save changes'].every(t => g2.btns.includes(t)) && !g2.btns.includes('Publish');
    const srv2 = (await v.api('GET', `/api/posts/${gid}`)).body; v.note('server after Save changes: published=' + srv2?.published);
    v.step('grid post first Publish and Save changes');

    // ---- Theme dialog (dark post theme: strip, no blur) ----------------------------------------------
    await page.evaluate(() => window.scrollTo(0, 0)); await sleep(400);
    { const pg = page.locator('.pe-section-head[title$=" Page"]').first(); if (/^Show/.test(await pg.getAttribute('title').catch(() => '') || '')) await v.click(pg); }
    await v.click(page.getByRole('button', { name: 'Theme', exact: true }));
    await page.getByRole('dialog', { name: /Theme for this post/ }).waitFor({ timeout: 4000 }).catch(() => v.note('theme dialog did not open'));
    await sleep(800);
    await v.shot('theme-dialog', { fullPage: false, dynamic: true });
    await noBlur('theme dialog');
    await page.keyboard.press('Escape');
    const close = page.getByRole('button', { name: 'Done', exact: true }); if (await close.count()) await v.click(close.first());
    await sleep(500);
    if (!ok1) throw new Error('grid post: not in published state after first Publish: ' + JSON.stringify(g1));
    if (!ok2 || srv2?.published !== true) throw new Error('grid post: not published after Save changes: ' + JSON.stringify(g2));
    if (dialogs.length) throw new Error('native dialog(s): ' + dialogs.join(', '));
  },
};
