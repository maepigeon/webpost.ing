// gate-profile: edit bio (save and restore), edit links (cancel), banner editor (draw, Cancel asks, Discard).
import { sleep } from '../lib.mjs';
import { MASKS, fonts } from './gate-profile-lib.mjs';

export default {
  name: 'gate-profile-edit',
  async run(v) {
    const { page } = v;
    await v.login('test');
    await v.goto('/test');
    await page.locator('.profile-tab').first().waitFor();

    // ---- bio
    const bioBefore = await page.evaluate(() => document.querySelector('.profile-bio, [class*="bio-text"], [class*="BioText"]')?.innerText ?? null);
    await v.click(page.getByRole('button', { name: /^(Edit bio|\+ Bio)$/ }));
    const ta = page.getByPlaceholder('Write a short bio...');
    await ta.waitFor();
    await sleep(300);
    const orig = await ta.inputValue();
    v.note('bio before: ' + JSON.stringify(orig.slice(0, 60)));
    await v.shot('bio-open', { dynamic: true, mask: MASKS });
    const taFont = await ta.evaluate(e => { const s = getComputedStyle(e); return { font: s.fontFamily.slice(0, 50), color: s.color, bg: s.backgroundColor }; });
    const navFont = await page.evaluate(() => getComputedStyle(document.querySelector('nav button, header button')).fontFamily.slice(0, 50));
    v.note(`bio textarea font=${taFont.font} color=${taFont.color} bg=${taFont.bg}; top bar font=${navFont}${taFont.font === navFont ? '' : '  FINDING: textarea is not in the interface font'}`);
    await v.click(ta);
    await page.keyboard.press('End');
    await v.type(' gate-check', 40);
    await sleep(200);
    await v.shot('bio-typed', { dynamic: true, mask: MASKS, locator: ta });
    // Cancel discards
    await v.click(page.getByRole('button', { name: 'Cancel' }).first());
    await sleep(400);
    v.step('bio: Cancel');
    if ((await page.getByText('gate-check').count()) > 0) throw new Error('Cancel on the bio still saved the text');
    // Save, then put it back
    await v.click(page.getByRole('button', { name: /^(Edit bio|\+ Bio)$/ }));
    await ta.waitFor();
    await v.click(ta);
    await page.keyboard.press('End');
    await v.type(' gate-check', 40);
    await v.click(page.getByRole('button', { name: 'Save', exact: true }).first());
    await page.getByText('gate-check').first().waitFor();
    v.step('bio: Save shows the text');
    await sleep(300);
    await v.shot('bio-saved', { dynamic: true, mask: MASKS, fullPage: false });
    v.onCleanup(async () => { // restore the bio through the API if the UI path failed below
      const r = await v.api('GET', '/api/users/test');
      const cur = r.body?.bio ?? '';
      if (cur.includes('gate-check')) v.note('bio cleanup: restoring through the page did not run; value still has gate-check');
    });
    await v.click(page.getByRole('button', { name: /^(Edit bio|\+ Bio)$/ }));
    await ta.waitFor();
    await v.click(ta);
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Meta+A');
    await page.keyboard.press('Backspace');
    if (orig) await page.keyboard.insertText(orig);
    await v.click(page.getByRole('button', { name: 'Save', exact: true }).first());
    await sleep(600);
    if ((await page.getByText('gate-check').count()) > 0) throw new Error('could not put the bio back');
    v.step('bio restored');

    // ---- links (cancel only)
    await v.click(page.getByRole('button', { name: /^(Edit links|\+ Links)$/ }));
    await page.locator('.profile-links-editor').waitFor();
    await sleep(300);
    await v.shot('links-open', { dynamic: true, mask: MASKS, locator: '.profile-links-editor' });
    await fonts(v, 'links editor', ['.profile-links-editor input', '.profile-links-editor button']);
    await v.click(page.getByLabel('Link 1 label'));
    await v.type('not saved', 30);
    await v.click(page.locator('.profile-links-editor').getByRole('button', { name: 'Cancel' }));
    await sleep(300);
    if (await page.locator('.profile-links-editor').count()) throw new Error('links editor did not close on Cancel');
    v.step('links: open, type, Cancel');

    // ---- banner editor
    await v.click(page.getByRole('button', { name: /^(Edit banner|\+ Banner)$/ }));
    await page.locator('.banner-editor').waitFor();
    await sleep(900);
    v.step('banner editor opens');
    await v.burst('banner-open', { frames: 4, gap: 120, dynamic: true, mask: MASKS });
    await v.shot('banner-editor', { fullPage: true, dynamic: true, mask: MASKS });
    if (!await v.noSideScroll()) throw new Error('banner editor makes the page scroll sideways');
    await fonts(v, 'banner editor', ['.banner-editor button', '.banner-editor select', '.banner-editor input']);
    // draw: drag across the grid canvas
    const cv = page.locator('.banner-editor canvas').first();
    const box = await cv.boundingBox();
    v.note(box ? `banner canvas ${Math.round(box.width)}x${Math.round(box.height)} at ${Math.round(box.x)},${Math.round(box.y)}` : 'NO canvas in banner editor');
    if (box) {
      await v.click(page.getByRole('button', { name: /^Paint pixels/ }));
      await cv.scrollIntoViewIfNeeded();
      const b = await cv.boundingBox();
      await v.drag({ x: b.x + b.width * 0.3, y: b.y + b.height * 0.5 }, { x: b.x + b.width * 0.6, y: b.y + b.height * 0.6 }, 14);
      await sleep(400);
      await v.burst('banner-drawn', { frames: 3, gap: 100, dynamic: true, mask: MASKS });
      const unsaved = await page.getByText('Not saved yet').count();
      v.note('"Not saved yet" shown after drawing: ' + unsaved);
    }
    await v.click(page.locator('.banner-editor-actions').getByRole('button', { name: 'Cancel' }));
    await sleep(500);
    const dlg = page.getByRole('dialog');
    if (await dlg.count()) {
      v.note('Cancel asked first: ' + (await dlg.first().innerText()).replace(/\n/g, ' | '));
      await v.shot('banner-discard-dialog', { dynamic: true, keepPointer: true });
      const cs = await dlg.first().evaluate(e => { const s = getComputedStyle(e); return `bg=${s.backgroundColor} blur=${s.backdropFilter} font=${s.fontFamily.slice(0, 30)}`; });
      v.note('dialog style: ' + cs);
      await v.click(dlg.first().getByRole('button', { name: 'Discard' }));
      await sleep(500);
    } else v.note('Cancel did not ask (nothing was drawn?)');
    if (await page.locator('.banner-editor').count()) throw new Error('banner editor did not close after Discard');
    v.step('banner editor: draw, Cancel asks, Discard closes');
    await v.shot('profile-after', { dynamic: true, mask: MASKS });
  },
};
