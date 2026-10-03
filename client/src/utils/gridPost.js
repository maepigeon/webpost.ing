/**
 * Grid posts: ordinary posts whose content is a tile grid.
 *
 * Being posts, they get everything posts have — dragging into order, folders,
 * pinning, their own page, reactions — and the profile card draws the grid
 * itself instead of just the title.
 */
import { normaliseGrid, defaultGrid } from '../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/tileGrid.js';

const emptyParagraph = { children: [], direction: null, format: '', indent: 0, type: 'paragraph', version: 1, textFormat: 0, textStyle: '' };

/**
 * The first grid anywhere in a post's stored content, whatever else the post
 * holds, or null if it has none. The profile card previews it.
 */
export function firstGridOfPost(description) {
  if (!description || typeof description !== 'string' || !description.includes('"tilegrid"')) return null;
  let state;
  try { state = JSON.parse(description); } catch { return null; }
  const find = (node) => {
    if (!node || typeof node !== 'object') return null;
    if (node.type === 'tilegrid' && node.grid) return node;
    if (!Array.isArray(node.children)) return null;
    for (const child of node.children) {
      const found = find(child);
      if (found) return found;
    }
    return null;
  };
  const node = find(state?.root);
  if (!node) return null;
  try { return normaliseGrid(node.grid); } catch { return null; }
}

/**
 * The grid a card shows: the server's `preview` when it sends one (list
 * responses carry that and no body), else the first grid of the body, which is
 * what older responses carry. `preview: null` means the post has none (or it
 * was over the size cap): the card shows title and summary only.
 */
export function cardGridOf(post) {
  if (!post || post.cardGrid === false) return null;
  if (post.preview !== undefined) {
    if (!post.preview) return null;
    try { return normaliseGrid(post.preview); } catch { return null; }
  }
  return firstGridOfPost(post.description);
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
