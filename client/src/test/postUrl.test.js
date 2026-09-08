import { describe, it, expect } from 'vitest';
import { slugify, postPath, parsePostId } from '../utils/postUrl.js';

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

describe('postPath', () => {
  it('builds an id-and-slug path', () => {
    expect(postPath('mae', { id: 42, title: 'My Post' })).toBe('/users/mae/42-my-post');
  });
  it('falls back to the bare id when the title has no slug', () => {
    expect(postPath('mae', { id: 42, title: '🎉' })).toBe('/users/mae/42');
  });
  it('handles a missing title', () => {
    expect(postPath('mae', { id: 7 })).toBe('/users/mae/7');
  });
  it('appends a suffix', () => {
    expect(postPath('mae', { id: 42, title: 'My Post' }, '/discussion'))
      .toBe('/users/mae/42-my-post/discussion');
  });
  it('falls back to the profile when there is no post', () => {
    expect(postPath('mae', null)).toBe('/users/mae');
    expect(postPath('mae', { title: 'no id' })).toBe('/users/mae');
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
  it('round-trips with postPath', () => {
    const path = postPath('mae', { id: 1234, title: 'Round Trip' });
    expect(parsePostId(path.split('/').pop())).toBe('1234');
  });
});
