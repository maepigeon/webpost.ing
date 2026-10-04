// Flow 3: profile. Own profile top to bottom, each tab, View as visitor, an empty profile (test3);
// on the account's own theme and on a dark theme set through PUT /api/users/test/theme (restored after).
import { readFileSync } from 'node:fs';
import { sleep } from '../lib.mjs';

// Neon Terminal as the account saved it through Customize (regenerate by saving that preset and GETting /api/users/test/theme).
const DARK = JSON.parse(readFileSync(new URL('../dark-theme.json', import.meta.url), 'utf8'));

const MASKS = ['.profile-banner-hit', '.profile-post-meta time', '.post-meta', '.profile-tab-count', '.profile-tab small'];

async function tabs(v, prefix) {
  const { page } = v;
  for (const name of ['Posts', 'Notes', 'Drafts', 'Subscribers']) {
    const tab = page.getByRole('tab', { name: new RegExp('^' + name) });
    if (!await tab.count()) { v.note(`no ${name} tab`); continue; }
    await v.click(tab);
    await sleep(500);
    await v.shot(`${prefix}-tab-${name.toLowerCase()}`, { fullPage: true, mask: MASKS });
    v.step(`${prefix}: ${name} tab`);
  }
}

async function run(v, prefix) {
  const { page } = v;
  await v.goto('/test');
  await page.locator('.profile-tab').first().waitFor();
  await v.shot(`${prefix}-top`, { mask: MASKS });
  await v.shot(`${prefix}-full`, { fullPage: true, mask: MASKS });
  v.step(`${prefix}: own profile`);
  if (!await v.noSideScroll()) throw new Error(`${prefix}: profile scrolls sideways`);
  await tabs(v, prefix);
  // visitor view
  await v.click(page.getByRole('button', { name: 'View as visitor' }));
  await sleep(500);
  await v.shot(`${prefix}-visitor`, { fullPage: true, mask: MASKS });
  v.step(`${prefix}: view as visitor`);
  await page.keyboard.press('Escape');
  await sleep(400);
  await v.goto('/test3');
  await sleep(400);
  await v.shot(`${prefix}-empty-test3`, { fullPage: true, mask: MASKS });
  v.step(`${prefix}: empty profile test3`);
}

export default {
  name: 'profile',
  async run(v) {
    await v.login('test');
    await v.goto('/robots.txt');
    const orig = await v.api('GET', '/api/users/test/theme');
    const origTheme = orig.body?.theme ?? null;
    v.onCleanup(async () => {
      const r = await v.api('PUT', '/api/users/test/theme', { theme: origTheme });
      if (!r.ok) v.note(`COULD NOT RESTORE test's theme: HTTP ${r.status}`);
    });

    await run(v, 'own');   // test's saved theme (Corkboard locally)

    const put = await v.api('PUT', '/api/users/test/theme', { theme: DARK });
    if (!put.ok) throw new Error(`could not set the dark theme: HTTP ${put.status} ${put.text.slice(0, 100)}`);
    v.note('dark theme = preset neon');
    await run(v, 'dark');
  },
};
