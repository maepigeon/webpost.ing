import { check, login, assert, uniq, createDraftPost, api } from '../lib.mjs';

const get = async (page, path) => api(page, 'GET', path);

check('seo: sitemap, robots and llms.txt answer', async t => {
  const { page } = t;
  await login(page, 'test');
  const sm = await get(page, '/api/seo/sitemap.xml');
  assert(sm.status === 200 && /<urlset/.test(sm.text) && /<loc>/.test(sm.text), `sitemap.xml: HTTP ${sm.status}, no <urlset>/<loc>`);
  const rb = await get(page, '/api/seo/robots.txt');
  assert(rb.status === 200 && /User-agent/i.test(rb.text) && /Sitemap:/i.test(rb.text), 'robots.txt has no User-agent or Sitemap line');
  const ll = await get(page, '/api/seo/llms.txt');
  assert(ll.status === 200 && /^# /m.test(ll.text), 'llms.txt has no heading');
}, { area: 'seo' });

check('seo: profile and post crawler pages carry the title; a draft is 404', async t => {
  const { page } = t;
  await login(page, 'test');
  const title = uniq('smoke seo');
  const summary = 'smoke seo summary ' + Date.now();
  const pub = await createDraftPost(page, { title, published: true, summary, paragraphs: ['crawler body text'] }, t);
  const draft = await createDraftPost(page, { title: uniq('smoke seo draft'), published: false }, t);

  const prof = await get(page, '/api/seo/page?path=/test');
  assert(prof.status === 200 && /<title>[^<]*test/i.test(prof.text), `profile crawler page: HTTP ${prof.status}, no <title> with the name`);

  const post = await get(page, `/api/seo/page?path=/test/${pub}`);
  assert(post.status === 200, `public post crawler page: HTTP ${post.status}`);
  assert(post.text.includes(`<title>${title}`), 'post crawler page <title> does not start with the post title');
  assert(post.text.includes(`<meta name="description" content="${summary}`), 'post crawler page has no meta description from the summary');
  assert(new RegExp(`<link rel="canonical" href="[^"]*/test/[^"]+"`).test(post.text), 'post crawler page has no canonical link');
  assert(post.text.includes('crawler body text'), 'post crawler page does not carry the post text');

  const d = await get(page, `/api/seo/page?path=/test/${draft}`);
  assert(d.status === 404, `a draft's crawler page answers HTTP ${d.status}, expected 404`);

  const sm = await get(page, '/api/seo/sitemap.xml');
  assert(!sm.text.includes(`/test/${draft}<`), 'the sitemap lists a draft');
}, { area: 'seo' });
