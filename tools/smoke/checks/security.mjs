import { check, login, assert, uniq, createDraftPost, api, lexicalDoc } from '../lib.mjs';

check('security: a non-admin is refused the admin panel and admin API', async t => {
  const page = await t.newUser('test2');
  await page.goto('/routes/AdminPanel');
  await page.locator('.admin-denied').waitFor();
  assert(await page.locator('.admin-panel table, .admin-tabs').count() === 0, 'admin controls are shown to a non-admin');
  const r = await api(page, 'GET', '/api/admin/users');
  assert(r.status === 403, `GET /api/admin/users as a non-admin answers HTTP ${r.status}, expected 403`);
  const s = await api(page, 'GET', '/api/admin/stats');
  assert(s.status === 403, `GET /api/admin/stats as a non-admin answers HTTP ${s.status}, expected 403`);
  // Signed out too.
  const v = await t.visitor();
  const r2 = await api(v, 'GET', '/api/admin/users');
  assert(r2.status === 401 || r2.status === 403, `GET /api/admin/users signed out answers HTTP ${r2.status}`);
}, { area: 'security' });

check('security: another user\'s draft is hidden and cannot be edited or deleted', async t => {
  const owner = await t.newUser('test');
  const other = await t.newUser('test2');
  const title = uniq('smoke private');
  const id = await createDraftPost(owner, { title, published: false, paragraphs: ['private words'] }, t);

  const byId = await api(other, 'GET', `/api/posts/${id}`);
  assert(byId.status === 404 || byId.status === 403, `another user reads a draft by id: HTTP ${byId.status}`);
  assert(!byId.text.includes('private words'), 'the draft text came back to another user');
  const list = await api(other, 'GET', '/api/user/test?limit=200&offset=0');
  assert(!list.text.includes(title), 'another user sees the draft in the list of posts');
  const v = await t.visitor();
  const anon = await api(v, 'GET', `/api/posts/${id}`);
  assert(anon.status === 404 || anon.status === 401 || anon.status === 403, `a visitor reads a draft by id: HTTP ${anon.status}`);
  const anonList = await api(v, 'GET', '/api/user/test?limit=200&offset=0');
  assert(!anonList.text.includes(title), 'a visitor sees the draft in the list of posts');

  // Publishing makes it visible; then another user still cannot change or delete it.
  const pub = await api(owner, 'PUT', `/api/posts/${id}/visibility`, { published: true });
  assert(pub.status === 200, `publishing through the API: HTTP ${pub.status} ${pub.text.slice(0, 80)}`);
  const seen = await api(other, 'GET', `/api/posts/${id}`);
  assert(seen.status === 200, 'a published post is not readable by another user');
  const edit = await api(other, 'PUT', `/api/posts/${id}`, { title: 'hijacked', description: lexicalDoc('hijacked'), published: true });
  assert([401, 403, 404].includes(edit.status), `another user editing the post: HTTP ${edit.status}, expected a refusal`);
  const del = await api(other, 'DELETE', `/api/posts/${id}`);
  assert([401, 403, 404].includes(del.status), `another user deleting the post: HTTP ${del.status}, expected a refusal`);
  const still = await api(owner, 'GET', `/api/posts/${id}`);
  assert(still.status === 200 && still.body?.title === title, 'the post changed after another user tried to edit it');
}, { area: 'security' });

check('security: a post with an outside image or a javascript: link is refused', async t => {
  const { page } = t;
  await login(page, 'test');
  const doc = children => JSON.stringify({ root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children } });
  const para = kids => ({ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: kids });
  const body = (title, description) => ({ title, description, published: false, section: 'profile' });
  const created = [];
  const send = async (label, description) => {
    const r = await api(page, 'POST', '/api/posts', body(uniq('smoke bad ' + label), description));
    if (r.status === 201) created.push(Number(r.text));
    return r;
  };
  t.onCleanup(async () => { for (const id of created) await api(page, 'DELETE', `/api/posts/${id}`); });

  const img = await send('img', doc([{ type: 'image', version: 1, src: 'https://example.com/tracker.png', altText: 'x', width: 100, height: 100 }]));
  assert(img.status === 400, `a post with an external image answers HTTP ${img.status}, expected 400`);
  const js = await send('js', doc([para([{ type: 'link', version: 1, url: 'javascript:alert(1)', children: [{ type: 'text', version: 1, text: 'go', detail: 0, format: 0, mode: 'normal', style: '' }] }])]));
  assert(js.status === 400, `a post with a javascript: link answers HTTP ${js.status}, expected 400`);
  const ok = await send('ok', lexicalDoc('plain body'));
  assert(ok.status === 201, `a plain post answers HTTP ${ok.status}, expected 201`);
}, { area: 'security' });
