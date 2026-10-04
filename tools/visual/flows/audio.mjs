// Flow 7: audio. Play the audio post (test2's "Audio review" in the local data), navigate away,
// the mini player persists, close it. Skips when the data has no audio post.
import { sleep } from '../lib.mjs';

export default {
  name: 'audio',
  async run(v) {
    const { page } = v;
    await v.login('test');
    await v.goto('/robots.txt');
    const r = await v.api('GET', '/api/user/test2?limit=200&offset=0');
    const list = Array.isArray(r.body) ? r.body : (r.body?.posts || []);
    const post = list.find(p => /"audio"|audio\//i.test(p.description || ''));
    if (!post) { v.note('SKIPPED: no post with audio exists in the local data (test, test2, test3)'); return; }
    v.note(`audio post: test2 #${post.id} "${post.title}"`);
    await v.goto(`/test2/${post.id}`);
    await page.locator('h1').first().waitFor();
    await v.shot('audio-post', { fullPage: true });
    const play = page.locator('.audio-node button, .pa-play, button[aria-label="Play"], button[aria-label^="Play"]').first();
    await play.waitFor();
    await v.click(play);
    await page.locator('.mini-player').waitFor({ timeout: 6000 }).catch(() => {});
    await sleep(1200);
    v.step('audio started');
    await v.shot('audio-playing', { fullPage: false, mask: ['.mp-time', '.mp-seek', '.audio-time', '.audio-seek'] });
    // navigate away inside the app (no reload), the player must stay
    const home = page.locator('a.navButton:visible', { hasText: 'Home' }).first();
    await v.click(home);
    await page.waitForURL(u => new URL(u).pathname === '/', { timeout: 6000 }).catch(() => { throw new Error('clicking Home did not leave the audio post (still at ' + page.url() + ')'); });
    await v.settle();
    const still = await page.locator('.mini-player').count();
    await sleep(700);
    await v.burst('audio-after-nav', { frames: 4, gap: 100, mask: ['.mp-time', '.mp-seek', '.audio-time', '.audio-seek'], dynamic: true });
    await v.shot('audio-mini-player', { locator: '.mini-player', mask: ['.mp-time', '.mp-seek', '.audio-time', '.audio-seek'] });
    if (!still) throw new Error('the mini player vanished when navigating to Home');
    const mb = await page.locator('.mini-player').boundingBox();
    const vp = page.viewportSize();
    v.note(`mini player box ${JSON.stringify(mb)} in ${vp.width}x${vp.height}`);
    if (mb.x < -1 || mb.x + mb.width > vp.width + 1 || mb.y + mb.height > vp.height + 1) throw new Error('mini player is partly off-screen');
    v.step('mini player persists across navigation');
    await v.click(page.getByRole('button', { name: 'Close player' }));
    await sleep(500);
    if (await page.locator('.mini-player').count()) throw new Error('Close did not remove the mini player');
    v.step('mini player closed');
    await v.shot('audio-closed', { fullPage: false });
  },
};
