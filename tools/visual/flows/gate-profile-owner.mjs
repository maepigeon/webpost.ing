// gate-profile: own profile, every owner button present, fonts, focus rings, tabs by mouse and by arrow keys, counts agree.
import { sleep } from '../lib.mjs';
import { MASKS, makePost, fonts, ringCheck, keyRing, CONTROLS } from './gate-profile-lib.mjs';

export default {
  name: 'gate-profile-owner',
  async run(v) {
    const { page } = v;
    await v.login('test');
    await makePost(v, 'gate-profile draft one', false);
    await v.goto('/test');
    await page.locator('.profile-tab').first().waitFor();
    await v.shot('top', { mask: MASKS });
    await v.shot('full', { fullPage: true, mask: MASKS });
    v.step('own profile loaded');
    if (!await v.noSideScroll()) throw new Error('profile scrolls sideways');

    // every owner button
    const want = ['Set profile picture', 'Edit banner', 'Edit bio', 'Edit links', 'View as visitor', 'Export data'];
    const names = await page.getByRole('button').allInnerTexts();
    const missing = want.filter(w => !names.some(n => n.trim() === w));
    const hasCustomize = await page.getByRole('link', { name: 'Customize' }).count();
    v.note(`owner buttons: missing = ${missing.join(', ') || 'none'}; Customize link = ${hasCustomize}; Arrange posts = ${await page.getByRole('button', { name: 'Arrange posts' }).count()}; + New grid post = ${await page.getByRole('button', { name: /New grid post/ }).count()}`);
    if (missing.length || !hasCustomize) throw new Error('missing owner buttons: ' + missing.join(', '));
    // the buttons sit inside the window
    const geo = await v.geometry('.profile-owner-actions .edit-bio-btn, .profile-owner-actions a');
    v.note('owner buttons geometry (x,w,inside): ' + geo.map(g => `${g.x},${g.w},${g.inside}`).join(' | '));
    if (geo.some(g => g.x < 0 || g.x + g.w > page.viewportSize().width)) throw new Error('an owner button sticks out of the window');
    v.step('owner buttons present and inside the window');
    await fonts(v, 'profile', CONTROLS);

    // counts: tab counts vs what the list shows
    const counts = await page.evaluate(() => [...document.querySelectorAll('.profile-tab')].map(t => ({ label: t.querySelector('span')?.innerText, count: t.querySelector('.profile-tab-count')?.innerText ?? null })));
    v.note('tab counts: ' + counts.map(c => `${c.label}=${c.count ?? '(hidden)'}`).join(', '));
    const nPosts = await page.locator('#profile-tabpanel .profile-post-item').count();
    const postsTab = counts.find(c => c.label === 'Posts');
    v.note(`Posts tab count ${postsTab?.count} vs post items on the page ${nPosts}`);
    if (postsTab?.count && Number(postsTab.count) !== nPosts) v.note('FINDING? Posts tab count differs from items shown (pinned or folder items may account for it)');
    const hdr = await page.locator('.profile-banner-hit').allInnerTexts().catch(() => []);
    v.note('header counts: ' + hdr.join(' | '));

    // focus rings: mouse leaves none, Tab shows one
    const m1 = await ringCheck(v, 'Posts tab', page.getByRole('tab', { name: /^Posts/ }));
    if (m1.vis) throw new Error('a mouse click left a focus-visible ring on the Posts tab');
    const k1 = await keyRing(v, 'control before the tabs (Shift+Tab)', 'Shift+Tab');
    if (!k1.vis) throw new Error('keyboard focus shows no focus-visible state');
    await v.shot('ring-tab', { keepPointer: true, dynamic: true });
    v.step('mouse click leaves no ring, Tab shows one');

    // tabs by mouse
    for (const name of ['Notes', 'Drafts', 'Subscribers', 'Posts']) {
      const tab = page.getByRole('tab', { name: new RegExp('^' + name) });
      await v.click(tab);
      await sleep(450);
      if (await tab.getAttribute('aria-selected') !== 'true') throw new Error(`${name} tab did not become selected on click`);
      const ring = await page.evaluate(() => document.activeElement.matches(':focus-visible'));
      if (ring) v.note(`FINDING: ${name} tab shows a focus ring after a mouse click`);
      await v.shot('tab-' + name.toLowerCase(), { mask: MASKS, dynamic: name !== 'Posts', fullPage: true });
    }
    v.step('tabs by mouse');
    // Drafts tab shows the draft
    await v.click(page.getByRole('tab', { name: /^Drafts/ }));
    await sleep(400);
    const draftShown = await page.getByText('gate-profile draft one').count();
    v.note('draft post visible on Drafts tab: ' + draftShown);
    await v.click(page.getByRole('tab', { name: /^Posts/ }));
    await sleep(300);

    // tabs by arrow keys (focus is on the Posts tab after the click)
    const order = ['Posts', 'Notes', 'Drafts', 'Subscribers'];
    const sel = async () => page.evaluate(() => document.querySelector('.profile-tab[aria-selected="true"]').innerText.replace(/\d+/g, '').trim());
    const keys = [['ArrowRight', 'Notes'], ['ArrowRight', 'Drafts'], ['ArrowRight', 'Subscribers'], ['ArrowRight', 'Posts'], ['ArrowLeft', 'Subscribers'], ['Home', 'Posts'], ['End', 'Subscribers'], ['Home', 'Posts']];
    for (const [k, expect] of keys) {
      await page.keyboard.press(k);
      await sleep(350);
      const got = await sel();
      v.note(`${k} -> ${got}${got === expect ? '' : ' (expected ' + expect + ')'}`);
      if (got !== expect) throw new Error(`${k} selected "${got}", expected "${expect}"`);
      if (k === 'ArrowRight' && expect === 'Notes') {
        const ring = await page.evaluate(() => { const e = document.activeElement; const s = getComputedStyle(e); return e.matches(':focus-visible') + ' ' + s.outlineStyle + ' ' + s.outlineWidth + ' ' + s.boxShadow.slice(0, 40); });
        v.note('tab ring after ArrowRight: ' + ring);
      }
    }
    await v.burst('tabs-keys', { frames: 4, gap: 100, locator: '.profile-tabs', dynamic: true });
    v.step('tabs by arrow keys, Home and End');
    await v.shot('end', { fullPage: true, mask: MASKS });
  },
};
