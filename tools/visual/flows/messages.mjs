// Flow 5: Messages. test2 sends test3 a message (sender's view), test3 gets the notification, clicks it,
// lands in the conversation, reacts to the first message (picker position), then cleans up.
import { sleep } from '../lib.mjs';

const TEXT = 'Visual check: hello from test2';

export default {
  name: 'messages',
  async run(v) {
    const { page } = v;
    // ---- test2 sends (second browser context, same viewport) ----------------------------------
    const other = await v.otherUser('test2');
    await other.goto('/messages?with=test3');
    await other.locator('.messages-input').waitFor();
    await sleep(600);
    const ta = other.locator('.messages-input');
    await ta.click();
    await other.keyboard.type(TEXT, { delay: 30 });
    await v.shot('sender-typed', { page: other, mask: ['.messages-conv-preview'], dynamic: true });
    await other.locator('.messages-send-btn').click();
    await other.getByText(TEXT).last().waitFor();
    await sleep(500);
    await v.shot('sender-sent', { page: other, mask: ['.messages-conv-preview'], dynamic: true });
    v.step('test2 sends a message to test3');

    // ---- test3 receives, in the recorded context ---------------------------------------------------
    await v.login('test3');
    v.onCleanup(async () => { await v.api('DELETE', '/api/notifications'); });
    await v.goto('/');
    await v.shot('receiver-home-bar', { locator: 'nav, header' });
    await v.goto('/inbox');
    const item = page.locator('.inbox-item--unread', { hasText: /message/i }).first();
    await item.waitFor();
    await v.shot('inbox', { mask: ['.inbox-item-label'] });  // label text names the sender; only its box matters
    v.step('notification appears in the inbox');
    await v.click(item);
    await page.waitForURL(u => u.pathname === '/messages', { timeout: 8000 });
    await page.locator('.messages-bubble').first().waitFor();
    await sleep(700);
    if (!(await page.url()).includes('with=test2')) throw new Error('notification opened ' + page.url() + ' (expected the conversation with test2)');
    await page.getByText(TEXT).last().waitFor();
    v.step('notification click opens the conversation with test2');
    // Messages pile up in the local database (there is no delete), so compare only the top of the thread.
    await page.evaluate(() => { const b = document.querySelector('.messages-thread-body'); if (b) b.scrollTop = 0; });
    await sleep(300);
    const TOP = { x: 0, y: 0, width: page.viewportSize().width, height: 330 };
    await v.shot('conversation-top', { mask: ['.messages-conv-preview'], clip: TOP });
    await v.shot('conversation', { mask: ['.messages-conv-preview'], dynamic: true });

    // ---- reaction picker on the FIRST message of the thread -----------------------------------------------
    await page.evaluate(() => { const b = document.querySelector('.messages-thread-body'); if (b) b.scrollTop = 0; });
    await sleep(300);
    const first = page.locator('.messages-bubble-wrap').first();
    await first.hover();
    const react = first.locator('button[title="React"]');
    await react.waitFor();
    await v.click(react);
    const picker = page.locator('.messages-emoji-picker');
    await picker.waitFor();
    await v.burst('picker-first-message', { frames: 5, gap: 160, mask: ['.messages-conv-preview'], clip: TOP, keepPointer: true });
    const pb = await picker.boundingBox();
    const head = await page.locator('.messages-thread-header').boundingBox();
    const bar = await page.locator('nav, header').first().boundingBox();
    const vw = page.viewportSize().width;
    v.note(`picker box ${JSON.stringify(pb)}; thread header ${JSON.stringify(head)}`);
    if (pb.x < 0 || pb.x + pb.width > vw + 1) throw new Error(`reaction picker sticks out sideways: x=${Math.round(pb.x)} w=${Math.round(pb.width)}`);
    if (head && pb.y < head.y + head.height - 1) throw new Error(`reaction picker is hidden behind the thread header (picker top ${Math.round(pb.y)}, header bottom ${Math.round(head.y + head.height)})`);
    if (bar && pb.y < bar.y + bar.height - 1) throw new Error('reaction picker is hidden behind the top bar');
    v.step('picker on the first message stays inside the thread');
    const emoji = picker.locator('.messages-emoji-btn').first();
    await v.click(emoji);
    await sleep(500);
    await v.shot('reacted', { mask: ['.messages-conv-preview'], clip: TOP, keepPointer: true });
    v.step('reaction added');
    // undo the reaction (toggle) so the thread is as it was
    await first.hover();
    const chip = first.locator('.messages-reaction-chip--active').first();
    if (await chip.count()) await v.click(chip);
    if (!await v.noSideScroll()) throw new Error('Messages scrolls sideways');
  },
};
