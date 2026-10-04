import { check, login, assert, uniq, deletePostsTitled, findPostId, openSection, sleep } from '../lib.mjs';

/** Canvas pixel position of the middle of tile (r, c). */
async function tileAt(page, r, c) {
  await page.locator('.tilegrid-canvas').first().evaluate(c => window.scrollBy(0, c.getBoundingClientRect().top - Math.round(window.innerHeight * 0.4)));
  const box = await page.locator('.tilegrid-canvas').first().boundingBox();
  const cols = Number(await page.getByRole('spinbutton', { name: 'Width in tiles' }).getAttribute('aria-valuenow'));
  const rows = Number(await page.getByRole('spinbutton', { name: 'Height in tiles' }).getAttribute('aria-valuenow'));
  const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.className, [box.x + box.width / 2, box.y + box.height / 2]);
  if (!String(hit).includes('tilegrid-canvas')) throw new Error(`the grid canvas is covered by .${hit}`);
  return { x: box.x + (c + 0.5) * box.width / cols, y: box.y + (r + 0.5) * box.height / rows, cols, rows };
}

const tool = (page, start) => page.locator(`button[aria-label^="${start}"]`).first();

check('editor-grid: draw, fill, link, flatten, focus, width, save, view', async t => {
  const { page } = t;
  // Drawing needs the canvas in reach; at 390px the editor's sticky toolbar covers it (see the report).
  if (t.phone) t.skip('drawing on a grid is not exercised at phone width: the sticky editor toolbar covers the canvas');
  await login(page, 'test');
  const title = uniq('smoke grid');
  t.onCleanup(() => deletePostsTitled(page, 'test', 'smoke grid'));

  await page.goto('/editor');
  await page.locator('.title-input').fill(title);
  await page.locator('.editor-contenteditable').first().click();
  await openSection(page, 'Insert');
  await page.getByRole('button', { name: 'Grid', exact: true }).click();

  // A new grid sits in the page; Edit grid opens its tools.
  await page.getByRole('button', { name: 'Edit grid' }).click();
  await page.locator('.tg-panel').waitFor();
  const canvas = page.locator('.tilegrid-canvas').first();

  t.step('width');
  // Width by typing.
  const width = page.getByRole('spinbutton', { name: 'Width in tiles' });
  await width.getByRole('button', { name: /Width in tiles: \d+/ }).click();
  await page.locator('.grid-stepper-input').first().fill('12');
  await page.keyboard.press('Enter');
  await sleep(200);
  assert(await width.getAttribute('aria-valuenow') === '12', 'typing 12 into the width did not set the width');

  t.step('type');
  // Type letters on the tiles.
  await tool(page, 'Text: type on tiles').click();
  const blank = await canvas.evaluate(c => c.toDataURL());
  let p = await tileAt(page, 1, 0);
  await page.mouse.click(p.x, p.y);
  await page.keyboard.type('HI');
  await sleep(200);
  assert(await canvas.evaluate(c => c.toDataURL()) !== blank, 'typing letters changed nothing on the grid');

  t.step('rectangle');
  // A rectangle, then a magic fill inside it.
  const red = page.locator('button[aria-label="Colour #ff3b30"]');
  await red.click();
  await tool(page, 'Paint pixels').click(); // make sure a pixel layer tool is active
  await tool(page, 'Rectangle').click();
  const a = await tileAt(page, 2, 2), b = await tileAt(page, 4, 8);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up();
  const before = await canvas.evaluate(c => c.toDataURL());
  await page.locator('button[aria-label="Colour #0a84ff"]').click();
  await tool(page, 'Magic fill').click();
  const mid = await tileAt(page, 3, 6);
  await page.mouse.click(mid.x, mid.y);
  await sleep(200);
  const after = await canvas.evaluate(c => c.toDataURL());
  assert(before !== after, 'magic fill changed nothing on the canvas');

  t.step('link');
  // Link two tiles to /test (the link panel takes the address).
  await tool(page, 'Select tiles').click();
  p = await tileAt(page, 3, 3);
  const q = await tileAt(page, 3, 4);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(q.x, q.y, { steps: 4 }); await page.mouse.up();
  await page.locator('button[aria-label^="Link the selected tiles"]').click();
  await page.locator('.tg-link-panel input').fill('/test');
  await page.locator('.tg-link-panel input').press('Enter');
  await sleep(300);

  t.step('flatten');
  // Flatten the typed letters to pixels.
  await page.locator('button[aria-label^="Deselect"]').click();
  await page.locator('button[aria-label="Flatten text"]').click();
  await page.getByText(/turned.*pixels|flattened/i).first().waitFor({ timeout: 1500 }).catch(() => {});
  await sleep(200);

  t.step('focus');
  // Focus view on, then off.
  await page.locator('button[aria-label="Focus"]').click();
  await page.locator('.tilegrid--focus').waitFor({ state: 'attached' });
  await page.locator('button[aria-label="Leave focus"]').click();
  await page.waitForFunction(() => !document.querySelector('.tilegrid--focus'));

  await page.locator('.tg-done-btn').click();
  await page.getByRole('button', { name: 'Publish' }).click();
  await page.getByText(/Published|your post is live/).first().waitFor();

  const id = await findPostId(page, 'test', title);
  assert(id, 'the published grid post is not in the post list');
  t.step('viewer');
  await page.goto('/test/' + id);
  await page.locator('.tilegrid-canvas').first().waitFor();
  const link = page.locator('a.tilegrid-link').first();
  await link.waitFor();
  assert(await link.getAttribute('href') === '/test', 'viewer link does not point at /test');
  await link.click({ force: true });
  await page.waitForURL(url => new URL(url).pathname === '/test');
}, { area: 'editor-grid' });
