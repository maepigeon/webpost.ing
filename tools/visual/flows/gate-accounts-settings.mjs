// Gate: Settings as vt5. Every section opened; Sign-in methods (Link with a wrong password); change password with a
// wrong current password; Security activity; delete-account form opened, never submitted. Nothing is changed.
import { readFileSync } from 'node:fs';
import { sleep } from '../lib.mjs';

const ACC = '/private/tmp/claude-501/-Users-mae-workspace-webposting--claude-worktrees-kind-driscoll-e5fb5f/87be1c04-857d-4336-9a7a-4bd52c5ce943/scratchpad/run/gate-accounts.txt';
const pw = u => (readFileSync(ACC, 'utf8').match(new RegExp('^' + u + '\\s*/\\s*(\\S+)', 'm')) || [])[1];
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default {
  name: 'gate-accounts-settings',
  async run(v) {
    const { page } = v;
    const r = await v.context.request.post(v.base + '/api/loginSessionAttempt', { data: { username: 'vt5', password: pw('vt5') } });
    if (!r.ok()) throw new Error('login vt5 failed ' + r.status());
    await v.context.addInitScript(() => { try { localStorage.setItem('userName', 'vt5'); localStorage.setItem('isAdmin', '0'); } catch {} });
    await v.goto('/settings');
    const heads = page.locator('summary.settings-section-title');
    const names = await heads.allInnerTexts();
    v.note('sections: ' + names.join(' | '));
    const open0 = await page.locator('details[open]').count();
    v.note('sections open at start: ' + open0);
    await v.shot('collapsed', { fullPage: true });
    const appFont = await page.evaluate(() => getComputedStyle(document.querySelector('nav button, header button, .navButton') || document.body).fontFamily.split(',')[0]);
    v.note('app font (top bar): ' + appFont);

    // focus ring: Tab shows grey ring, mouse click leaves none
    await page.mouse.move(2, 2);
    for (let k = 0; k < 14; k++) await page.keyboard.press('Tab');
    v.note('Tab focus: ' + JSON.stringify(await page.evaluate(() => { const e = document.activeElement; const c = getComputedStyle(e); return [e.tagName, e.className?.toString().slice(0, 30), c.outlineStyle, c.outlineWidth, c.outlineColor, c.boxShadow.slice(0, 60)]; })));
    await page.screenshot({ path: v.outDir + '/tabfocus-' + v.size + '.png' });
    await page.evaluate(() => document.activeElement.blur());
    for (let i = 0; i < names.length; i++) {
      const name = names[i], s = slug(name);
      const head = heads.nth(i);
      await v.click(head);
      await sleep(250);
      const det = page.locator('details[open]').first();
      const diff = await det.evaluate((d, af) => [...d.querySelectorAll('button, input, select, summary, a, label, textarea')].slice(0, 14).map(e => [e.className?.toString().slice(0, 28) || e.tagName, getComputedStyle(e).fontFamily.split(',')[0]]).filter(x => x[1] !== af), appFont);
      v.note(`[${name}] controls not in app font: ${JSON.stringify(diff)}`);
      v.note(`[${name}] text: ${JSON.stringify((await det.innerText()).replace(/\n+/g, ' / ').slice(0, 420))}`);
      await v.burst('open-' + s, { frames: 3, gap: 120, fullPage: true });
      await page.mouse.move(2, 2); await sleep(100);
      await page.screenshot({ path: v.outDir + '/raw-' + s + '-' + v.size + '.png', fullPage: true });
      v.step('opened ' + name);
      if (!await v.noSideScroll()) throw new Error(`sideways scroll with "${name}" open`);

      if (/sign-in methods/i.test(name)) {
        const linkBtn = det.getByRole('button', { name: /^Link$/ }).first();
        v.note('Link buttons: ' + await det.getByRole('button', { name: /^Link$/ }).count());
        if (await linkBtn.count()) {
          await v.click(linkBtn);
          const inp = det.getByPlaceholder('Your password');
          await inp.waitFor();
          await v.click(inp); await v.type('definitely-wrong-1');
          await v.shot('signin-link-form', { fullPage: true });
          await page.keyboard.press('Enter');
          await sleep(1200);
          v.note('after wrong password on Link: ' + JSON.stringify((await det.innerText()).replace(/\n+/g, ' / ').slice(-200)) + ' url=' + page.url() + ' user=' + await page.evaluate(() => localStorage.getItem('userName')));
          await v.burst('signin-link-wrong', { frames: 3, gap: 150, fullPage: true });
          await page.reload(); await v.settle();
          v.note('after reload still on settings, nav shows vt5: ' + (/settings/.test(page.url()) && (await page.locator('body').innerText()).includes('Sign-in methods')));
          v.step('Link with wrong password: message shown');
        }
      }
      if (/^password$/i.test(name)) {
        const inputs = det.locator('input[type=password]');
        await v.click(inputs.nth(0)); await v.type('wrong-current-1');
        await v.click(inputs.nth(1)); await v.type('Another-Strong-Pw-9!');
        await v.click(inputs.nth(2)); await v.type('Another-Strong-Pw-9!');
        await v.shot('password-filled', { fullPage: true });
        await v.click(det.getByRole('button', { name: /Change password/ }));
        await sleep(1500);
        v.note('after wrong current password: ' + JSON.stringify((await det.innerText()).replace(/\n+/g, ' / ').slice(-220)) + ' url=' + page.url() + ' user=' + await page.evaluate(() => localStorage.getItem('userName')));
        await v.burst('password-wrong', { frames: 3, gap: 150, fullPage: true });
        v.step('change password with wrong current password');
        if (/routes\/Login/.test(page.url())) throw new Error('wrong current password signed the user out');
      }
      if (/delete account/i.test(name)) {
        const inputs = det.locator('input');
        await v.click(inputs.nth(0)); await v.type('typed-but-never-sent');
        await v.shot('delete-typed', { fullPage: true });
        v.note('delete submit disabled before username typed: ' + await det.getByRole('button', { name: /Delete my account/ }).isDisabled());
        await inputs.nth(0).fill('');
        v.step('delete form opened, not submitted');
      }
      v.note(`[${name}] head outline after mouse click: ` + await head.evaluate(e => getComputedStyle(e).outlineStyle));
      await v.click(head);
      await sleep(250);
    }
    if (!await v.noSideScroll()) throw new Error('page scrolls sideways');
  },
};
