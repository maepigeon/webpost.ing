import { describe, it, expect } from 'vitest';
import { gridOfPost, gridPostContent } from '../utils/gridPost.js';

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
