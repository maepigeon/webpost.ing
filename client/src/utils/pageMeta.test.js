// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { setPageMeta, resetPageMeta, excerptFromContent } from './pageMeta.js';

const content = (sel) => document.head.querySelector(sel)?.getAttribute('content');

beforeEach(() => { document.head.innerHTML = ''; });

describe('setPageMeta', () => {
  it('writes description, canonical, og and twitter tags', () => {
    setPageMeta({ title: 'Hello', description: 'A post', canonicalPath: '/mae/hello', image: '/uploads/a.png', type: 'article', author: 'mae', date: '2026-01-02T00:00:00Z' });
    expect(content('meta[name="description"]')).toBe('A post');
    expect(document.head.querySelector('link[rel="canonical"]').href).toBe(`${window.location.origin}/mae/hello`);
    expect(content('meta[property="og:type"]')).toBe('article');
    expect(content('meta[property="og:title"]')).toBe('Hello — webpost.ing');
    expect(content('meta[property="og:image"]')).toBe(`${window.location.origin}/uploads/a.png`);
    expect(content('meta[name="twitter:card"]')).toBe('summary_large_image');
    const ld = JSON.parse(document.getElementById('page-meta-jsonld').textContent);
    expect(ld['@type']).toBe('BlogPosting');
    expect(ld.author.name).toBe('mae');
  });

  it('updates in place instead of duplicating', () => {
    setPageMeta({ title: 'One', description: 'a', type: 'profile' });
    setPageMeta({ title: 'Two', description: 'b', type: 'article' });
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('script#page-meta-jsonld')).toHaveLength(1);
    expect(content('meta[property="og:title"]')).toBe('Two — webpost.ing');
  });

  it('keeps text from closing the JSON-LD script', () => {
    setPageMeta({ title: '</script><b>', type: 'article' });
    expect(document.getElementById('page-meta-jsonld').textContent).not.toContain('</script>');
  });

  it('resets to the site defaults and drops the JSON-LD', () => {
    setPageMeta({ title: 'Hello', description: 'A post', type: 'article' });
    resetPageMeta();
    expect(content('meta[property="og:type"]')).toBe('website');
    expect(content('meta[name="description"]')).toMatch(/minimalist social blogging/);
    expect(document.getElementById('page-meta-jsonld')).toBeNull();
  });
});

describe('excerptFromContent', () => {
  it('reads text from the editor JSON and survives bad input', () => {
    const doc = JSON.stringify({ root: { children: [
      { type: 'paragraph', children: [{ type: 'text', text: 'First' }] },
      { type: 'paragraph', children: [{ type: 'text', text: 'second' }] },
    ] } });
    expect(excerptFromContent(doc)).toBe('First second');
    expect(excerptFromContent('{nope')).toBe('');
  });
});
