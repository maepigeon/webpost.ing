// Flow 4: top bar. Account menu and More menu open and close, at both sizes.
import { sleep } from '../lib.mjs';

export default {
  name: 'topbar',
  async run(v) {
    const { page } = v;
    await v.login('test');
    await v.goto('/');
    await v.shot('home-bar', { locator: 'nav, header' });

    // Account menu
    const acct = page.getByRole('button', { name: /Account menu for test/ });
    await v.click(acct);
    await page.getByRole('menuitem', { name: 'Settings' }).waitFor();
    v.step('account menu opens');
    await v.burst('account-open', { frames: 5, gap: 70 });
    const items = await page.getByRole('menuitem').allInnerTexts();
    v.note('account menu items: ' + items.join(' | '));
    const menu = page.getByRole('menu').first();
    const box = await menu.boundingBox();
    const vw = page.viewportSize().width;
    if (box.x < 0 || box.x + box.width > vw) throw new Error(`account menu is off-screen: x=${box.x} w=${box.width} viewport=${vw}`);
    await page.keyboard.press('Escape');
    await sleep(250);
    if (await page.getByRole('menuitem', { name: 'Settings' }).count()) throw new Error('Escape did not close the account menu');
    v.step('account menu closes (Escape)');
    await v.shot('account-closed', { locator: 'nav, header' });

    // open again, close by clicking elsewhere
    await v.click(acct);
    await page.getByRole('menuitem', { name: 'Settings' }).waitFor();
    await page.mouse.move(vw / 2, 600, { steps: 6 });
    await page.mouse.click(vw / 2, 600);
    await sleep(300);
    if (await page.getByRole('menuitem', { name: 'Settings' }).count()) throw new Error('clicking outside did not close the account menu');
    v.step('account menu closes (click outside)');

    // More menu
    const more = page.getByRole('button', { name: /^More/ });
    if (await more.count()) {
      await v.click(more.first());
      await page.getByRole('menu', { name: /More/ }).waitFor();
      v.step('More menu opens');
      await v.burst('more-open', { frames: 5, gap: 70 });
      const mi = await page.getByRole('menu', { name: /More/ }).getByRole('menuitem').allInnerTexts();
      v.note('More items: ' + mi.join(' | '));
      const mb = await page.getByRole('menu', { name: /More/ }).boundingBox();
      if (mb.x < 0 || mb.x + mb.width > vw) throw new Error(`More menu is off-screen: x=${mb.x} w=${mb.width}`);
      await page.keyboard.press('Escape');
      await sleep(250);
      if (await page.getByRole('menu', { name: /More/ }).count()) throw new Error('Escape did not close the More menu');
      v.step('More menu closes');
      await v.shot('more-closed', { locator: 'nav, header' });
    } else {
      v.note('no More button at this size');
    }
    if (!await v.noSideScroll()) throw new Error('page scrolls sideways');
  },
};
