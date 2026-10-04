// gate-small: Activity tabs, Discover, Search, Messages, discussion header (vt4).
import { sleep } from '../lib.mjs';
import { loginVt4, fontReport, widths } from './gate-small-lib.mjs';

export default {
  name: 'gate-small-nav',
  async run(v) {
    const { page } = v;
    const bad = [];
    await loginVt4(v);
    await v.goto('/');
    await v.goto('/activity/vt4');
    await v.shot('activity-first', { dynamic: true });
    const tabs = page.getByRole('tab');
    const n = await tabs.count();
    v.note('activity tabs: ' + (await tabs.allInnerTexts()).join(' | '));
    for (let i = 0; i < n; i++) {
      await v.click(tabs.nth(i));
      await sleep(500);
      await v.shot('activity-tab' + i, { dynamic: true });
      if (!await v.noSideScroll()) bad.push('activity tab ' + i + ' scrolls sideways');
    }
    await v.click(tabs.first()); await page.keyboard.press('ArrowRight'); await sleep(300);
    v.note('after ArrowRight, selected: ' + await page.locator('[role=tab][aria-selected=true]').first().innerText());
    await v.shot('activity-keyboard', { dynamic: true });
    await v.click(tabs.first()); await page.keyboard.press('Tab'); await sleep(200);
    v.note('Tab focus: ' + JSON.stringify(await page.evaluate(() => { const e = document.activeElement; const c = getComputedStyle(e); return { el: e.tagName + '.' + (e.className?.toString() || ''), outline: c.outlineStyle + ' ' + c.outlineWidth + ' ' + c.outlineColor, shadow: c.boxShadow.slice(0, 80) }; })));
    await v.shot('activity-tabfocus', { dynamic: true, keepPointer: true });
    const act = await page.evaluate(() => { const t = document.querySelector('[role=tab][aria-selected=true]'); const r = t.getBoundingClientRect(), s = t.querySelector('span').getBoundingClientRect(); return { tabH: Math.round(r.height), labelH: Math.round(s.height), labelTopOffset: Math.round(s.top - r.top) }; });
    v.note('active activity tab: ' + JSON.stringify(act));
    await fontReport(v, '[role=tab], .activity-back-link', 'activity');
    v.step('activity tabs');

    // Discover: tab width steady
    await v.goto('/discover');
    const w0 = await widths(page, '.discover-tab');
    await v.shot('discover-posts', { dynamic: true });
    await v.click(page.getByRole('tab', { name: 'People' }));
    await sleep(600);
    const w1 = await widths(page, '.discover-tab');
    await v.shot('discover-people', { dynamic: true });
    await v.click(page.getByRole('tab', { name: 'Posts' }));
    await sleep(600);
    const w2 = await widths(page, '.discover-tab');
    v.note('discover tab [x,width]: posts ' + JSON.stringify(w0) + ' people ' + JSON.stringify(w1) + ' back ' + JSON.stringify(w2));
    if (JSON.stringify(w0) !== JSON.stringify(w1) || JSON.stringify(w0) !== JSON.stringify(w2)) bad.push('Discover tabs change width/position when switching');
    await fontReport(v, '.discover-tab, .following-more', 'discover');
    if (!await v.noSideScroll()) bad.push('discover scrolls sideways');
    const ring = () => page.evaluate(() => { const e = document.activeElement, c = getComputedStyle(e); return e.tagName + '.' + (e.className?.toString().split(' ')[0] || '') + ' outline=' + c.outlineStyle + ' ' + c.outlineWidth + ' ' + c.outlineColor + ' shadow=' + c.boxShadow.slice(0, 70) + ' fvis=' + e.matches(':focus-visible'); });
    v.note('after mouse click on tab: ' + await ring());
    await page.keyboard.press('Tab'); await sleep(200);
    v.note('after Tab key: ' + await ring());
    await v.shot('discover-tabfocus', { dynamic: true, keepPointer: true });
    await v.burst('discover-switch', { frames: 4, gap: 80, dynamic: true });
    v.step('discover');

    // Search
    await v.goto('/search');
    const input = page.locator('.search-input');
    await v.click(input);
    await v.type('tes');
    await sleep(700);
    await v.shot('search-typing', { dynamic: true });
    await v.type('t');
    await page.keyboard.press('Enter');
    await sleep(1200);
    await v.shot('search-results', { dynamic: true });
    v.note('search cards: ' + await page.locator('.search-user-card').count());
    await fontReport(v, '.search-input, .search-btn, .search-user-card-name', 'search');
    if (!await v.noSideScroll()) bad.push('search scrolls sideways');
    v.step('search');

    // Messages (read only: messages cannot be deleted, so nothing is sent)
    await v.goto('/messages');
    await v.shot('messages-list', { dynamic: true });
    const newBtn = page.getByRole('button', { name: 'New', exact: true }).first();
    if (await newBtn.count()) { await v.click(newBtn); await sleep(600); await v.shot('messages-new', { dynamic: true }); await page.keyboard.press('Escape'); await sleep(300); }
    const conv = page.locator('.messages-conv, .messages-conv-item, [class*="conv"] button, [class*="conv"] a').first();
    if (await conv.count()) { await v.click(conv); await sleep(700); await v.shot('messages-thread', { dynamic: true }); }
    else v.note('messages: vt4 has no conversations');
    await fontReport(v, '.messages-page button, .messages-page input, .messages-page textarea', 'messages');
    if (!await v.noSideScroll()) bad.push('messages scrolls sideways');
    v.step('messages');

    // Discussion page header
    const id = process.env.GATE_POST;
    await v.goto(`/vt4/${id}/discussion`);
    await v.shot('discussion', { dynamic: true });
    if (!await v.noSideScroll()) bad.push('discussion page scrolls sideways');
    const head = await page.evaluate(() => { const h = document.querySelector('h1, .discussion-title, .discussion-header'); if (!h) return null; const r = h.getBoundingClientRect(); return { x: Math.round(r.x), right: Math.round(r.right), vw: innerWidth, sw: document.documentElement.scrollWidth, text: h.innerText.slice(0, 60) }; });
    v.note('discussion header ' + JSON.stringify(head));
    await fontReport(v, '.discussion-page button, .discussion-compose textarea, .discussion-page a', 'discussion');
    v.step('discussion');
    if (bad.length) throw new Error(bad.join('; '));
  },
};
