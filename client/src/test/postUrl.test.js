import { describe, it, expect } from 'vitest';
import { slugify, postPath, parsePostId, effectiveSlug, needsResolution } from '../utils/postUrl.js';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('How I Built The Wallpaper Maker')).toBe('how-i-built-the-wallpaper-maker');
  });
  it('strips punctuation', () => {
    expect(slugify('Hello, world! (again?)')).toBe('hello-world-again');
  });
  it('collapses runs of separators', () => {
    expect(slugify('a   ---   b')).toBe('a-b');
  });
  it('trims leading and trailing hyphens', () => {
    expect(slugify('  !!! hi !!!  ')).toBe('hi');
  });
  it('folds accents rather than dropping them', () => {
    expect(slugify('Café naïve résumé')).toBe('cafe-naive-resume');
  });
  it('yields an empty slug for a title with nothing sluggable', () => {
    // The URL then falls back to the bare id, which is better than hyphens.
    expect(slugify('日本語')).toBe('');
    expect(slugify('🎉🎉🎉')).toBe('');
  });
  it('caps the length without leaving a trailing hyphen', () => {
    const slug = slugify('word '.repeat(60));
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
  });
  it('handles junk input', () => {
    for (const junk of [null, undefined, '', 42, {}]) expect(slugify(junk)).toBe('');
  });
});

describe('effectiveSlug', () => {
  it('uses an author-chosen slug', () => {
    expect(effectiveSlug({ id: 1, title: 'Anything', slug: 'chosen' })).toBe('chosen');
  });
  it('derives one from the title otherwise', () => {
    expect(effectiveSlug({ id: 1, title: 'My Post' })).toBe('my-post');
  });
  it('treats placeholder slugs as none, so the URL falls back to the id', () => {
    for (const slug of ['untitled', 'undefined', 'null', 'post']) {
      expect(effectiveSlug({ id: 1, slug }), slug).toBe('');
    }
  });
});

describe('postPath', () => {
  it('uses the slug alone, without the id', () => {
    expect(postPath('mae', { id: 42, title: 'My Post' })).toBe('/mae/my-post');
  });
  it('never renders a placeholder slug into the URL', () => {
    // /mae/123-untitled tells the reader nothing; /mae/123 is honest.
    expect(postPath('mae', { id: 123, title: 'Untitled' })).toBe('/mae/123');
  });
  it('falls back to the bare id when the title has no slug', () => {
    expect(postPath('mae', { id: 42, title: '🎉' })).toBe('/mae/42');
  });
  it('handles a missing title', () => {
    expect(postPath('mae', { id: 7 })).toBe('/mae/7');
  });
  it('prefers an author-chosen slug over the title', () => {
    expect(postPath('mae', { id: 42, title: 'My Post', slug: 'custom-name' }))
      .toBe('/mae/custom-name');
  });
  it('appends a suffix', () => {
    expect(postPath('mae', { id: 42, title: 'My Post' }, '/discussion'))
      .toBe('/mae/my-post/discussion');
  });
  it('falls back to the profile when there is no post', () => {
    expect(postPath('mae', null)).toBe('/mae');
    expect(postPath('mae', { title: 'no id' })).toBe('/mae');
  });
});

describe('parsePostId', () => {
  it('reads the id from a slugged segment', () => {
    expect(parsePostId('42-my-post')).toBe('42');
  });
  it('reads a bare id, so old links keep working', () => {
    expect(parsePostId('42')).toBe('42');
  });
  it('ignores a wrong or stale slug', () => {
    // The slug is cosmetic; the id decides which post is shown.
    expect(parsePostId('42-completely-different-title')).toBe('42');
  });
  it('returns null when there is no leading number', () => {
    for (const bad of ['abc', '-42', '', null, undefined]) expect(parsePostId(bad)).toBeNull();
  });
  it('returns null for a slug-only segment, which the server must resolve', () => {
    expect(parsePostId('my-post')).toBeNull();
    expect(needsResolution('my-post')).toBe(true);
    expect(needsResolution('42')).toBe(false);
    expect(needsResolution('42-my-post')).toBe(false);
  });
});
