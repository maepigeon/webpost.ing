import { describe, it, expect } from 'vitest';
import { bannerInfo, BANNER_COLS, INFO_ROWS } from '../components/Pages/Posts/PostsViewer/bannerGrid.js';
import { rowChars, isWide } from '../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/tileGrid.js';

const textOf = (grid, r) => {
  const l = grid.layers[0];
  return rowChars(grid, l, r).filter((ch, s) => !(s % 2 && isWide(l, r, (s - 1) / 2))).join('').trim().replace(/ +/g, ' ');
};

describe('the profile banner\'s own rows', () => {
  const info = bannerInfo({ username: 'mae', followers: 1, following: 12, joined: '2026-03-04T10:00:00Z', publicPosts: 7 });

  it('says who, follow counts, when they joined and how many public posts', () => {
    expect(info.grid.cols).toBe(BANNER_COLS);
    expect(info.grid.rows).toBe(INFO_ROWS);
    expect(textOf(info.grid, 0)).toBe('user: mae');
    expect(textOf(info.grid, 1)).toBe('1 follower 12 following');
    expect(textOf(info.grid, 2)).toBe('joined Mar 4, 2026');
    expect(textOf(info.grid, 3)).toBe('7 public posts');
    expect(info.label).toContain('user: mae');
  });

  it('keeps clear of the avatar, going narrow when a line is long', () => {
    const long = bannerInfo({ username: 'a'.repeat(30), followers: 123456, following: 654321 });
    const l = long.grid.layers[0];
    // Nothing in the avatar's four tiles on the right.
    for (let r = 0; r < INFO_ROWS; r++) expect(rowChars(long.grid, l, r).slice((BANNER_COLS - 4) * 2).join('').trim()).toBe('');
    expect(isWide(l, 0, 1)).toBe(false);
    expect(isWide(info.grid.layers[0], 0, 1)).toBe(true);
  });

  it('uses narrow letters when asked, for a wide banner', () => {
    const n = bannerInfo({ username: 'mae', narrow: true });
    expect(isWide(n.grid.layers[0], 0, 1)).toBe(false);
    expect(textOf(n.grid, 0)).toBe('user: mae');
  });

  it('marks where the counts are, left to right', () => {
    expect(info.hits.followers.from).toBeLessThan(info.hits.followers.to);
    expect(info.hits.followers.to).toBeLessThanOrEqual(info.hits.following.from);
    expect(info.hits.following.to).toBeLessThan(1);
  });
});
