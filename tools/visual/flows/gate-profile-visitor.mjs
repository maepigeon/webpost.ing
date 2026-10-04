// gate-profile: View as visitor (owner preview) and a signed-out visitor at /test. No owner controls, no drafts, counts agree.
import { sleep } from '../lib.mjs';
import { MASKS, makePost, fonts } from './gate-profile-lib.mjs';

const OWNER = ['Edit banner', 'Edit bio', 'Edit links', 'Export data', 'Set profile picture', 'Arrange posts', '+ Sticker', 'Customize', 'Delete', 'New grid post'];

async function ownerLeft(page) {
  const texts = (await page.locator('#root button, #root a').allInnerTexts()).map(t => t.trim());
  return OWNER.filter(o => texts.some(t => t === o || t.includes(o)));
}
async function tabCounts(page) {
  return page.evaluate(() => [...document.querySelectorAll('.profile-tab')].map(t => `${t.querySelector('span')?.innerText}=${t.querySelector('.profile-tab-count')?.innerText ?? '-'}`).join(', '));
}

export default {
  name: 'gate-profile-visitor',
  async run(v) {
    const { page } = v;
    await v.login('test');
    await makePost(v, 'gate-profile visitor draft', false);
    await v.goto('/test');
    await page.locator('.profile-tab').first().waitFor();
    const ownerTabs = await tabCounts(page);
    v.note('owner tab counts: ' + ownerTabs);
    const ownerItems = await page.locator('#profile-tabpanel .profile-post-item').count();

    await v.click(page.getByRole('button', { name: 'View as visitor' }));
    await page.getByText('Viewing your profile as a visitor').waitFor();
    await sleep(500);
    v.step('preview starts');
    await v.burst('preview-start', { frames: 4, gap: 100, dynamic: true, mask: MASKS });
    await v.shot('preview-top', { dynamic: true, mask: MASKS });
    await v.shot('preview-full', { fullPage: true, dynamic: true, mask: MASKS });
    const left = await ownerLeft(page);
    v.note('owner controls still present in preview: ' + (left.join(', ') || 'none'));
    if (left.length) throw new Error('owner controls visible in the preview: ' + left.join(', '));
    const pTabs = await tabCounts(page);
    v.note('preview tab counts: ' + pTabs);
    const pItems = await page.locator('#profile-tabpanel .profile-post-item').count();
    v.note(`posts shown in preview ${pItems} (owner view ${ownerItems}); drafts hidden: ${await page.getByText('gate-profile visitor draft').count() === 0}`);
    if (await page.getByText('gate-profile visitor draft').count()) throw new Error('a draft shows in the visitor preview');
    const bar = page.locator('.view-as-bar');
    const bb = await bar.boundingBox();
    v.note(`preview bar at y=${Math.round(bb.y)} h=${Math.round(bb.height)} w=${Math.round(bb.width)}`);
    await fonts(v, 'preview', ['.view-as-bar button', '.view-as-bar span', '.follow-btn', '.profile-tab']);
    if (!await v.noSideScroll()) throw new Error('preview scrolls sideways');
    // the Follow stand-in and the tabs by mouse
    if (await page.getByRole('tab').count()) { await v.click(page.getByRole('tab', { name: /^Notes/ })); await sleep(300); await v.click(page.getByRole('tab', { name: /^Posts/ })); await sleep(300); }
    else v.note('no tab bar in the preview (visitor sees only Posts)');
    await v.click(page.getByRole('button', { name: 'Back to editing' }));
    await sleep(500);
    if (!(await page.getByRole('button', { name: 'Edit bio' }).count())) throw new Error('Back to editing did not bring the owner buttons back');
    v.step('Back to editing restores the owner view');
    const after = await tabCounts(page);
    v.note('after returning, tab counts: ' + after);
    if (after !== ownerTabs) throw new Error(`counts changed ${ownerTabs} -> ${after}`);

    // a signed-out visitor
    const ctx = await v.context.browser().newContext({ viewport: page.viewportSize(), hasTouch: v.phone, isMobile: v.phone, deviceScaleFactor: 1, baseURL: v.base });
    v.onCleanup(() => ctx.close());
    const vp = await ctx.newPage();
    await vp.goto('/test');
    await vp.locator('.profile-tab, .profile-banner').first().waitFor();
    await vp.waitForLoadState('networkidle').catch(() => {});
    await sleep(900);
    await v.shot('signedout-top', { page: vp, dynamic: true, mask: MASKS });
    await v.shot('signedout-full', { page: vp, fullPage: true, dynamic: true, mask: MASKS });
    const left2 = await ownerLeft(vp);
    v.note('signed-out visitor sees owner controls: ' + (left2.join(', ') || 'none'));
    if (left2.length) throw new Error('signed-out visitor sees: ' + left2.join(', '));
    const vt = await tabCounts(vp);
    const vi = await vp.locator('#profile-tabpanel .profile-post-item').count();
    v.note(`signed-out tab counts: ${vt}; items shown ${vi}; drafts hidden: ${await vp.getByText('gate-profile visitor draft').count() === 0}`);
    const hits = await vp.locator('.profile-banner-hit').allInnerTexts().catch(() => []);
    v.note('signed-out header counts: ' + hits.join(' | '));
    if (await vp.getByText('gate-profile visitor draft').count()) throw new Error('a draft shows to a signed-out visitor');
    const sw = await vp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    if (!sw) throw new Error('signed-out profile scrolls sideways');
    v.step('signed-out visitor: no owner controls, no drafts');
  },
};
