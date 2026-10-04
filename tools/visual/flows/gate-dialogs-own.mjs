// gate-dialogs: delete-confirm, sticker pack dialog, image picker and crop (editor), focus rings. test3's own things only.
import { sleep } from '../lib.mjs';
import { dialogRound, finish, loginOnce, raw, ringOf, blurScan } from './gate-dialogs-helpers.mjs';

const PNG = '/private/tmp/claude-501/-Users-mae-workspace-webposting--claude-worktrees-kind-driscoll-e5fb5f/87be1c04-857d-4336-9a7a-4bd52c5ce943/scratchpad/gate-test.png';

export default {
  name: 'gate-dialogs-own',
  async run(v) {
    const { page } = v;
    await loginOnce(v);
    await v.goto('/');
    // a sticker of my own, removed again at the end
    const made = await v.api('POST', '/api/users/test3/stickers', null);   // placeholder to learn the shape cheaply (expected to fail)
    const grid = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 32; c.height = 32; const x = c.getContext('2d');
      x.fillStyle = '#000'; x.fillRect(0, 0, 32, 32); x.fillStyle = '#fff'; x.fillRect(4, 4, 24, 24); x.fillStyle = '#888'; x.fillRect(10, 10, 12, 12);
      return { v: 3, cols: 2, rows: 2, glyphs: {}, layers: [{ id: 'lgatedlg1', name: 'Drawing', visible: true, kind: 'pixel', paint: c.toDataURL('image/png'), text: [], style: {}, wide: [] }] };
    });
    const mk = await v.api('POST', '/api/users/test3/stickers', { name: 'gate-dialogs sticker', grid });
    v.note('create sticker: HTTP ' + mk.status);
    const stickerId = mk.body && mk.body.id;
    v.onCleanup(async () => { const l = await v.api('GET', '/api/users/test3/stickers'); for (const s of (l.body || []).filter(s => s.name === 'gate-dialogs sticker')) await v.api('DELETE', '/api/users/test3/stickers/' + s.id); });

    // --- delete confirm (Dialog.jsx), opened from Settings
    await v.goto('/settings');
    v.note('settings blur scan: ' + JSON.stringify(await blurScan(page)));
    await v.goto('/customize');
    await sleep(800);
    const del = page.locator('.sticker-list li', { hasText: 'gate-dialogs sticker' }).getByRole('button', { name: 'Delete' });
    if (await del.count()) {
      await dialogRound(v, { id: 'confirm-delete', opener: del, card: '.dialog-box', overlay: '.dialog-overlay', closeWith: ['Escape', page.locator('.dialog-btn--cancel')] });
    } else v.note('no Delete button for the test sticker found');
    await raw(v, 'settings-stickers');

    // --- share a pack (Messages)
    await v.goto('/messages');
    const conv = page.locator('.messages-conv, .messages-conversation, [class*=conv-item], [class*=conv]').filter({ hasText: 'test2' }).first();
    if (await conv.count()) { await v.click(conv); await sleep(900); }
    const packBtn = page.locator('.messages-pack-btn');
    if (await packBtn.count()) {
      await dialogRound(v, { id: 'pack', opener: packBtn, card: '.pack-dialog', overlay: '.pack-dialog-backdrop', closeWith: ['Escape', page.locator('.pack-dialog button', { hasText: /cancel|close/i }).first()] });
    } else v.note('Pack button not reachable: ' + page.url());

    // --- image picker and crop (the editor)
    await v.goto('/editor');
    const imgBtn = page.locator('button[aria-label="Image"], button:has-text("Image")').first();
    await imgBtn.waitFor({ timeout: 8000 }).catch(() => {});
    if (await imgBtn.count()) {
      await dialogRound(v, { id: 'picker', opener: imgBtn, card: '.imgpick-dialog', overlay: '.imgpick-overlay', closeWith: ['Escape', page.locator('.imgpick-btn')] });
      // open again and take the upload path into the crop dialog
      await v.click(imgBtn); await page.locator('.imgpick-dialog').waitFor();
      await page.locator('.imgpick-upload input[type=file]').setInputFiles(PNG);
      await page.locator('.crop-dialog').waitFor({ timeout: 8000 }).catch(() => {});
      await sleep(900);
      if (await page.locator('.crop-dialog').count()) {
        const crop = await page.locator('.crop-dialog').evaluate(card => { const s = getComputedStyle(card), o = getComputedStyle(card.parentElement); const r = card.getBoundingClientRect(); return { cardBg: s.backgroundColor, overlayBg: o.backgroundColor, overlayBlur: o.backdropFilter, cardBlur: s.backdropFilter, box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], inside: r.x >= 0 && r.y >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1, fonts: [...card.querySelectorAll('button,input,select')].map(e => getComputedStyle(e).fontFamily.split(',')[0]).join('|') }; });
        v.note('[crop] ' + JSON.stringify(crop));
        await raw(v, 'crop-open');
        await page.keyboard.press('Escape'); await sleep(400);
        if (await page.locator('.crop-dialog').count()) { await v.click(page.locator('.crop-dialog button', { hasText: /cancel/i }).first()); await sleep(400); }
        const f = await page.evaluate(() => document.activeElement && (document.activeElement.tagName + ' ' + (document.activeElement.getAttribute('aria-label') || document.activeElement.innerText || '').slice(0, 20)));
        v.note('[crop] closed; focus on: ' + f + '; dialog gone: ' + !(await page.locator('.crop-dialog').count()));
        v.rounds = v.rounds || []; v.rounds.push({ id: 'crop', ok: !(await page.locator('.crop-dialog').count()) && crop.cardBg !== 'rgba(0, 0, 0, 0)' && !/blur/.test(crop.overlayBlur + crop.cardBlur), findings: ['crop dialog check'] });
      } else v.note('crop dialog did not open');
    } else v.note('no Image button in editor');

    // --- focus rings: mouse leaves none, Tab shows grey
    await v.goto('/test/grid');
    const share = page.locator('.share-menu-wrapper > button').first();
    await v.click(share); await sleep(300);
    v.note('[ring] after mouse click on Share: ' + JSON.stringify(await ringOf(page, share)));
    await page.keyboard.press('Escape'); await sleep(300);
    await v.goto('/test/grid');
    await page.mouse.move(2, 2); await page.mouse.click(2, 2);
    let hit = null; const trail = [];
    for (let i = 0; i < 25; i++) { await page.keyboard.press('Tab'); await sleep(60); const r = await ringOf(page); trail.push(r.el); if (/Report|Share/.test(r.el)) { hit = r; break; } }
    v.note('[ring] Tab trail: ' + trail.join(' > '));
    v.note('[ring] after Tab: ' + JSON.stringify(hit));
    if (hit) await raw(v, 'ring-tab', { clip: { x: 300, y: 400, width: 700, height: Math.min(440, page.viewportSize().height - 400) } });
    // every Tab stop on the post page: does each show a ring?
    await v.goto('/test2/audio-review');
    await page.mouse.move(2, 2); await page.mouse.click(2, 2);
    const stops = [];
    for (let i = 0; i < 18; i++) { await page.keyboard.press('Tab'); await sleep(50); stops.push(await ringOf(page)); }
    v.note('[ring] neon post Tab stops: ' + stops.map(r => `${r.el} ${r.focusVisible ? 'FV' : '--'} ${r.shadow ? 'sh:' + r.shadow.slice(0, 40) : ''} ${/^none/.test(r.outline) ? '' : 'ol:' + r.outline}`).join(' || '));
    // inside a dialog: Tab from the open dialog
    await v.goto('/test2');
    await v.click(page.getByRole('button', { name: /followers: show them/ })); await page.locator('.follow-modal').waitFor(); await sleep(300);
    await page.keyboard.press('Tab'); await sleep(80);
    v.note('[ring] Tab in followers dialog: ' + JSON.stringify(await ringOf(page)));
    await raw(v, 'ring-dialog');
    await page.keyboard.press('Escape');
    finish(v);
  },
};
