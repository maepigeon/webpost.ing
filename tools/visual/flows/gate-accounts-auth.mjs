// Gate: signed-out account pages. Sign-in, sign-up, SSO outcome lines, ChooseUsername, forgot password,
// wrong password then right password (vt5). Never clicks through to a provider.
import { readFileSync } from 'node:fs';
import { sleep } from '../lib.mjs';

const ACC = '/private/tmp/claude-501/-Users-mae-workspace-webposting--claude-worktrees-kind-driscoll-e5fb5f/87be1c04-857d-4336-9a7a-4bd52c5ce943/scratchpad/run/gate-accounts.txt';
const pw = u => (readFileSync(ACC, 'utf8').match(new RegExp('^' + u + '\\s*/\\s*(\\S+)', 'm')) || [])[1];

const measure = page => page.evaluate(() => {
  const cs = (e, p) => getComputedStyle(e)[p];
  const box = e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const main = document.querySelector('.login-submit-btn, .registration-submit-btn, form button[type=submit]');
  const sso = [...document.querySelectorAll('.login-sso-btn')];
  const fonts = [...document.querySelectorAll('button, input, a, label, select')].slice(0, 14).map(e => (e.className?.toString().slice(0, 24) || e.tagName) + ' => ' + cs(e, 'fontFamily').split(',')[0]);
  return {
    main: main && { ...box(main), bg: cs(main, 'backgroundColor'), color: cs(main, 'color'), text: main.innerText },
    sso: sso.map(e => ({ ...box(e), bg: cs(e, 'backgroundColor'), color: cs(e, 'color'), border: cs(e, 'borderTopColor'), text: e.innerText.trim(), href: e.getAttribute('href') })),
    or: document.querySelector('.login-sso-or')?.innerText,
    fonts, appFont: cs(document.body, 'fontFamily').split(',')[0],
    sideScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
  };
});

export default {
  name: 'gate-accounts-auth',
  async run(v) {
    const { page } = v;
    const log = (k, o) => v.note(k + ': ' + JSON.stringify(o));

    await v.goto('/routes/Login');
    await v.shot('signin', { fullPage: true });
    log('signin', await measure(page));
    v.step('sign-in page measured');

    await v.goto('/routes/NewAccount');
    await v.shot('signup', { fullPage: true });
    log('signup', await measure(page));
    v.step('sign-up page measured');

    for (const k of ['exists', 'failed', 'cancelled']) {
      await v.goto('/routes/Login?sso=' + k);
      const t = await page.locator('.login-expired, [role=status]').allInnerTexts();
      v.note(`sso=${k}: ${JSON.stringify(t)}`);
      await v.shot('sso-' + k, { fullPage: true });
    }
    v.step('sso outcome lines');

    await v.goto('/routes/ChooseUsername');
    v.note('ChooseUsername url=' + page.url() + ' body=' + JSON.stringify((await page.locator('body').innerText()).slice(0, 300)));
    await v.shot('chooseusername', { fullPage: true });

    await v.goto('/forgot-password');
    await v.shot('forgot', { fullPage: true });
    v.note('forgot body=' + JSON.stringify((await page.locator('main, .login-page, body').first().innerText()).slice(0, 400)));
    v.step('forgot-password page');

    // wrong password then the right one, typed like a person
    await v.goto('/routes/Login');
    await v.click(page.getByPlaceholder('Username'));
    await v.type('vt5');
    await v.click(page.getByPlaceholder('Password'));
    await v.type('not-the-password-1');
    await v.shot('wrong-typed');
    await v.click(page.locator('.login-submit-btn'));
    await page.locator('.login-error').waitFor({ timeout: 8000 }).catch(() => {});
    await sleep(500);
    v.note('wrong-password message: ' + JSON.stringify(await page.locator('.login-error').allInnerTexts()) + ' url=' + page.url());
    await v.burst('wrong-result', { frames: 4, gap: 120 });
    // focus ring: a mouse click leaves none
    v.note('submit outline after mouse click: ' + await page.locator('.login-submit-btn').evaluate(e => getComputedStyle(e).outlineStyle + ' ' + getComputedStyle(e).outlineWidth));
    v.step('wrong password shows a line');

    await page.getByPlaceholder('Password').fill('');
    await v.click(page.getByPlaceholder('Password'));
    await v.type(pw('vt5'));
    await page.keyboard.press('Enter');
    await page.waitForURL(u => !/Login/.test(u.toString()), { timeout: 10000 }).catch(() => {});
    await v.settle();
    v.note('after right password url=' + page.url() + ' local userName=' + await page.evaluate(() => localStorage.getItem('userName')));
    await v.shot('signed-in', { fullPage: false });
    if (/Login/.test(page.url())) throw new Error('right password did not sign in');
    v.step('signed in as vt5');
    if (!await v.noSideScroll()) throw new Error('page scrolls sideways');
  },
};
