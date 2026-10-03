import { check, login, assert, uniq, createDraftPost, api, sleep } from '../lib.mjs';

check('discover: the page lists a fresh public post, not a draft', async t => {
  const owner = await t.newUser('test');
  const title = uniq('smoke discover');
  await createDraftPost(owner, { title, published: true }, t);
  const hidden = uniq('smoke discover draft');
  await createDraftPost(owner, { title: hidden, published: false }, t);

  const page = await t.newUser('test2');
  await page.goto('/discover');
  await page.locator('h1.following-title').waitFor();
  await page.locator('.following-list').waitFor();
  await page.locator('.following-item', { hasText: title }).first().waitFor();
  assert(await page.locator('.following-item', { hasText: hidden }).count() === 0, 'a draft is listed on Discover');
  await page.getByRole('tab', { name: 'People' }).click();
  await page.locator('.discover-person').first().waitFor();
}, { area: 'discover' });

check('discover: an @mention in a comment notifies the person mentioned', async t => {
  const owner = await t.newUser('test');
  const writer = await t.newUser('test2');
  const target = await t.newUser('test3');
  const title = uniq('smoke mention');
  const id = await createDraftPost(owner, { title, published: true }, t);
  const marker = 'smoke mention ' + Date.now();
  const on = await api(owner, 'PUT', `/api/posts/${id}/discussion`, { enabled: true });
  assert(on.status === 200, `turning the discussion on: HTTP ${on.status}`);

  await writer.goto(`/test/${id}/discussion`);
  const box = writer.locator('.discussion-compose textarea');
  await box.waitFor();
  await box.fill(`${marker} hello @test3`);
  await writer.getByRole('button', { name: 'Post comment' }).first().click();
  await writer.getByText(marker).first().waitFor();

  // The mentioned user finds it in the inbox, and the link leads to the comment.
  t.onCleanup(async () => {
    const list = await api(target, 'GET', '/api/notifications?limit=50&offset=0');
    for (const n of Array.isArray(list.body) ? list.body : [])
      if (n.postId === id) await api(target, 'DELETE', `/api/notifications/${n.id}`);
  });
  await target.goto('/inbox');
  const item = target.locator('.inbox-item', { hasText: 'mentioned you' }).filter({ hasText: title }).first();
  await item.waitFor();
  assert((await item.innerText()).includes('test2'), 'the notification does not name who mentioned you');
  await item.locator('.inbox-post-link').click();
  await target.waitForURL(u => new URL(u).pathname.endsWith('/discussion'));
  await target.getByText(marker).first().waitFor();
}, { area: 'discover' });
