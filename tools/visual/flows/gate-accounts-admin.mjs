// Gate: Admin panel as `test`, ONE sign-in shared by both sizes (cookies cached in this module). Read-only: tabs are
// clicked, nothing else is: no switch is toggled, no "Run now", no Save, no Create.
import { sleep } from '../lib.mjs';

let cookies = null;
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export default {
  name: 'gate-accounts-admin',
  async run(v) {
    const { page } = v;
    if (!cookies) {
      const r = await v.context.request.post(v.base + '/api/loginSessionAttempt', { data: { username: 'test', password: 'test' } });
      if (!r.ok()) throw new Error('login test failed ' + r.status());
      cookies = await v.context.cookies();
      v.note('signed in as test once (' + cookies.length + ' cookies cached for the second size)');
    } else {
      await v.context.addCookies(cookies);
    }
    await v.context.addInitScript(() => { try { localStorage.setItem('userName', 'test'); localStorage.setItem('isAdmin', '1'); } catch {} });
    await v.goto('/routes/AdminPanel');
    const tabs = page.locator('.admin-tab');
    const names = await tabs.allInnerTexts();
    v.note('tabs: ' + names.join(' | '));
    await v.shot('admin-first', { fullPage: true });
    for (let i = 0; i < names.length; i++) {
      await v.click(tabs.nth(i));
      await sleep(700);
      const t = tabs.nth(i);
      const st = await page.evaluate(([i]) => {
        const all = [...document.querySelectorAll('.admin-tab')];
        const cs = e => getComputedStyle(e);
        const a = all[i], other = all.find((x, j) => j !== i);
        return { active: a.className, bg: cs(a).backgroundColor, color: cs(a).color, font: cs(a).fontFamily.split(',')[0], otherBg: cs(other).backgroundColor, otherColor: cs(other).color, side: document.documentElement.scrollWidth > innerWidth + 1 };
      }, [i]);
      v.note(`tab ${names[i]}: ${JSON.stringify(st)}`);
      await v.shot('tab-' + slug(names[i]), { fullPage: true });
      if (st.side) v.note('SIDEWAYS SCROLL on tab ' + names[i]);
      if (/stats/i.test(names[i])) {
        const line = await page.locator('.admin-panel').innerText();
        v.note('stats text (head): ' + JSON.stringify(line.replace(/\n+/g, ' / ').slice(0, 700)));
      }
      if (/settings/i.test(names[i])) {
        const sw = await page.getByRole('switch').evaluateAll(els => els.map(e => [e.getAttribute('aria-labelledby') && document.getElementById(e.getAttribute('aria-labelledby'))?.innerText, e.getAttribute('aria-checked')]));
        v.note('sign-up switches (read only): ' + JSON.stringify(sw));
        v.note('settings card text: ' + JSON.stringify((await page.locator('.admin-set-card').first().innerText()).replace(/\n+/g, ' / ').slice(0, 500)));
      }
      // fields inside cards: do they stay inside?
      const over = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('.admin-card, .admin-section').forEach(c => {
          const cr = c.getBoundingClientRect();
          c.querySelectorAll('input, select, textarea, button, table').forEach(e => {
            const r = e.getBoundingClientRect();
            if (r.width && (r.right > cr.right + 1 || r.left < cr.left - 1 || r.right > innerWidth + 1)) out.push([e.tagName, e.className?.toString().slice(0, 24), Math.round(r.left), Math.round(r.right), 'card', Math.round(cr.left), Math.round(cr.right)]);
          });
        });
        return out.slice(0, 6);
      });
      v.note(`tab ${names[i]} elements sticking out of card/viewport: ${JSON.stringify(over)}`);
    }
    v.step('all tabs visited');
    // keyboard: Tab ring on a tab button
    await page.evaluate(() => window.scrollTo(0, 0));
    await tabs.first().focus();
    await page.keyboard.press('Tab');
    v.note('Tab focus on admin tabs: ' + JSON.stringify(await page.evaluate(() => { const e = document.activeElement; const c = getComputedStyle(e); return [e.tagName, e.className?.toString().slice(0, 30), c.outlineStyle, c.outlineWidth, c.outlineColor]; })));
    await v.shot('tab-focus', { fullPage: false });
  },
};
