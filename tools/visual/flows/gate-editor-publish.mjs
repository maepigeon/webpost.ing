// gate-editor: new text post -> Publish -> published state -> Save changes -> still published.
// Also: Goes-in row, fonts, Math / code label in-page fields, sticky save row while scrolling.
import { sleep } from '../lib.mjs';

const TITLE = 'Gate editor text post';
const me = 'test2';

export default {
  name: 'gate-editor-publish',
  async run(v) {
    const { page } = v;
    await v.login(me);
    const dialogs = [];
    page.on('dialog', d => { dialogs.push(d.type() + ':' + d.message().slice(0, 60)); d.dismiss().catch(() => {}); });
    let createdId = null;
    page.on('response', async r => {
      const u = r.url();
      if (/\/api\/posts?\b/.test(u) && r.request().method() === 'POST') { try { const t = await r.text(); const m = t.match(/\d+/); if (m && !createdId) createdId = Number(m[0]); } catch {} }
    });
    const delAll = async () => {
      const ids = new Set(); if (createdId) ids.add(createdId);
      const m = page.url().match(/\/editor\/(\d+)/); if (m) ids.add(Number(m[1]));
      const r = await v.api('GET', `/api/user/${me}?limit=200&offset=0`).catch(() => null);
      const list = Array.isArray(r?.body) ? r.body : (r?.body?.posts || []);
      for (const p of list) if ((p.title || '').startsWith('Gate editor')) ids.add(p.id);
      for (const id of ids) { const x = await v.api('DELETE', `/api/posts/${id}`); v.note(`cleanup DELETE ${id} -> ${x.status}`); }
    };
    await v.goto('/robots.txt');
    await delAll();
    v.onCleanup(async () => { await delAll(); });
    await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/draft|autosave/i.test(k)) localStorage.removeItem(k); });

    await v.goto('/editor');
    await page.locator('.title-input').waitFor();
    // ---- Goes in row ------------------------------------------------------------------------
    const goes = await page.evaluate(() => {
      const row = document.querySelector('.post-section-row'); if (!row) return null;
      const pills = [...row.querySelectorAll('.post-section-pill')].map(p => { const s = getComputedStyle(p); return { t: p.innerText, on: p.classList.contains('is-on'), bg: s.backgroundColor, fg: s.color, border: s.borderColor, weight: s.fontWeight, font: s.fontFamily.slice(0, 30) }; });
      const extra = [...row.children].filter(e => !e.matches('.post-summary-label, .post-section-choices')).map(e => e.className + ':' + e.innerText);
      const sib = row.nextElementSibling; const hint = [...document.querySelectorAll('.post-section-hint, .post-summary-hint')].map(e => e.innerText);
      return { pills, extra, hint, rowText: row.innerText.replace(/\n/g, ' | '), next: sib?.className, nextText: sib?.innerText?.slice(0, 80) };
    });
    v.note('Goes-in: ' + JSON.stringify(goes));
    await v.shot('editor-empty', { fullPage: false, locator: '.editor-post-card' });
    // ---- fonts of ten controls ----------------------------------------------------------------
    const fonts = await page.evaluate(() => {
      const app = getComputedStyle(document.querySelector('nav button, header button') || document.body).fontFamily;
      const sels = ['.post-section-pill', '.toolbar-btn-draft', '.toolbar-btn-save', '.pe-section-head', '.post-slug-edit', '.post-summary-input', '.grid-select-btn', '.tg-text-btn', '.title-input', 'nav button'];
      return { app: app.slice(0, 40), items: sels.map(s => { const e = document.querySelector(s); return s + '=' + (e ? getComputedStyle(e).fontFamily.slice(0, 28) : 'none'); }) };
    });
    v.note('fonts: ' + JSON.stringify(fonts));

    // ---- type, publish ---------------------------------------------------------------------------
    await v.click('.title-input'); await v.type(TITLE);
    await v.click('.editor-contenteditable');
    await v.type('First paragraph of the gate test post, with enough words to look like writing.');
    for (let i = 0; i < 14; i++) { await page.keyboard.press('Enter'); await v.type('Line ' + (i + 2) + ' filler so the page scrolls on a phone.', 8); }
    await page.evaluate(() => window.scrollTo(0, 0));
    await v.shot('typed', { fullPage: false });

    // sticky behaviour with the page scrolled
    const stuck = async () => page.evaluate(() => {
      const f = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { top: Math.round(r.top), h: Math.round(r.height), pos: cs.position, disp: cs.display }; };
      return { scrollY: Math.round(scrollY), stack: f('.toolbar-stack'), panel: f('.pe-panel'), actions: f('.toolbar-actions') };
    });
    v.note('sticky at top: ' + JSON.stringify(await stuck()));
    await page.mouse.move(200, 500); await page.mouse.wheel(0, 700); await sleep(600);
    v.note('sticky scrolled: ' + JSON.stringify(await stuck()));
    await v.shot('scrolled-sticky', { fullPage: false });
    await page.evaluate(() => window.scrollTo(0, 0)); await sleep(500);

    await v.click(page.getByRole('button', { name: 'Publish', exact: true }));
    await page.getByText('Published.', { exact: false }).first().waitFor({ timeout: 8000 }).catch(() => v.note('no "Published." text appeared'));
    await sleep(500);
    const after = async label => {
      const s = await page.evaluate(() => ({
        btns: [...document.querySelectorAll('.toolbar-actions button')].map(b => b.innerText.trim()),
        status: [...document.querySelectorAll('.toolbar-actions [role=status], .toolbar-save-status, .autosave-status')].map(e => e.innerText.trim()),
        url: location.pathname,
      }));
      v.note(label + ': ' + JSON.stringify(s)); return s;
    };
    const s1 = await after('after Publish');
    await v.burst('after-publish', { locator: '.toolbar-actions', frames: 3, gap: 150, dynamic: true });
    await v.shot('after-publish-card', { fullPage: false, dynamic: true });
    const ok1 = ['Unpublish', 'Save changes'].every(t => s1.btns.includes(t)) && s1.btns.some(t => /View post/.test(t)) && !s1.btns.includes('Publish');
    v.note('PUBLISHED STATE after first Publish: ' + (ok1 ? 'OK' : 'WRONG'));
    const id = Number((s1.url.match(/\/editor\/(\d+)/) || [])[1]) || createdId;
    const api1 = id ? (await v.api('GET', `/api/posts/${id}`)).body : null;
    v.note('server published after Publish: ' + JSON.stringify(api1 && { published: api1.published, title: api1.title }) + ' id=' + id);
    if (id) createdId = id;
    v.step('first Publish');

    // edit and Save changes
    await v.click('.editor-contenteditable');
    await page.keyboard.press('Control+End'); await page.keyboard.press('Meta+ArrowDown');
    await v.type(' Edited after publishing.');
    await sleep(300);
    await v.shot('edited', { fullPage: false, dynamic: true });
    await v.click(page.getByRole('button', { name: 'Save changes', exact: true }));
    await sleep(1200);
    const s2 = await after('after Save changes');
    const ok2 = ['Unpublish', 'Save changes'].every(t => s2.btns.includes(t)) && !s2.btns.includes('Publish') && !s2.btns.includes('Save draft');
    v.note('STILL PUBLISHED after Save changes: ' + (ok2 ? 'OK' : 'WRONG'));
    const api2 = id ? (await v.api('GET', `/api/posts/${id}`)).body : null;
    v.note('server after Save changes: ' + JSON.stringify(api2 && { published: api2.published, hasEdit: JSON.stringify(api2.description || api2).includes('Edited after publishing') }));
    await v.shot('after-save-changes', { fullPage: false, dynamic: true });
    v.step('Save changes');

    // reload: still published
    await v.goto('/editor/' + id);
    await page.locator('.toolbar-actions').waitFor();
    await after('after reload');
    await v.shot('reloaded', { fullPage: false, dynamic: true });

    // ---- Math in-page field ----------------------------------------------------------------------
    await page.evaluate(() => window.scrollTo(0, 0));
    await v.click('.editor-contenteditable');
    await v.click(page.getByRole('button', { name: 'Math', exact: true }));
    const dlg = page.getByRole('dialog', { name: 'Insert math' });
    const mathOpen = await dlg.waitFor({ timeout: 3000 }).then(() => true).catch(() => false);
    v.note('Math dialog in page: ' + mathOpen + '; native dialogs so far: ' + JSON.stringify(dialogs));
    if (mathOpen) {
      await v.type('x^2 + y^2 = z^2');
      await sleep(500);
      await v.shot('math-dialog', { fullPage: false, dynamic: true });
      const ins = dlg.getByRole('button', { name: 'Insert' });
      v.note('math Insert enabled: ' + await ins.isEnabled());
      await dlg.getByRole('button', { name: 'Cancel' }).click();
      await sleep(300);
    }
    // ---- code block label ---------------------------------------------------------------------
    await v.click('.editor-contenteditable');
    await page.keyboard.press('Meta+ArrowDown'); await page.keyboard.press('Control+End'); await page.keyboard.press('Enter');
    await v.click(page.getByRole('button', { name: 'Code', exact: true }));
    await v.type('echo hi');
    await sleep(300);
    await page.locator('.editor-code').first().scrollIntoViewIfNeeded(); await sleep(500);
    { const bx = await page.locator('.editor-code').first().boundingBox(); await page.mouse.move(bx.x + 60, bx.y + 15, { steps: 6 }); await sleep(500); v.note('code box ' + JSON.stringify(bx) + ' overlay present: ' + await page.locator('.code-header-bar').count()); }
    const lab = page.locator('.code-lang-label').first();
    const hasLab = await lab.waitFor({ timeout: 3000 }).then(() => true).catch(() => false);
    if (hasLab) {
      await v.shot('code-hover-bar', { fullPage: false, dynamic: true });
      await v.click(lab);
      await page.locator('select.code-ctrl-select').first().selectOption('__custom__');
      await sleep(300);
      const inp = page.locator('input.code-ctrl-input').first();
      const vis = await inp.isVisible();
      v.note('code label custom field in page: ' + vis + '; native dialogs: ' + JSON.stringify(dialogs));
      if (vis) { await inp.fill('Shell'); await v.shot('code-label-field', { fullPage: false, dynamic: true }); await page.keyboard.press('Enter'); await sleep(300); v.note('code label now: ' + await lab.innerText()); }
    } else v.note('code block label not found');
    await v.shot('code-block', { fullPage: false, dynamic: true });
    v.note('native dialogs total: ' + JSON.stringify(dialogs));
    if (!ok1) throw new Error('after first Publish the editor is not in the published state: ' + JSON.stringify(s1));
    if (!ok2) throw new Error('after Save changes the editor is no longer published: ' + JSON.stringify(s2));
    if (dialogs.length) throw new Error('native browser dialog(s) appeared: ' + dialogs.join(', '));
  },
};
