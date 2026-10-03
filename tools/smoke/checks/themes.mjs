import { check, login, assert, uniq, createDraftPost, api, sleep, openEditor, openSection } from '../lib.mjs';

const cardVar = page => page.evaluate(() => document.documentElement.style.getPropertyValue('--th-card-background'));

async function until(fn, ms = 6000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(150); }
  return null;
}

check('themes: Customize lists presets', async t => {
  const { page } = t;
  await login(page, 'test');
  await page.goto('/customize');
  const gallery = page.locator('.theme-gallery');
  await gallery.waitFor();
  const text = await gallery.innerText();
  for (const label of ['Newspaper Life', 'Sticky Pad', 'Notebook'])
    assert(text.includes(label), `preset "${label}" is not listed on Customize`);
  assert(await gallery.locator('.theme-gallery-item').count() >= 5, 'fewer than five presets listed');
}, { area: 'themes' });

check('themes: a post theme reaches the post page and its editor', async t => {
  const { page } = t;
  await login(page, 'test');
  const id = await createDraftPost(page, { title: uniq('smoke theme'), published: true }, t);
  const put = await api(page, 'PUT', `/api/posts/${id}/theme`, {
    theme: { preset: 'custom', card: { bg: '#ff00aa', opacity: 1, border: 'rule', borderColor: '#111111', radius: 4, shadow: 'none' } },
  });
  assert(put.status === 200, `setting the post theme: HTTP ${put.status} ${put.text.slice(0, 100)}`);

  await page.goto(`/test/${id}`);
  await page.locator('h1').first().waitFor();
  assert(await until(async () => /255,\s*0,\s*170/.test(await cardVar(page))), 'the post page does not use the post theme card colour');

  await page.goto(`/editor/${id}`);
  await page.locator('.title-input').waitFor();
  assert(await until(async () => /255,\s*0,\s*170/.test(await cardVar(page))), 'the post editor does not show the post theme card colour');

  // Back to the site default; the page follows.
  const back = await api(page, 'PUT', `/api/posts/${id}/theme`, { theme: null });
  assert(back.status === 200, 'could not restore the default post theme');
  await page.goto(`/test/${id}`);
  await page.locator('h1').first().waitFor();
  await sleep(500);
  assert(!/255,\s*0,\s*170/.test(await cardVar(page)), 'the post page kept the theme after it was removed');
}, { area: 'themes' });

/** The card colour once the page has stopped changing it (the theme arrives after the first paint). */
async function settledCard(page) {
  let last = '', same = 0;
  const end = Date.now() + 8000;
  while (Date.now() < end && same < 4) {
    const v = await cardVar(page);
    same = v && v === last ? same + 1 : 0;
    last = v;
    await sleep(150);
  }
  return last;
}

check('themes: choosing a preset in a post\'s editor changes its card colour in the editor and the viewer', async t => {
  const { page } = t;
  await login(page, 'test');
  const id = await createDraftPost(page, { title: uniq('smoke preset'), published: true }, t);
  // Back to the site default whatever happens below.
  t.onCleanup(() => api(page, 'PUT', `/api/posts/${id}/theme`, { theme: null }));

  await openEditor(page, id);
  const before = await settledCard(page);
  await openSection(page, 'Page');
  await page.getByRole('button', { name: 'Theme', exact: true }).click();
  const gallery = page.locator('.post-theme-panel .theme-gallery');
  await gallery.waitFor();
  await gallery.locator('.theme-gallery-item', { hasText: 'Neon Terminal' }).click();
  const saved = page.waitForResponse(r => r.request().method() === 'PUT' && /\/theme$/.test(r.url()));
  await page.getByRole('button', { name: 'Save theme' }).click();
  assert((await saved).status() === 200, 'saving the post theme from the editor failed');
  await page.getByRole('button', { name: 'Done' }).click();

  const editor = await settledCard(page);
  assert(editor && editor !== before, `the editor's card colour did not change after choosing a preset (still "${before}")`);

  await page.goto(`/test/${id}`);
  await page.locator('h1').first().waitFor();
  const viewer = await settledCard(page);
  assert(viewer === editor, `the viewer's card colour ("${viewer}") differs from the editor's ("${editor}")`);

  const back = await api(page, 'PUT', `/api/posts/${id}/theme`, { theme: null });
  assert(back.status === 200, 'could not restore the default post theme');
  await page.goto(`/test/${id}`);
  await page.locator('h1').first().waitFor();
  const restored = await settledCard(page);
  assert(restored !== viewer, 'the post page kept the preset after the theme was removed');
}, { area: 'themes' });
