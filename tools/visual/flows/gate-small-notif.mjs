// gate-small: notifications (vt4). Every row names its subject as a link, the whole row opens it,
// the quiet line shows the comment, nothing says a bare "your post", the badge clears, the title is not cut off.
import { sleep } from '../lib.mjs';
import { loginVt4, fontReport } from './gate-small-lib.mjs';

const badgeText = page => page.evaluate(() => {
  const out = [];
  document.querySelectorAll('nav a, nav button, header a, header button').forEach(e => {
    const t = (e.innerText + ' ' + (e.getAttribute('aria-label') || '')).replace(/\s+/g, ' ').trim();
    if (/Notifications|More/.test(t)) out.push(t + ' [' + [...e.querySelectorAll('[class*=badge],[class*=dot]')].map(b => b.className + ':' + b.innerText).join(',') + ']');
  });
  return out.join(' || ');
});

export default {
  name: 'gate-small-notif',
  async run(v) {
    const { page } = v;
    const bad = [];
    await loginVt4(v);
    await v.goto('/');
    v.note('badge before: ' + await badgeText(page));
    await v.shot('notif-home-bar', { dynamic: true });
    // open the page the way a person does
    const direct = page.locator('a.navButton:visible', { hasText: 'Notifications' }).first();
    if (await direct.count()) await v.click(direct);
    else { await v.click(page.getByRole('button', { name: /^More/ }).first()); await v.click(page.getByRole('menuitem', { name: /^Notifications/ }).first()); }
    await page.waitForURL(u => new URL(u).pathname === '/inbox'); await v.settle(800);
    await v.shot('notif-list', { dynamic: true, keepPointer: true });
    const rows = await page.evaluate(() => [...document.querySelectorAll('.inbox-item')].slice(0, 10).map(r => {
      const lab = r.querySelector('.inbox-item-label'), ex = r.querySelector('.inbox-item-excerpt');
      const links = [...r.querySelectorAll('.inbox-item-label a')].map(a => a.className.replace('inbox-', '') + '=' + a.getAttribute('href'));
      const cs = ex && getComputedStyle(ex);
      const lh = ex ? parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3 : 0;
      return {
        unread: r.classList.contains('inbox-item--unread'),
        text: (lab.querySelector('span > span') || lab).innerText.replace(/\s+/g, ' '),
        excerpt: ex ? ex.innerText.slice(0, 70) : null,
        excerptLines: ex ? Math.round(ex.getBoundingClientRect().height / lh) : 0,
        clamp: ex ? cs.webkitLineClamp + '/' + cs.overflow + '/' + cs.display : null,
        links,
        labelCut: lab.scrollWidth > lab.clientWidth + 1,
        rowCut: r.scrollWidth > r.clientWidth + 1,
        labelFont: getComputedStyle(lab).fontFamily.split(',')[0],
        box: (() => { const b = r.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.right), innerWidth]; })(),
      };
    }));
    v.note('rows: ' + rows.length);
    rows.forEach((r, i) => {
      v.note(`row ${i}: ${JSON.stringify(r)}`);
      if (/your post\b/i.test(r.text) && !/your comment on/i.test(r.text)) bad.push(`row ${i} says a bare "your post"`);
      if (/(commented|replied|mentioned|reacted|published)/.test(r.text) && !r.links.some(l => l.startsWith('post-link'))) bad.push(`row ${i} has no subject link`);
      if (r.excerptLines > 2) bad.push(`row ${i} excerpt is ${r.excerptLines} lines`);
      if (r.labelCut || r.rowCut) bad.push(`row ${i} text is cut off`);
    });
    if (!await v.noSideScroll()) bad.push('inbox scrolls sideways');
    await fontReport(v, '.inbox-item, .inbox-mark-all, .inbox-item-excerpt', 'inbox');
    await v.burst('notif-rows', { frames: 2, gap: 100, dynamic: true, keepPointer: true });
    // open one: click the quiet line (or the time) so it is the row, not the link, that is hit
    const target = page.locator('.inbox-item--unread').first();
    if (await target.count()) {
      const before = await badgeText(page);
      const spot = target.locator('.inbox-item-excerpt, .inbox-item-time').first();
      await v.click(spot);
      await sleep(900);
      v.note('opened row -> ' + new URL(page.url()).pathname + new URL(page.url()).hash);
      await v.shot('notif-opened', { dynamic: true });
      const hl = await page.evaluate(() => { const h = location.hash && document.querySelector(location.hash); return h ? { found: true, y: Math.round(h.getBoundingClientRect().y), text: h.innerText.slice(0, 80) } : { found: false }; });
      v.note('comment target: ' + JSON.stringify(hl));
      const after = await badgeText(page);
      v.note('badge before open: ' + before); v.note('badge after open: ' + after);
      if (before === after) bad.push('badge did not change after opening a row');
      if (!/discussion|\/\d+/.test(page.url())) bad.push('row click did not open its subject: ' + page.url());
    } else v.note('no unread row to open');
    if (bad.length) throw new Error(bad.join('; '));
  },
};
