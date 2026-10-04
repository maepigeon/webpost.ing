import { check, login, assert, waitForIdle } from '../lib.mjs';

check('auth: wrong password, sign in, sign out', async t => {
  const { page } = t;
  // A made-up name, so the failure never counts against a real test account.
  await page.goto('/routes/Login');
  await page.fill('#username', 'smoke-nobody');
  await page.fill('#password', 'not-the-password');
  await page.click('button[type=submit]');
  await page.locator('.login-error').waitFor();
  assert(/incorrect|invalid|failed|try again/i.test(await page.locator('.login-error').innerText()), 'wrong password shows no readable message');
  assert(page.url().includes('/routes/Login'), 'left the sign-in page after a wrong password');

  await page.fill('#username', 'test');
  await page.fill('#password', 'test');
  await page.click('button[type=submit]');
  await page.waitForURL('**/test', { waitUntil: 'commit' });
  await page.getByRole('button', { name: /Account menu for test/ }).waitFor();

  await page.getByRole('button', { name: /Account menu for test/ }).click();
  await page.getByRole('menuitem', { name: 'Log Out' }).click();
  await page.getByRole('button', { name: /Yes, sign out/ }).click();
  await page.getByRole('link', { name: 'Log In' }).first().waitFor({ timeout: 10000 });
  assert(await page.getByRole('button', { name: /Account menu/ }).count() === 0, 'account menu still shown after Log Out');
}, { area: 'auth' });

check('auth: signed-out visitor sees Log In', async t => {
  const page = await t.visitor();
  await page.goto('/');
  await page.getByRole('link', { name: 'Log In' }).first().waitFor();
}, { area: 'auth' });

check('auth: signed-out visitor cannot save from the editor silently', async t => {
  const page = await t.visitor();
  await page.goto('/editor');
  await page.locator('.title-input').waitFor();
  await page.locator('.title-input').fill('smoke visitor post');
  await page.locator('.editor-contenteditable').first().click();
  await page.keyboard.type('hello');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await page.waitForTimeout(1500);
  const sentAway = /Login|Logout/.test(page.url());
  const told = /sign in|log in|logged in|not signed|session/i.test(await page.locator('body').innerText());
  assert(sentAway || told, 'a signed-out visitor pressed Save draft and nothing told them to sign in');
}, { area: 'auth' });
