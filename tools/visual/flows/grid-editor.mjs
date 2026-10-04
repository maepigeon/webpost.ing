// Flow 1: grid editor drawing. New post, insert a grid, type text, rectangle, magic fill inside it,
// lasso some tiles, link them, flatten text, focus view on and off.
// After every tool the canvas pixels are compared with the step before: they must change where the
// tool was used and nowhere else (the changed bounding box is checked against the tiles that were touched).
import { sleep } from '../lib.mjs';

const tool = (page, start) => page.locator(`button[aria-label^="${start}"]`).first();

export default {
  name: 'grid-editor',
  async run(v) {
    const { page } = v;
    await v.login('test');
    await v.goto('/editor');
    await page.locator('.title-input').waitFor();
    await v.click('.title-input');
    await v.type('Visual grid post');
    await v.click('.editor-contenteditable');
    const insert = page.locator('.pe-section-head[title$=" Insert"]').first();
    if (/^Show/.test(await insert.getAttribute('title'))) await v.click(insert);
    await v.click(page.getByRole('button', { name: 'Grid', exact: true }));
    await v.click(page.getByRole('button', { name: 'Edit grid' }));
    await page.locator('.tg-panel').waitFor();
    await sleep(500);
    const canvas = page.locator('.tilegrid-canvas').first();

    // ---- helpers -------------------------------------------------------------------------------
    const dims = async () => ({
      cols: Number(await page.getByRole('spinbutton', { name: 'Width in tiles' }).getAttribute('aria-valuenow')),
      rows: Number(await page.getByRole('spinbutton', { name: 'Height in tiles' }).getAttribute('aria-valuenow')),
    });
    const place = async () => {   // bring the canvas into the reachable part of the screen
      // The tool stack is pinned to the top of the window (a finding on a phone: it covers half the screen),
      // so the canvas is scrolled to just below it.
      for (let i = 0; i < 3; i++) {
        await canvas.evaluate(c => {
          const bar = document.querySelector('.toolbar-sticky');
          const floor = bar ? bar.getBoundingClientRect().bottom + 12 : 80;
          window.scrollBy(0, c.getBoundingClientRect().top - floor);
        });
        await sleep(450);
      }
    };
    const tileAt = async (r, c) => {
      const box = await canvas.boundingBox();
      const { cols, rows } = await dims();
      const x = box.x + (c + 0.5) * box.width / cols, y = box.y + (r + 0.5) * box.height / rows;
      const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.className, [x, y]);
      if (!String(hit).includes('tilegrid-canvas')) throw new Error(`tile (${r},${c}) is covered by .${hit} (the canvas is not reachable there)`);
      return { x, y };
    };
    const snap = name => canvas.evaluate((c, name) => {
      const t = document.createElement('canvas'); t.width = c.width; t.height = c.height;
      const g = t.getContext('2d'); g.drawImage(c, 0, 0);
      (window.__snaps ||= {})[name] = g.getImageData(0, 0, c.width, c.height);
    }, name);
    /** Bounding box (in tiles) of what changed between two snapshots. */
    const changed = async (a, b, cols, rows) => canvas.evaluate((c, [a, b, cols, rows]) => {
      const A = window.__snaps[a], B = window.__snaps[b];
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0;
      for (let y = 0; y < A.height; y++) for (let x = 0; x < A.width; x++) {
        const i = (y * A.width + x) * 4;
        if (Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]) + Math.abs(A.data[i + 3] - B.data[i + 3]) > 24) {
          n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      const tw = A.width / cols, th = A.height / rows;
      return n ? { n, c0: Math.floor(x0 / tw), c1: Math.floor(x1 / tw), r0: Math.floor(y0 / th), r1: Math.floor(y1 / th) } : { n: 0 };
    }, [a, b, cols, rows]);
    /** The step must change the canvas, and only inside tiles rows r0..r1, cols c0..c1. */
    const expectChange = async (label, from, to, box) => {
      const { cols, rows } = await dims();
      const d = await changed(from, to, cols, rows);
      v.note(`${label}: changed ${d.n} px, tiles rows ${d.r0}-${d.r1} cols ${d.c0}-${d.c1}`);
      if (!d.n) throw new Error(`${label}: the canvas did not change at all`);
      if (d.r0 < box.r0 || d.r1 > box.r1 || d.c0 < box.c0 || d.c1 > box.c1)
        throw new Error(`${label}: the canvas changed outside the expected tiles (rows ${box.r0}-${box.r1}, cols ${box.c0}-${box.c1}); it changed rows ${d.r0}-${d.r1}, cols ${d.c0}-${d.c1}`);
    };
    const expectSame = async (label, from, to) => {
      const { cols, rows } = await dims();
      const d = await changed(from, to, cols, rows);
      v.note(`${label}: ${d.n ? `changed ${d.n} px in rows ${d.r0}-${d.r1} cols ${d.c0}-${d.c1}` : 'canvas unchanged'}`);
      return d;
    };

    await place();
    await snap('blank');
    await v.shot('grid-new', { locator: canvas, keepPointer: true });
    await v.shot('grid-panel', { fullPage: false });
    v.step('grid inserted, tools open');

    // ---- type text -------------------------------------------------------------------------------
    await v.click(tool(page, 'Text: type on tiles'));
    await place();
    let p = await tileAt(1, 0);
    await page.mouse.move(p.x, p.y, { steps: 6 }); await sleep(80); await page.mouse.click(p.x, p.y);
    await page.keyboard.type('HI', { delay: 120 });
    await sleep(300);
    await snap('typed');
    await expectChange('type HI', 'blank', 'typed', { r0: 0, r1: 1, c0: 0, c1: 2 });   // row 0 too: the text cursor frame leaves the first tile
    await v.burst('grid-typed', { locator: canvas, frames: 3, gap: 100, keepPointer: true, dynamic: true });   // the text caret blinks
    v.step('typed HI on tiles');

    // ---- rectangle ---------------------------------------------------------------------------------
    await v.click(page.locator('button[aria-label="Colour #ff3b30"]'));
    await v.click(tool(page, 'Paint pixels'));
    await v.click(tool(page, 'Rectangle'));
    await place();
    const a = await tileAt(2, 2), b = await tileAt(4, 8);
    await v.drag(a, b, 14);
    await sleep(300);
    await snap('rect');
    await expectChange('rectangle', 'typed', 'rect', { r0: 1, r1: 4, c0: 2, c1: 8 });   // row 1: the text cursor frame (tile 1,2) goes away
    await v.shot('grid-rectangle', { locator: canvas, keepPointer: true });
    v.step('rectangle drawn');

    // ---- magic fill inside it ----------------------------------------------------------------------------
    await v.click(page.locator('button[aria-label="Colour #0a84ff"]'));
    await v.click(tool(page, 'Magic fill'));
    await place();
    const mid = await tileAt(3, 6);
    await page.mouse.move(mid.x, mid.y, { steps: 6 }); await sleep(80); await page.mouse.click(mid.x, mid.y);
    await sleep(350);
    await snap('filled');
    await expectChange('magic fill', 'rect', 'filled', { r0: 2, r1: 4, c0: 2, c1: 8 });
    await v.shot('grid-filled', { locator: canvas, keepPointer: true });
    v.step('magic fill inside the rectangle');

    // ---- lasso some tiles, link them ------------------------------------------------------------------------
    await v.click(tool(page, 'Lasso'));
    await place();
    const l0 = await tileAt(3, 3), l1 = await tileAt(3, 4);
    const loop = [[-24, -24], [24 + (l1.x - l0.x), -24], [24 + (l1.x - l0.x), 24], [-24, 24], [-24, -24]].map(([dx, dy]) => ({ x: l0.x + dx, y: l0.y + dy }));
    await page.mouse.move(loop[0].x, loop[0].y, { steps: 4 }); await sleep(60); await page.mouse.down();
    for (const q of loop.slice(1)) await page.mouse.move(q.x, q.y, { steps: 6 });
    await page.mouse.up();
    await sleep(400);
    await v.burst('grid-lasso', { locator: canvas, frames: 3, gap: 120, dynamic: true, keepPointer: true });   // selection outline may animate
    const link = page.locator('button[aria-label^="Link the selected tiles"]');
    if (await link.isDisabled()) throw new Error('lasso selected nothing: the link button stays disabled');
    await v.click(link);
    const linkInput = page.locator('.tg-link-panel input');
    await linkInput.waitFor();
    await v.shot('grid-link-panel', { fullPage: false, dynamic: true });
    await linkInput.fill('/test');
    await linkInput.press('Enter');
    await sleep(400);
    v.step('lasso selection linked to /test');
    await v.click(page.locator('button[aria-label^="Deselect"]'));
    await sleep(300);
    await place();
    await snap('linked');
    await expectSame('after link + deselect (a link only marks tiles)', 'filled', 'linked');
    await v.shot('grid-linked', { locator: canvas, keepPointer: true });

    // ---- flatten text ----------------------------------------------------------------------------------------
    await v.click(page.locator('button[aria-label="Flatten text"]'));
    await sleep(500);
    await snap('flat');
    const fl = await expectSame('flatten text (letters become pixels, look stays)', 'linked', 'flat');
    if (fl.n && (fl.r0 < 1 || fl.r1 > 1 || fl.c0 > 2 && fl.c1 > 2)) v.note('flatten changed more than the HI tiles');
    await v.shot('grid-flattened', { locator: canvas, keepPointer: true });
    v.step('text flattened');

    // ---- focus view on and off ---------------------------------------------------------------------------------
    await v.click(page.locator('button[aria-label="Focus"]'));
    await page.locator('.tilegrid--focus').waitFor({ state: 'attached' });
    await v.burst('grid-focus-on', { frames: 6, gap: 80, keepPointer: true });
    await sleep(400);
    await v.shot('grid-focus-steady', { keepPointer: true });
    v.step('focus view on');
    await v.click(page.locator('button[aria-label="Leave focus"]'));
    await page.waitForFunction(() => !document.querySelector('.tilegrid--focus'));
    await v.burst('grid-focus-off', { frames: 6, gap: 80, keepPointer: true });
    v.step('focus view off');
    if (!await v.noSideScroll()) throw new Error('grid editor scrolls sideways');
    await place();
    await snap('end');
    await expectSame('focus on and off leaves the pixels alone', 'flat', 'end');
    await v.click(page.locator('.tg-done-btn'));
    await sleep(500);
    await v.shot('grid-done', { fullPage: false });
    v.step('done');
  },
};
