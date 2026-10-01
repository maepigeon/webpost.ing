import { describe, it, expect } from 'vitest';
import { gridOfPost, firstGridOfPost, gridPostContent } from '../utils/gridPost.js';

describe('grid posts', () => {
  it('finds the grid in a post made by the grid post button', () => {
    const grid = gridOfPost(gridPostContent());
    expect(grid).not.toBeNull();
    expect(grid.cols).toBe(16);
  });

  it('is not a grid post when there is text as well', () => {
    const state = JSON.parse(gridPostContent());
    state.root.children.push({ type: 'paragraph', children: [{ type: 'text', text: 'hello' }] });
    expect(gridOfPost(JSON.stringify(state))).toBeNull();
  });

  it('is not a grid post with two grids, none, or junk', () => {
    const state = JSON.parse(gridPostContent());
    state.root.children.push(state.root.children[1]);
    expect(gridOfPost(JSON.stringify(state))).toBeNull();
    expect(gridOfPost('{"root":{"children":[]}}')).toBeNull();
    expect(gridOfPost('not json "tilegrid"')).toBeNull();
    expect(gridOfPost(null)).toBeNull();
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
