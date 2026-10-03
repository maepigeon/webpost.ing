import { describe, it, expect } from 'vitest';
import { visiblePostsFor } from '../utils/viewAs.js';

const posts = [
  { id: 1, published: true },
  { id: 2, published: false },
  { id: 3, published: true },
  { id: 4 },
];

describe('visiblePostsFor', () => {
  it('hides drafts and keeps public posts in order when previewing', () => {
    expect(visiblePostsFor(posts, { previewing: true }).map(p => p.id)).toEqual([1, 3]);
  });
  it('returns the list untouched when not previewing', () => {
    expect(visiblePostsFor(posts, { previewing: false })).toBe(posts);
    expect(visiblePostsFor(posts)).toBe(posts);
  });
  it('returns non-array input unchanged', () => {
    expect(visiblePostsFor(null, { previewing: true })).toBe(null);
    expect(visiblePostsFor(undefined, { previewing: true })).toBe(undefined);
    const obj = {};
    expect(visiblePostsFor(obj, { previewing: true })).toBe(obj);
  });
  it('gives an empty list when every post is a draft', () => {
    expect(visiblePostsFor([{ id: 1, published: false }], { previewing: true })).toEqual([]);
  });
});
