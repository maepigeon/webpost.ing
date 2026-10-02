import { describe, it, expect } from 'vitest';
import { firstGridOfPost, gridPostContent } from '../utils/gridPost.js';

describe('grid posts', () => {
  it('finds the grid in a post made by the grid post button', () => {
    const grid = firstGridOfPost(gridPostContent());
    expect(grid).not.toBeNull();
    expect(grid.cols).toBe(16);
  });
});

describe('the grid a profile card previews', () => {
  const withGrid = (extra = []) => {
    const state = JSON.parse(gridPostContent());
    state.root.children.push(...extra);
    return state;
  };

  it('is the first grid, alongside text and other grids', () => {
    const second = { type: 'tilegrid', version: 1, grid: { ...withGrid().root.children[1].grid, cols: 8 } };
    const state = withGrid([{ type: 'paragraph', children: [{ type: 'text', text: 'hello' }] }, second]);
    state.root.children.unshift({ type: 'heading', tag: 'h1', children: [{ type: 'text', text: 'Title' }] });
    const grid = firstGridOfPost(JSON.stringify(state));
    expect(grid).not.toBeNull();
    expect(grid.cols).toBe(16);
  });

  it('is found inside other blocks too', () => {
    const grid = JSON.parse(gridPostContent()).root.children[1];
    const state = { root: { type: 'root', children: [{ type: 'quote', children: [grid] }] } };
    expect(firstGridOfPost(JSON.stringify(state))).not.toBeNull();
  });

  it('is null for a post without one, or junk', () => {
    expect(firstGridOfPost('{"root":{"children":[{"type":"paragraph","children":[]}]}}')).toBeNull();
    expect(firstGridOfPost('not json "tilegrid"')).toBeNull();
    expect(firstGridOfPost(undefined)).toBeNull();
  });
});
