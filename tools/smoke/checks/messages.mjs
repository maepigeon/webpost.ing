import { check, assert, api, sleep, noHorizontalScroll } from '../lib.mjs';

const input = page => page.locator('.messages-input');

check('messages: send, notification opens the conversation, reactions, unsent text kept', async t => {
  const sender = await t.newUser('test');
  const reader = await t.newUser('test2');
  const marker = 'smoke message ' + Date.now().toString(36);

  // Whatever happens, take our message notification away again.
  t.onCleanup(async () => {
    const list = await api(reader, 'GET', '/api/notifications?limit=50&offset=0');
    for (const n of Array.isArray(list.body) ? list.body : [])
      if (n.type === 'message' && (n.message || '').includes('smoke message')) await api(reader, 'DELETE', `/api/notifications/${n.id}`);
  });

  t.step('send');
  await sender.goto('/messages?with=test2');
  await input(sender).waitFor();
  await input(sender).fill(marker);
  await sender.getByRole('button', { name: 'Send' }).click();
  await sender.locator('.messages-bubble-text', { hasText: marker }).first().waitFor();
  assert((await input(sender).inputValue()) === '', 'the box still holds the text after Send');

  t.step('notification');
  await reader.goto('/inbox');
  const note = reader.locator('.inbox-item', { hasText: marker }).first();
  await note.waitFor();
  await note.click();
  await reader.waitForURL(u => new URL(u).pathname === '/messages');
  await reader.locator('.messages-bubble-text', { hasText: marker }).first().waitFor();
  assert(await reader.locator('.messages-thread-header').innerText().then(s => s.includes('test')), 'the open thread is not the one with test');

  t.step('reaction picker');
  const bubble = reader.locator('.messages-bubble-wrap', { hasText: marker }).first();
  await bubble.hover();
  await bubble.getByTitle('React').click();
  const picker = reader.locator('.messages-emoji-picker').first();
  await picker.waitFor();
  const box = await picker.boundingBox();
  const vp = reader.viewportSize();
  assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width && box.y + box.height <= vp.height,
    `the reaction picker is outside the window (${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)} in ${vp.width}x${vp.height})`);
  const thread = await reader.locator('.messages-thread-body').boundingBox();
  assert(box.y >= thread.y - 1, 'the reaction picker is cut off at the top of the conversation');
  await picker.locator('.messages-emoji-btn').first().click();
  await reader.locator('.messages-reaction-chip').first().waitFor();
  await reader.locator('.messages-reaction-chip').first().click(); // take our reaction off again

  t.step('unsent text');
  const draft = 'unsent draft ' + Date.now().toString(36);
  await input(reader).fill(draft);
  await sleep(1500);
  await reader.reload();
  await input(reader).waitFor().catch(() => {});
  if (!await input(reader).count()) {
    // After a reload the thread is not open by itself: pick it from the list.
    await reader.locator('.messages-conv-item', { hasText: 'test' }).first().click();
    await input(reader).waitFor();
  }
  const kept = await input(reader).inputValue();
  assert(kept === draft, `unsent text was not restored after a reload (box holds "${kept}")`);
  await input(reader).fill('');
  await sleep(1200);
}, { area: 'messages' });

check('messages: phone width, list then thread, no sideways scroll', async t => {
  const page = await t.newUser('test', { width: 390, height: 844 });
  await page.goto('/messages?with=test2');
  await input(page).waitFor();
  assert(await noHorizontalScroll(page), 'the open conversation scrolls sideways at 390px');
  await page.getByRole('button', { name: 'Back to conversations' }).click();
  await page.locator('.messages-conv-item').first().waitFor();
  assert(await noHorizontalScroll(page), 'the conversation list scrolls sideways at 390px');
}, { area: 'messages' });
