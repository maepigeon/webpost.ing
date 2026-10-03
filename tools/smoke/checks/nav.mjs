import { check, login, assert, noHorizontalScroll, waitForIdle } from '../lib.mjs';

check('nav: account menu lists My Profile, Settings, Log Out', async t => {
  const { page } = t;
  await login(page, 'test');
  await page.goto('/');
  await page.getByRole('button', { name: /Account menu for test/ }).click();
  for (const name of ['My Profile', 'Settings', 'Log Out'])
    await page.getByRole('menuitem', { name }).waitFor();
  await page.keyboard.press('Escape');
  assert(await page.getByRole('menuitem', { name: 'Settings' }).count() === 0, 'Escape did not close the account menu');
}, { area: 'nav' });

check('nav: phone width has a working More menu and no sideways scroll', async t => {
  const page = await t.newUser('test', { width: 390, height: 844 });
  const bad = [];
  for (const url of ['/', '/test', '/settings', '/messages']) {
    await page.goto(url);
    await waitForIdle(page);
    if (!await noHorizontalScroll(page)) bad.push(url);
  }
  assert(!bad.length, `page scrolls sideways at 390px: ${bad.join(', ')}`);
  await page.goto('/');
  const more = page.getByRole('button', { name: /^More/ });
  await more.waitFor();
  await more.click();
  await page.getByRole('menu', { name: /More/ }).waitFor();
  assert(await page.getByRole('menuitem').count() > 0, 'More menu is empty');
}, { area: 'nav' });
