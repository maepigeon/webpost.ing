import { check, login, assert, uniq, createDraftPost, textBecomes, valueBecomes, sleep } from '../lib.mjs';

const bar = page => page.locator('.draft-found');

check('autosave: Restore brings text back, Discard clears it', async t => {
  const { page } = t;
  await login(page, 'test');
  const text = 'autosave text ' + Date.now();
  await page.goto('/editor');
  await page.locator('.title-input').fill('smoke autosave');
  await page.locator('.editor-contenteditable').first().click();
  await page.keyboard.type(text);
  await page.getByText(/Saved on this device/).first().waitFor();
  t.onCleanup(() => page.evaluate(() => { try { localStorage.clear(); } catch { /* */ } }).catch(() => {}));

  await page.reload();
  await bar(page).waitFor();
  assert(/Unsaved changes/.test(await bar(page).innerText()), 'the restore bar has no explanation');
  await bar(page).getByRole('button', { name: 'Restore' }).click();
  assert(await textBecomes(page.locator('.editor-contenteditable').first(), text), 'Restore did not bring the text back');
  assert(await valueBecomes(page.locator('.title-input'), 'smoke autosave'), 'Restore did not bring the title back');

  // Discard: reload again (the restored text is a fresh unsaved change), then throw it away.
  await page.keyboard.type(' more');
  await page.getByText(/Saved on this device/).first().waitFor();
  await sleep(1800);
  await page.reload();
  await bar(page).waitFor();
  await bar(page).getByRole('button', { name: 'Discard' }).click();
  await bar(page).waitFor({ state: 'detached' });
  assert(!(await page.locator('.editor-contenteditable').first().innerText()).includes(text), 'text still there after Discard');
  await page.reload();
  await page.locator('.editor-contenteditable').first().waitFor();
  await sleep(800);
  assert(await bar(page).count() === 0, 'the restore bar came back after Discard');
}, { area: 'autosave' });

check('autosave: an untouched saved post shows no restore bar', async t => {
  const { page } = t;
  await login(page, 'test');
  const id = await createDraftPost(page, { title: uniq('smoke untouched'), paragraphs: ['nothing changed here'] }, t);
  await page.goto('/editor/' + id);
  assert(await textBecomes(page.locator('.editor-contenteditable').first(), 'nothing changed here'), 'post did not load');
  await sleep(2500);
  await page.goto('/editor/' + id);
  assert(await textBecomes(page.locator('.editor-contenteditable').first(), 'nothing changed here'), 'post did not load the second time');
  await sleep(1500);
  assert(await bar(page).count() === 0, 'a restore bar appeared for a post nobody changed');
}, { area: 'autosave' });
