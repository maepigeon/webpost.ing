// gate-profile: folder popover on a post, Arrange view (keyboard hint, new folder, pin toggle, Done).
import { sleep } from '../lib.mjs';
import { MASKS, fonts, CONTROLS } from './gate-profile-lib.mjs';

export default {
  name: 'gate-profile-folder-arrange',
  async run(v) {
    const { page } = v;
    await v.login('test');
    await v.goto('/test');
    await page.locator('.profile-tab').first().waitFor();

    // Folder popover
    const btn = page.locator('.profile-post-folder-btn').first();
    await v.click(btn);
    await page.locator('.profile-post-folder-menu').waitFor();
    v.step('folder popover opens');
    await v.burst('folder-open', { frames: 5, gap: 70, mask: MASKS, dynamic: true });
    const menu = page.locator('.profile-post-folder-menu');
    const box = await menu.boundingBox();
    const vp = page.viewportSize();
    v.note(`folder popover box x=${Math.round(box.x)} y=${Math.round(box.y)} w=${Math.round(box.width)} h=${Math.round(box.height)} viewport ${vp.width}x${vp.height}`);
    if (box.x < 0 || box.x + box.width > vp.width) throw new Error('folder popover is off-screen sideways');
    // not hidden behind the top bar or another card
    const topHit = await page.evaluate(() => { const m = document.querySelector('.profile-post-folder-menu'); const r = m.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + 12); return !!t && m.contains(t); });
    v.note('popover top edge is the topmost layer: ' + topHit);
    if (!topHit) throw new Error('folder popover is covered by something');
    const cs = await menu.evaluate(e => { const s = getComputedStyle(e); return { bg: s.backgroundColor, filter: s.backdropFilter, font: s.fontFamily.slice(0, 40) }; });
    v.note(`popover bg=${cs.bg} backdrop-filter=${cs.filter} font=${cs.font}`);
    if (cs.filter && cs.filter !== 'none') throw new Error('folder popover uses a blur: ' + cs.filter);
    await fonts(v, 'folder popover', ['.profile-post-folder-menu button', '.profile-post-folder-menu input', '.profile-post-folder-menu-label']);
    await v.shot('folder-menu', { keepPointer: true, mask: MASKS, dynamic: true });
    // type a new folder name but do not create
    const inp = menu.locator('input');
    if (await inp.count()) { await v.click(inp.first()); await v.type('gate folder', 30); await sleep(200); await v.shot('folder-typed', { locator: menu, keepPointer: true, dynamic: true }); }
    // close: Escape, then click outside
    await page.keyboard.press('Escape');
    await sleep(300);
    const stillAfterEsc = await menu.count();
    v.note('Escape closes the folder popover: ' + (stillAfterEsc ? 'NO' : 'yes'));
    if (stillAfterEsc) {
      v.note('FINDING: Escape does not close the folder popover (ProfilePostList.jsx only listens for mousedown outside)');
      await page.mouse.move(40, 200, { steps: 4 });
      await page.mouse.click(40, 200);
      await sleep(300);
    }
    if (await menu.count()) throw new Error('folder popover would not close');
    const focusBack = await page.evaluate(() => document.activeElement.className.toString().slice(0, 40));
    v.note('focus after closing the popover: ' + focusBack);
    v.step('folder popover closes');

    // Arrange view
    await page.getByRole('button', { name: 'Arrange posts' }).first().waitFor();
    await v.click(page.getByRole('button', { name: 'Arrange posts' }).first());
    await page.locator('section.arrange').waitFor();
    await sleep(500);
    v.step('arrange view opens');
    await v.burst('arrange-open', { frames: 5, gap: 70, mask: MASKS, dynamic: true });
    await v.shot('arrange', { fullPage: true, mask: MASKS, dynamic: true });
    if (!await v.noSideScroll()) throw new Error('arrange view scrolls sideways');
    await fonts(v, 'arrange', ['.arrange button', '.arrange input', '.arrange-title', '.arrange-status']);
    const cs2 = await page.evaluate(() => [...document.querySelectorAll('.arrange, .arrange-head, .arrange-row, .arrange *')].slice(0, 400).filter(e => { const s = getComputedStyle(e); return s.backdropFilter !== 'none' || s.filter.includes('blur'); }).length);
    v.note('arrange elements with blur: ' + cs2);
    // hint behind the "i"
    const info = page.getByRole('button', { name: 'Keyboard keys' });
    await v.click(info);
    await sleep(300);
    await v.shot('arrange-keys', { locator: 'section.arrange', mask: MASKS, dynamic: true });
    await v.click(info);
    // new folder field
    await v.click(page.locator('.arrange-new-folder'));
    await page.getByLabel('Folder name').waitFor();
    await sleep(250);
    await v.shot('arrange-newfolder', { locator: 'section.arrange .arrange-head', dynamic: true, keepPointer: true });
    await page.keyboard.press('Escape');
    await sleep(250);
    if (await page.getByLabel('Folder name').count()) { await v.click(page.locator('.arrange-new-folder')); await sleep(250); }
    // keyboard drag handle reachable
    await page.locator('.arrange button[title="Drag to move"]').first().focus();
    await sleep(200);
    await v.shot('arrange-handle-focus', { locator: 'section.arrange', dynamic: true, keepPointer: true, mask: MASKS });
    v.step('arrange hint, new folder, handle focus');
    await v.click(page.locator('.arrange-done'));
    await sleep(500);
    if (await page.locator('section.arrange').count()) throw new Error('Done did not leave the arrange view');
    await v.shot('after-done', { fullPage: true, mask: MASKS, dynamic: true });
    v.step('Done returns to the profile');
  },
};
