// Flow 2: write and publish. Title, text, description, a Button block, publish, view the post,
// back to the profile card, delete it.
import { sleep } from '../lib.mjs';

const TITLE = 'Visual flow post';

async function deleteTitled(v) {
  const r = await v.api('GET', '/api/user/test?limit=200&offset=0');
  const list = Array.isArray(r.body) ? r.body : (r.body?.posts || []);
  for (const p of list) if ((p.title || '').startsWith(TITLE)) await v.api('DELETE', `/api/posts/${p.id}`);
}

export default {
  name: 'write-publish',
  async run(v) {
    const { page } = v;
    await v.login('test');
    await v.goto('/robots.txt');
    await deleteTitled(v);                      // leftovers of an earlier failed run
    v.onCleanup(() => deleteTitled(v));

    await v.goto('/editor');
    await page.locator('.title-input').waitFor();
    await v.shot('editor-empty', { fullPage: false });
    await v.click('.title-input');
    await v.type(TITLE);
    await v.click('.post-summary-input');
    await v.type('A short description for the visual check.');
    await v.click('.editor-contenteditable');
    await v.type('Some words in the body of the post. A second sentence follows so the line has some length.');
    await page.keyboard.press('Enter');
    v.step('title, description and text typed');
    await v.shot('editor-typed');

    // Button block from the Insert section
    const insert = page.locator('.pe-section-head[title$=" Insert"]').first();
    if (/^Show/.test(await insert.getAttribute('title'))) await v.click(insert);
    await v.click(page.getByRole('button', { name: 'Button', exact: true }));
    const pb = page.locator('.pb-input');
    await pb.first().waitFor();
    // On a phone the editor's tool panel is pinned over more than half of the screen, so a field is first
    // scrolled to the bottom edge, where it can be reached (this is itself a finding, see the report).
    const bring = async loc => { await loc.evaluate(e => { const r = e.getBoundingClientRect(); window.scrollBy(0, r.bottom - (innerHeight - 30)); }); await sleep(450); };
    const reopen = async () => { if (await pb.count() < 2) { await v.click(page.locator('.pb-wrap').first()); await sleep(300); } };
    await bring(pb.first());
    await v.click(pb.first());
    v.note('after click on label: focus on ' + await page.evaluate(() => document.activeElement?.className + ' | scrollY ' + scrollY + ' | box ' + JSON.stringify(document.querySelector('.pb-input')?.getBoundingClientRect())));
    await v.type('Visit example');
    await sleep(300);
    v.note('label field after typing: ' + JSON.stringify(await pb.first().inputValue().catch(() => null)) + ', focus on ' + await page.evaluate(() => document.activeElement?.className));
    // Typing the web address key by key closes the block's form after "https://e" (ButtonNode.jsx:223, the form
    // is open only while the block is selected or its target is still invalid): record that, then set it in one go.
    await reopen();
    await bring(pb.nth(1));
    await v.click(pb.nth(1));
    await page.keyboard.type('https://e', { delay: 45 });
    await sleep(300);
    v.note('typing the web address by hand: form still open after "https://e": ' + (await pb.count() > 1));
    await reopen();
    await bring(pb.nth(1));
    await pb.nth(1).fill('https://example.com');
    await sleep(300);
    v.note('block text now: ' + JSON.stringify((await page.locator('.pb-wrap').first().innerText()).slice(0, 80)));
    await sleep(500);
    v.step('Button block added and filled');
    await page.locator('.editor-contenteditable').first().scrollIntoViewIfNeeded();
    await v.shot('editor-with-button', { fullPage: true });

    // Publish
    await page.evaluate(() => window.scrollTo(0, 0));
    await v.click(page.getByRole('button', { name: 'Publish' }));
    await page.getByText(/Published|your post is live/).first().waitFor({ timeout: 6000 }).catch(async e => {
      v.note('after Publish: ' + (await page.locator('[role=alert],[role=status],.toast,.editor-toast').allInnerTexts()).join(' | ') + ' url=' + page.url());
      throw e;
    });
    await sleep(500);
    await v.burst('published-toast', { frames: 4, gap: 120, dynamic: true });   // the toast fades on its own clock
    v.step('published');

    // View the post
    await v.goto('/test');
    const card = page.locator('.profile-post, article, .post-card', { hasText: TITLE }).first();
    const titleEl = page.getByText(TITLE, { exact: false }).first();
    await titleEl.waitFor();
    await v.shot('profile-with-new-post', { fullPage: false, mask: ['.profile-banner'] });
    await v.click(titleEl);
    await page.locator('h1', { hasText: TITLE }).first().waitFor();
    await sleep(600);
    await v.shot('post-view', { fullPage: true });
    const btn = page.getByRole('link', { name: 'Visit example' }).or(page.getByRole('button', { name: 'Visit example' })).first();
    if (!await btn.count()) throw new Error('the Button block does not show on the published post');
    const href = await btn.getAttribute('href').catch(() => null);
    v.note('button on post: href=' + href);
    v.step('post viewed with its Button');

    // Back to the profile card, delete it
    await page.goBack();
    await v.settle();
    await page.getByText(TITLE).first().waitFor();
    const cardEl = page.locator('div:has(> .post-delete-btn), div:has(.post-delete-btn)', { hasText: TITLE }).last();
    await v.shot('profile-card-back', { mask: ['.profile-banner'] });
    v.step('back on the profile card');
    const del = cardEl.locator('.post-delete-btn').first();
    await v.click(del);
    await sleep(500);
    await v.shot('delete-confirm', { mask: ['.profile-banner'] });
    const ok = page.getByRole('button', { name: /^(Continue|Delete|Yes|Confirm|Remove)$/ }).last();
    await ok.waitFor();
    v.note('delete confirm button reads: ' + (await ok.innerText()));
    await v.click(ok);
    await sleep(800);
    if (await page.getByText(TITLE).count()) throw new Error('the post is still on the profile after Delete');
    v.step('deleted');
    await v.shot('profile-after-delete', { mask: ['.profile-banner'] });
  },
};
