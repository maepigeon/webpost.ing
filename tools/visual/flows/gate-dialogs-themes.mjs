// gate-dialogs: avatar popup, followers list, bio-link warning, Share menu, send-in-message, Report, account menu, More,
// over a light textured page (Corkboard: /test) and a dark one (Neon: /test2). Nothing is sent or saved.
import { sleep } from '../lib.mjs';
import { dialogRound, finish, loginOnce, ring, raw } from './gate-dialogs-helpers.mjs';

async function profileAndPost(v, tag, P, Q, withLink) {
  const { page } = v;
  await v.goto('/' + P);
  await raw(v, `${tag}-profile`);
  await dialogRound(v, { id: `${tag}-avatar`, opener: page.getByRole('button', { name: `${P}'s profile picture` }), card: '.avatar-popup-card', overlay: '.avatar-popup-overlay', closeWith: ['Escape', page.locator('.avatar-popup-close')] });
  await dialogRound(v, { id: `${tag}-followers`, opener: page.getByRole('button', { name: /followers: show them/ }), card: '.follow-modal', overlay: '.follow-modal-overlay', closeWith: ['Escape', page.locator('.follow-modal-close')] });
  if (withLink) {
    await dialogRound(v, { id: `${tag}-linkwarn`, opener: page.locator('a', { hasText: 'My website' }), card: '.dialog-box', overlay: '.dialog-overlay', closeWith: ['Escape', page.locator('.dialog-close')] });
  }
  await v.goto(`/${P}/${Q}`);
  await raw(v, `${tag}-post`);
  const share = page.locator('.share-menu-wrapper > button').first();
  await dialogRound(v, { id: `${tag}-sharemenu`, opener: share, card: '.share-menu', overlay: '.share-menu', closeWith: ['Escape'] });
  await dialogRound(v, {
    id: `${tag}-sendmsg`, opener: share, focusEl: share, card: '.share-post-dialog', overlay: '.share-post-backdrop',
    openSeq: async () => { await v.click(share); await page.locator('.share-menu').waitFor(); await sleep(250); await v.click(page.locator('.share-menu-item', { hasText: /message/i }).first()); },
    closeWith: ['Escape', page.locator('.share-post-dialog button', { hasText: /cancel|close/i }).first()],
  });
  await dialogRound(v, { id: `${tag}-report`, opener: page.getByRole('button', { name: 'Report', exact: true }), card: '.report-dialog', overlay: '.report-overlay', closeWith: ['Escape', page.locator('.report-dialog button', { hasText: /cancel|close/i }).first()] });
}

export default {
  name: 'gate-dialogs-themes',
  async run(v) {
    const { page } = v;
    await loginOnce(v);
    // menus first, on a plain page
    await v.goto('/');
    await dialogRound(v, { id: 'menu-account', opener: page.getByRole('button', { name: /Account menu for/ }), card: '[role=menu]', overlay: '[role=menu]', closeWith: ['Escape'] });
    const more = page.getByRole('button', { name: /^More/ });
    if (await more.count()) await dialogRound(v, { id: 'menu-more', opener: more, card: '[role=menu]', overlay: '[role=menu]', closeWith: ['Escape'] });
    await profileAndPost(v, 'cork', 'test', 'grid', true);
    await profileAndPost(v, 'neon', 'test2', 'audio-review', false);
    // the account menu over the dark themed page too
    await v.goto('/test2');
    await dialogRound(v, { id: 'neon-account', opener: page.getByRole('button', { name: /Account menu for/ }), card: '[role=menu]', overlay: '[role=menu]', closeWith: ['Escape'] });
    if (!await v.noSideScroll()) v.note('page scrolls sideways');
    finish(v);
  },
};
