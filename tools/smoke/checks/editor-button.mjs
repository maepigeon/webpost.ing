import { check, login, assert, uniq, deletePostsTitled, findPostId, openSection, openEditor } from '../lib.mjs';

check('editor-button: insert a Button block, site path, save, viewer shows a link', async t => {
  const { page } = t;
  await login(page, 'test');
  const title = uniq('smoke button');
  t.onCleanup(() => deletePostsTitled(page, 'test', 'smoke button'));

  await openEditor(page);
  await page.locator('.title-input').fill(title);
  await page.locator('.editor-contenteditable').first().click();
  await page.keyboard.type('Press the button below.');
  await openSection(page, 'Insert');
  await page.getByRole('button', { name: 'Button', exact: true }).click();

  // A new button opens its own form.
  const form = page.locator('.pb-form');
  await form.waitFor();
  await form.getByPlaceholder('What the button says').fill('Go to my profile');
  await form.getByRole('button', { name: 'Open one of my posts' }).click();
  await form.getByPlaceholder('/name/post').fill('/test');
  assert(await page.locator('.pb-problem').count() === 0, 'a plain site path "/test" is called a problem');

  await page.getByRole('button', { name: 'Publish' }).click();
  await page.getByText(/Published|your post is live/).first().waitFor();
  const id = await findPostId(page, 'test', title);
  assert(id, 'the post with a button did not save');

  await page.goto('/test/' + id);
  const link = page.locator('a.pb').first();
  await link.waitFor();
  assert((await link.innerText()).includes('Go to my profile'), 'the button in the viewer has the wrong label');
  assert(await link.getAttribute('href') === '/test', `the viewer button points at ${await link.getAttribute('href')}, not /test`);
  await link.click();
  await page.waitForURL(u => new URL(u).pathname === '/test');
}, { area: 'editor-button' });
