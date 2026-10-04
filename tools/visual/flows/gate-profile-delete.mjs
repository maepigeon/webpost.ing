// gate-profile: delete a post. The confirm says "Delete", Cancel keeps the post, Delete removes it and the counts drop.
import { sleep } from '../lib.mjs';
import { MASKS, makePost, fonts } from './gate-profile-lib.mjs';

export default {
  name: 'gate-profile-delete',
  async run(v) {
    const { page } = v;
    await v.login('test');
    const title = 'gate-profile delete me';
    await makePost(v, title, true);
    await v.goto('/test');
    await page.locator('.profile-tab').first().waitFor();
    const count = async () => Number(await page.locator('.profile-tab', { hasText: /^Posts/ }).locator('.profile-tab-count').innerText().catch(() => '0'));
    const items = () => page.locator('#profile-tabpanel .profile-post-item').count();
    const c0 = await count(), i0 = await items();
    v.note(`before: Posts tab count ${c0}, items ${i0}`);
    const item = page.locator('.profile-post-item', { hasText: title });
    await item.waitFor();
    await v.shot('before', { fullPage: true, dynamic: true, mask: MASKS });
    await v.click(item.locator('.post-delete-btn'));
    const dlg = page.getByRole('dialog');
    await dlg.waitFor();
    await sleep(300);
    v.step('delete asks first');
    await v.burst('confirm-open', { frames: 4, gap: 80, dynamic: true });
    const buttons = await dlg.getByRole('button').allInnerTexts();
    const txt = (await dlg.innerText()).replace(/\n/g, ' | ');
    v.note('confirm text: ' + txt + '; buttons: ' + buttons.join(' / '));
    const st = await dlg.first().evaluate(e => { const s = getComputedStyle(e); const o = e.closest('[class*=overlay],[class*=backdrop]'); const so = o ? getComputedStyle(o) : null; return `card bg=${s.backgroundColor} blur=${s.backdropFilter} font=${s.fontFamily.slice(0, 30)}; overlay blur=${so?.backdropFilter} overlay bg=${so?.backgroundColor}`; });
    v.note('dialog style: ' + st);
    await fonts(v, 'confirm', ['[role=dialog] button', '[role=dialog] p', '[role=dialog] h2', '[role=dialog] h3']);
    await v.shot('confirm', { dynamic: true, keepPointer: true });
    if (!buttons.some(b => b.trim() === 'Delete')) throw new Error('the confirm button does not say "Delete": ' + buttons.join(' / '));
    // focus is inside the dialog
    const inDlg = await page.evaluate(() => !!document.activeElement.closest('[role=dialog]'));
    v.note('focus inside the dialog: ' + inDlg);
    // Cancel keeps the post, focus returns to the Delete button
    await v.click(dlg.getByRole('button', { name: /^Cancel$/ }));
    await sleep(500);
    if (!(await item.count())) throw new Error('Cancel deleted the post');
    const back = await page.evaluate(() => document.activeElement.className.toString().slice(0, 40) + ' / ' + (document.activeElement.innerText || '').slice(0, 20));
    v.note('focus after Cancel: ' + back);
    v.step('Cancel keeps the post');
    // Escape also closes
    await v.click(item.locator('.post-delete-btn'));
    await dlg.waitFor();
    await page.keyboard.press('Escape');
    await sleep(400);
    if (await dlg.count()) {
      v.note('FINDING: Escape does not close the delete confirm (Dialog.jsx has no key handler, no focus move, no focus return)');
      await v.click(dlg.getByRole('button', { name: /^Cancel$/ }));
      await sleep(400);
    } else v.step('Escape closes the confirm');
    if (!(await item.count())) throw new Error('post vanished');
    // Delete for real
    await v.click(item.locator('.post-delete-btn'));
    await dlg.waitFor();
    await v.click(dlg.getByRole('button', { name: /^Delete$/ }));
    await page.waitForLoadState('load').catch(() => {});
    await sleep(2500);
    if (await item.count()) throw new Error('the post is still listed after Delete');
    const c1 = await count(), i1 = await items();
    v.note(`after: Posts tab count ${c1}, items ${i1}`);
    if (c1 !== c0 - 1) throw new Error(`Posts count went ${c0} -> ${c1}`);
    if (i1 !== i0 - 1) throw new Error(`items went ${i0} -> ${i1}`);
    v.step('Delete removes the post; tab count and list agree');
    await v.shot('after', { fullPage: true, dynamic: true, mask: MASKS });
    // survives a reload
    await v.goto('/test');
    if (await page.locator('.profile-post-item', { hasText: title }).count()) throw new Error('post came back after reload');
    v.step('stays deleted after reload');
  },
};
