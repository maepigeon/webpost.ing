// gate-editor: autosave Restore / Discard, Button block fields, "Goes in" selected state after a click.
import { sleep } from '../lib.mjs';

const me = 'test2';

export default {
  name: 'gate-editor-draft',
  async run(v) {
    const { page } = v;
    await v.login(me);
    const dialogs = [];
    page.on('dialog', d => { if (d.type() === 'beforeunload') { v.note('leave-site prompt (beforeunload) on reload'); d.accept().catch(() => {}); return; } dialogs.push(d.type() + ':' + d.message().slice(0, 60)); d.dismiss().catch(() => {}); });
    const clearDrafts = () => page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/draft|autosave/i.test(k)) localStorage.removeItem(k); });
    await v.goto('/editor'); await clearDrafts();
    v.onCleanup(async () => { await clearDrafts().catch(() => {}); });
    await v.goto('/editor');
    await page.locator('.title-input').waitFor();

    // Goes in: pick Note, look at the selected state
    await v.click(page.getByRole('radio', { name: 'Note' }));
    await sleep(500);
    const pills = await page.evaluate(() => [...document.querySelectorAll('.post-section-pill')].map(p => { const s = getComputedStyle(p); return p.innerText + ':' + (p.classList.contains('is-on') ? 'ON' : 'off') + ' bg=' + s.backgroundColor + ' fg=' + s.color; }));
    v.note('Goes in after clicking Note: ' + pills.join(' ; '));
    await v.shot('goes-in-note', { locator: '.post-section-row', dynamic: true, keepPointer: false });
    await v.click(page.getByRole('radio', { name: 'Post' }));

    await v.click('.title-input'); await v.type('Gate editor draft title');
    await v.click('.editor-contenteditable'); await v.type('Words that exist only as an unsaved draft on this device.');
    // Button block fields
    await v.click(page.getByRole('button', { name: 'Button', exact: true }));
    const pb = page.locator('.pb-input'); await pb.first().waitFor(); await sleep(500);
    const fields = await page.evaluate(() => [...document.querySelectorAll('.pb-input')].map(i => { const s = getComputedStyle(i); return { ph: i.placeholder, font: s.fontFamily.slice(0, 25), color: s.color, bg: s.backgroundColor, size: s.fontSize, border: s.borderColor }; }));
    v.note('Button block fields: ' + JSON.stringify(fields));
    await v.click(pb.first()); await v.type('Read more');
    await sleep(300);
    await v.shot('button-block', { fullPage: false, dynamic: true });
    // wait for the device autosave
    const kept = await page.waitForFunction(() => /Saved on this device/.test(document.body.innerText), null, { timeout: 15000 }).then(() => true).catch(() => false);
    v.note('"Saved on this device" appeared: ' + kept);
    await sleep(1500);
    // reload: offer
    await page.reload(); await v.settle(600);
    const offer = page.locator('.draft-found');
    const has = await offer.waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
    v.note('draft offer after reload: ' + has + (has ? ' text=' + JSON.stringify(await offer.innerText()) : ''));
    await v.shot('draft-offer', { fullPage: false, dynamic: true });
    if (has) {
      const bx = await offer.boundingBox(); v.note('offer box ' + JSON.stringify(bx));
      await v.click(offer.getByRole('button', { name: 'Restore' })); await sleep(900);
      const t = await page.locator('.title-input').innerText().catch(async () => await page.locator('.title-input').inputValue().catch(() => ''));
      const body = await page.locator('.editor-contenteditable').innerText();
      v.note('after Restore: title=' + JSON.stringify(t) + ' body has text=' + /unsaved draft/.test(body));
      await page.evaluate(() => window.scrollTo(0, 0)); await sleep(500);
      v.note('title element after Restore: ' + await page.evaluate(() => { const e = document.querySelector('.title-input'); return JSON.stringify({ tag: e?.tagName, value: e?.value, text: e?.textContent, inner: e?.innerText }); }));
      await v.shot('draft-restored', { fullPage: false, dynamic: true });
      await page.reload(); await v.settle(600);
      const again = await page.locator('.draft-found').waitFor({ timeout: 4000 }).then(() => true).catch(() => false);
      v.note('offer again after second reload: ' + again);
      if (again) {
        await v.click(page.locator('.draft-found').getByRole('button', { name: 'Discard' })); await sleep(700);
        const body2 = await page.locator('.editor-contenteditable').innerText();
        v.note('after Discard: offer gone=' + !(await page.locator('.draft-found').count()) + ' body empty=' + !/unsaved draft/.test(body2));
        await v.shot('draft-discarded', { fullPage: false, dynamic: true });
        await page.reload(); await v.settle(600);
        v.note('offer after reload following Discard: ' + await page.locator('.draft-found').count());
      }
    }
    if (dialogs.length) throw new Error('native dialog(s): ' + dialogs.join(', '));
    if (!has) throw new Error('no draft offer after reload');
  },
};
