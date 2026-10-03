import { findPostId, valueBecomes, textBecomes, check, login, assert, uniq, deletePostsTitled, api, waitForIdle } from '../lib.mjs';

check('editor-text: write, save draft, reload, publish, see on profile', async t => {
  const { page } = t;
  await login(page, 'test');
  const title = uniq('smoke text');
  const body = 'Smoke body ' + Date.now();
  const blurb = 'Smoke description line';
  t.onCleanup(() => deletePostsTitled(page, 'test', 'smoke text'));

  await page.goto('/editor');
  await page.locator('.title-input').fill(title);
  await page.locator('.post-summary-input').fill(blurb);
  await page.locator('.editor-contenteditable').first().click();
  await page.keyboard.type(body);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await page.getByText(/Draft saved/).first().waitFor();
  const id = await findPostId(page, 'test', title);
  assert(id, 'the saved draft is not in the user\'s post list');

  await page.goto('/editor/' + id);
  await page.locator('.editor-contenteditable').first().waitFor();
  assert(await valueBecomes(page.locator('.title-input'), title), 'title missing after reload');
  assert(await valueBecomes(page.locator('.post-summary-input'), blurb), 'description missing after reload');
  assert(await textBecomes(page.locator('.editor-contenteditable').first(), body), 'text missing after reload');

  await page.getByRole('button', { name: 'Publish' }).click();
  await page.getByText(/Published|your post is live/).first().waitFor();

  await page.goto('/test');
  const card = page.getByText(title).first();
  await card.waitFor();
  await page.getByText(blurb).first().waitFor();

  // The reader sees the text.
  await card.click();
  await page.getByText(body).first().waitFor();
  assert((await page.locator('h1').first().innerText()).includes(title), 'post page has no title heading');
}, { area: 'editor-text' });

check('editor-text: reload right after the first save stays on that post', async t => {
  const { page } = t;
  await login(page, 'test');
  const title = uniq('smoke text reload');
  t.onCleanup(() => deletePostsTitled(page, 'test', 'smoke text reload'));
  await page.goto('/editor');
  await page.locator('.title-input').fill(title);
  await page.locator('.editor-contenteditable').first().click();
  await page.keyboard.type('reload me');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await page.getByText(/Draft saved/).first().waitFor();
  await page.reload();
  await page.locator('.title-input').waitFor();
  assert(await valueBecomes(page.locator('.title-input'), title, 3000),
    'after Save draft on a new post, reloading shows a blank new post (URL stays /editor), so the next save would make a duplicate');
}, { area: 'editor-text' });
