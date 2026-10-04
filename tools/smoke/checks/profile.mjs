import { check, login, assert, sleep, uniq, createDraftPost } from '../lib.mjs';

check('profile: View as visitor hides owner controls, Escape leaves', async t => {
  const { page } = t;
  await login(page, 'test');
  await page.goto('/test');
  const owner = page.locator('.profile-owner-actions');
  await owner.waitFor();
  assert(await page.getByRole('button', { name: 'Delete' }).count() > 0 || await page.getByRole('button', { name: 'Edit bio' }).count() > 0, 'owner sees no edit controls to begin with');
  await page.getByRole('button', { name: 'View as visitor' }).click();
  await sleep(300);
  assert(await owner.count() === 0, 'owner actions still shown in the visitor preview');
  assert(await page.getByRole('button', { name: 'Delete' }).count() === 0, 'Delete pills still shown in the visitor preview');
  await page.keyboard.press('Escape');
  await owner.waitFor();
}, { area: 'profile' });

async function headerWidth(page, user) {
  await page.goto('/' + user);
  const card = page.locator('.profile-header-card').first();
  await card.waitFor();
  await sleep(700);
  return Math.round((await card.boundingBox()).width);
}

check('profile: an empty profile has the same header width (visitor)', async t => {
  const page = await t.visitor();
  const full = await headerWidth(page, 'test');
  const empty = await headerWidth(page, 'test3');
  assert(Math.abs(full - empty) <= 2, `header is ${full}px wide on test and ${empty}px on the empty profile test3`);
}, { area: 'profile' });

check('profile: an empty profile has the same header width (owner)', async t => {
  const { page } = t;
  await login(page, 'test');
  const full = await headerWidth(page, 'test');
  const empty = await headerWidth(page, 'test3');
  assert(Math.abs(full - empty) <= 2, `signed in, the header is ${full}px wide on test and ${empty}px on the empty profile test3 (the owner buttons widen it)`);
}, { area: 'profile' });

check('profile: banner editor starts clean', async t => {
  const { page } = t;
  await login(page, 'test3');
  await page.goto('/test3');
  await page.getByRole('button', { name: /^(\+ Banner|Edit banner)$/ }).click();
  const editor = page.locator('.banner-editor');
  await editor.waitFor();
  await sleep(800);
  assert(await editor.getByText('Not saved yet').count() === 0, '"Not saved yet" is shown the moment the banner editor opens, before any change');
}, { area: 'profile' });

check('profile: banner editor shows Not saved yet and asks before leaving', async t => {
  const { page } = t;
  await login(page, 'test3');
  await page.goto('/test3');
  await page.getByRole('button', { name: /^(\+ Banner|Edit banner)$/ }).click();
  const editor = page.locator('.banner-editor');
  await editor.waitFor();
  const canvas = editor.locator('.tilegrid-canvas').first();
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + 20, box.y + 20);
  await page.keyboard.type('Hi');
  await editor.getByText('Not saved yet').waitFor();

  // Following a link asks first; staying keeps the editor and the work.
  await page.locator('a.navButton:visible', { hasText: 'Home' }).first().click();
  const dialog = page.getByText(/haven't saved your banner/i);
  await dialog.waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await dialog.waitFor({ state: 'detached' });
  assert(await editor.getByText('Not saved yet').count() === 1, 'the unsaved banner was lost after choosing to stay');

  // Cancel asks as well, and discarding closes the editor without saving.
  await editor.getByRole('button', { name: 'Cancel' }).click();
  await page.getByText(/Discard the changes/i).waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Discard' }).click();
  await editor.waitFor({ state: 'detached' });
}, { area: 'profile' });

const tab = (page, label) => page.getByRole('tab', { name: new RegExp('^' + label) });

check('profile: tabs Posts, Notes, Drafts, Subscribers; ?tab=notes survives a reload', async t => {
  const { page } = t;
  await login(page, 'test');
  const note = uniq('smoke note');
  const draft = uniq('smoke draft');
  const post = uniq('smoke tabpost');
  await createDraftPost(page, { title: note, published: true, section: 'notes' }, t);
  await createDraftPost(page, { title: draft, published: false }, t);
  await createDraftPost(page, { title: post, published: true }, t);

  await page.goto('/test');
  for (const label of ['Posts', 'Notes', 'Drafts', 'Subscribers']) await tab(page, label).waitFor();
  await page.getByText(post).first().waitFor();
  assert(await page.getByText(note).count() === 0, 'a note shows on the Posts tab');

  await tab(page, 'Notes').click();
  await page.getByText(note).first().waitFor();
  assert(new URL(page.url()).searchParams.get('tab') === 'notes', 'selecting Notes did not put ?tab=notes in the address');
  assert(await page.getByText(post).count() === 0, 'a post shows on the Notes tab');

  await page.reload();
  await tab(page, 'Notes').waitFor();
  assert(await tab(page, 'Notes').getAttribute('aria-selected') === 'true', 'after a reload the Notes tab is not selected');
  await page.getByText(note).first().waitFor();

  await tab(page, 'Drafts').click();
  await page.getByText(draft).first().waitFor();
  await tab(page, 'Posts').click();
  await page.getByText(post).first().waitFor();
  assert(!new URL(page.url()).searchParams.has('tab'), 'the Posts tab leaves ?tab= in the address');
}, { area: 'profile' });

check('profile: a visitor gets no Drafts or Subscribers tab, even by address', async t => {
  const owner = await t.newUser('test');
  const draft = uniq('smoke hidden draft');
  const subs = uniq('smoke hidden subscribers');
  const open = uniq('smoke open post');
  await createDraftPost(owner, { title: draft, published: false }, t);
  await createDraftPost(owner, { title: subs, published: true, section: 'subscribers' }, t);
  await createDraftPost(owner, { title: open, published: true }, t);
  const page = await t.visitor();
  // A visitor who can see only Posts gets no tab bar at all, so this does not wait for one.
  for (const query of ['', '?tab=drafts', '?tab=subscribers']) {
    await page.goto('/test' + query);
    await page.getByText(open).first().waitFor();   // the published post is shown
    await sleep(500);                                // and the owner-only tabs had time to appear
    assert(await tab(page, 'Drafts').count() === 0 && await tab(page, 'Subscribers').count() === 0, `a visitor sees owner-only tabs at /test${query}`);
    assert(await page.getByText(draft).count() === 0, `a visitor reaches a draft at /test${query}`);
    assert(await page.getByText(subs).count() === 0, `a visitor reaches a subscribers-only post at /test${query}`);
  }
}, { area: 'profile' });
