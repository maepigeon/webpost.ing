/**
 * Grid posts: ordinary posts whose content is a single tile grid.
 *
 * Being posts, they get everything posts have — dragging into order, folders,
 * pinning, their own page, reactions — and the profile card draws the grid
 * itself instead of just the title.
 */
import { normaliseGrid, defaultGrid } from '../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/tileGrid.js';

const emptyParagraph = { children: [], direction: null, format: '', indent: 0, type: 'paragraph', version: 1, textFormat: 0, textStyle: '' };

/** The grid in a post's stored content, when that is all the post holds; otherwise null. */
export function gridOfPost(description) {
  if (!description || typeof description !== 'string' || !description.includes('"tilegrid"')) return null;
  let state;
  try { state = JSON.parse(description); } catch { return null; }
  const children = state?.root?.children;
  if (!Array.isArray(children)) return null;
  const grids = children.filter(c => c?.type === 'tilegrid');
  const others = children.filter(c => c?.type !== 'tilegrid'
    && !(c?.type === 'paragraph' && (!c.children || c.children.length === 0)));
  return grids.length === 1 && others.length === 0 ? normaliseGrid(grids[0].grid) : null;
}

/** Stored content for a new grid post: one grid, with room to type around it. */
export function gridPostContent(grid = defaultGrid(16, 8)) {
  return JSON.stringify({
    root: {
      children: [emptyParagraph, { type: 'tilegrid', version: 1, grid }, emptyParagraph],
      direction: null, format: '', indent: 0, type: 'root', version: 1,
    },
  });
}
