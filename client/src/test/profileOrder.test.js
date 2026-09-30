import { describe, it, expect } from 'vitest';
import {
  sortPosts, mergePosts, applyChanges, toBlocks, fromBlocks, toRows, fromRows,
  projectPost, dropPost, dropFolder, withoutOwnPosts, snapFolderIndex, moveToFolder, removeFromFolder,
} from '../components/Pages/Posts/PostsViewer/profileOrder.js';

const INDENT = 32;

/** Posts in display order: a, b, c… each at its own position. */
function posts(spec) {
  return spec.map(([id, folder], i) => ({
    id, title: `post ${id}`, folder: folder ?? null, sortOrder: i, date: '2026-01-01T00:00:00Z',
  }));
}

const ids = (list) => sortPosts(list).map(p => p.id);
const folders = (list) => Object.fromEntries(list.map(p => [p.id, p.folder]));

describe('sortPosts', () => {
  it('orders by position, then newest, then highest id', () => {
    const list = [
      { id: 1, sortOrder: 1, date: '2026-01-03' },
      { id: 2, sortOrder: 0, date: '2026-01-01' },
      { id: 3, sortOrder: 0, date: '2026-01-02' },
      { id: 4, sortOrder: 0, date: '2026-01-02' },
    ];
    expect(sortPosts(list).map(p => p.id)).toEqual([4, 3, 2, 1]);
  });

  it('reads a missing position as the top', () => {
    expect(sortPosts([{ id: 1, sortOrder: 2 }, { id: 2 }]).map(p => p.id)).toEqual([2, 1]);
  });
});

describe('mergePosts', () => {
  it('never shows a post twice when pages overlap', () => {
    const shown = posts([[1], [2], [3]]);
    const merged = mergePosts(shown, posts([[3], [4]]));
    expect(merged.map(p => p.id)).toEqual([1, 2, 3, 4]);
  });

  it('keeps the copy already shown, with its local changes', () => {
    const shown = [{ id: 1, folder: 'Moved' }];
    expect(mergePosts(shown, [{ id: 1, folder: null }])[0].folder).toBe('Moved');
  });

  it('drops duplicates within one page too', () => {
    expect(mergePosts([], [{ id: 5 }, { id: 5 }])).toHaveLength(1);
  });
});

describe('applyChanges', () => {
  it('replaces changed posts and keeps the rest', () => {
    const list = [{ id: 1, sortOrder: 0 }, { id: 2, sortOrder: 1 }, { id: 9, sortOrder: 5 }];
    const out = applyChanges(list, [{ id: 2, sortOrder: 0 }]);
    expect(out).toEqual([{ id: 1, sortOrder: 0 }, { id: 2, sortOrder: 0 }, { id: 9, sortOrder: 5 }]);
  });
});

describe('blocks', () => {
  it('puts a folder where its first post is, with its posts in order', () => {
    const blocks = toBlocks(posts([[1], [2, 'T'], [3], [4, 'T']]));
    expect(blocks.map(b => b.id)).toEqual(['post:1', 'folder:T', 'post:3']);
    expect(blocks[1].posts.map(p => p.id)).toEqual([2, 4]);
  });

  it('numbers posts in the order shown, so the saved order is the shown order', () => {
    const out = fromBlocks(toBlocks(posts([[1], [2, 'T'], [3], [4, 'T']])));
    expect(out.map(p => [p.id, p.sortOrder])).toEqual([[1, 0], [2, 1], [4, 2], [3, 3]]);
  });

});

describe('dragging a folder', () => {
  // post:1, folder:T, post:2 (T), post:3 (T), post:4, folder:U, post:5 (U), post:6 (U), post:7
  const rows = toRows(toBlocks(posts([[1], [2, 'T'], [3, 'T'], [4], [5, 'U'], [6, 'U'], [7]])));
  const blockIds = (out) => toBlocks(out).map(b => b.id);

  it('moves with all its posts, above a post', () => {
    const out = dropFolder(rows, 'folder:T', 'post:1');
    expect(blockIds(out)).toEqual(['folder:T', 'post:1', 'post:4', 'folder:U', 'post:7']);
    expect(folders(out)).toMatchObject({ 2: 'T', 3: 'T' });
  });

  it('moves below a post', () => {
    const out = dropFolder(rows, 'folder:T', 'post:4');
    expect(blockIds(out)).toEqual(['post:1', 'post:4', 'folder:T', 'folder:U', 'post:7']);
  });

  it('never lands inside another folder: over its posts it goes past the whole folder', () => {
    expect(blockIds(dropFolder(rows, 'folder:T', 'post:5'))).toEqual(['post:1', 'post:4', 'folder:U', 'folder:T', 'post:7']);
    expect(blockIds(dropFolder(rows, 'folder:T', 'folder:U'))).toEqual(['post:1', 'post:4', 'folder:U', 'folder:T', 'post:7']);
    expect(blockIds(dropFolder(rows, 'folder:U', 'post:3'))).toEqual(['post:1', 'folder:U', 'folder:T', 'post:4', 'post:7']);
  });

  it('is dragged among rows without its own posts, and the preview snaps like the drop', () => {
    const list = withoutOwnPosts(rows, 'folder:T');
    expect(list.map(r => r.id)).toEqual(['post:1', 'folder:T', 'post:4', 'folder:U', 'post:5', 'post:6', 'post:7']);
    expect(snapFolderIndex(list, 1, 4)).toBe(5);   // down over U's first post → below U
    expect(snapFolderIndex(list, 1, 2)).toBe(2);   // over a plain post → there
  });
});

describe('rows', () => {
  it('indents a folder’s posts under its header', () => {
    const rows = toRows(toBlocks(posts([[1], [2, 'T'], [3, 'T']])));
    expect(rows.map(r => [r.id, r.depth])).toEqual([
      ['post:1', 0], ['folder:T', 0], ['post:2', 1], ['post:3', 1],
    ]);
  });

  it('round-trips', () => {
    const list = posts([[1], [2, 'T'], [3, 'T'], [4]]);
    const out = fromRows(toRows(toBlocks(list)));
    expect(ids(out)).toEqual([1, 2, 3, 4]);
    expect(folders(out)).toEqual(folders(list));
  });
});

describe('dragging a post in the arrange list', () => {
  // post:1, folder:T, post:2 (in T), post:3 (in T), post:4
  const rows = toRows(toBlocks(posts([[1], [2, 'T'], [3, 'T'], [4]])));

  it('reorders ungrouped posts', () => {
    const p = projectPost(rows, 'post:4', 'post:1', 0, INDENT);
    expect(p.depth).toBe(0);
    const out = dropPost(rows, 'post:4', 'post:1', p.depth);
    expect(ids(out)).toEqual([4, 1, 2, 3]);
    expect(out.find(x => x.id === 4).folder).toBeNull();
  });

  it('must join a folder when dropped between two of its posts', () => {
    const p = projectPost(rows, 'post:1', 'post:2', -200, INDENT);
    expect(p).toMatchObject({ depth: 1, folder: 'T' });
    const out = dropPost(rows, 'post:1', 'post:2', p.depth);
    expect(ids(out)).toEqual([2, 1, 3, 4]);
    expect(folders(out)).toMatchObject({ 1: 'T', 2: 'T', 3: 'T', 4: null });
  });

  it('stays outside a folder below it unless dragged right', () => {
    expect(projectPost(rows, 'post:1', 'post:3', 0, INDENT).depth).toBe(0);
    expect(projectPost(rows, 'post:1', 'post:3', INDENT, INDENT)).toMatchObject({ depth: 1, folder: 'T' });
  });

  it('leaves a folder when dragged down out of it, without any sideways move', () => {
    const p = projectPost(rows, 'post:2', 'post:4', 0, INDENT);
    expect(p).toMatchObject({ depth: 0, folder: null });
    const out = dropPost(rows, 'post:2', 'post:4', p.depth);
    expect(ids(out)).toEqual([1, 3, 4, 2]);
    expect(folders(out)).toMatchObject({ 2: null, 3: 'T' });
  });

  it('just below a folder’s last post: outside, unless dragged right', () => {
    const lastRows = toRows(toBlocks(posts([[1], [2, 'T'], [3, 'T'], [4]])));
    expect(projectPost(lastRows, 'post:2', 'post:3', 0, INDENT).depth).toBe(0);
    expect(projectPost(lastRows, 'post:2', 'post:3', INDENT / 2, INDENT)).toMatchObject({ depth: 1, folder: 'T' });
    expect(projectPost(lastRows, 'post:4', 'post:4', INDENT, INDENT)).toMatchObject({ depth: 1, folder: 'T' });
  });

  it('keeps its folder when dropped back where it started', () => {
    expect(projectPost(rows, 'post:3', 'post:3', 0, INDENT)).toMatchObject({ depth: 1, folder: 'T' });
    expect(projectPost(rows, 'post:3', 'post:3', -INDENT, INDENT).depth).toBe(0);
  });

  it('a post dragged up onto a folder header lands above the folder', () => {
    const p = projectPost(rows, 'post:4', 'folder:T', 0, INDENT);
    expect(p.depth).toBe(0);
    const out = dropPost(rows, 'post:4', 'folder:T', p.depth);
    expect(toBlocks(out).map(b => b.id)).toEqual(['post:1', 'post:4', 'folder:T']);
  });

  it('a post dragged down onto a folder header lands first in the folder', () => {
    const p = projectPost(rows, 'post:1', 'folder:T', 0, INDENT);
    expect(p).toMatchObject({ depth: 1, folder: 'T' });
  });

  it('cannot be indented with no folder above', () => {
    expect(projectPost(rows, 'post:4', 'post:1', 500, INDENT).depth).toBe(0);
  });

  it('dropping a folder’s last post elsewhere removes the empty folder', () => {
    const one = toRows(toBlocks(posts([[1, 'T'], [2]])));
    const p = projectPost(one, 'post:1', 'post:2', 0, INDENT);
    const out = dropPost(one, 'post:1', 'post:2', p.depth);
    expect(folders(out)).toEqual({ 1: null, 2: null });
    expect(toBlocks(out).every(b => b.type === 'post')).toBe(true);
  });

  it('gives every post a distinct position', () => {
    const out = dropPost(rows, 'post:3', 'post:1', 0);
    expect(new Set(out.map(p => p.sortOrder)).size).toBe(out.length);
  });
});

describe('folder menu', () => {
  it('files a post at the end of an existing folder', () => {
    const out = moveToFolder(posts([[1], [2, 'T'], [3, 'T'], [4]]), 1, 'T');
    expect(ids(out)).toEqual([2, 3, 1, 4]);
    expect(out.find(p => p.id === 1).folder).toBe('T');
  });

  it('makes a new folder where the post stands', () => {
    const out = moveToFolder(posts([[1], [2], [3]]), 2, '  New  ');
    expect(ids(out)).toEqual([1, 2, 3]);
    expect(out.find(p => p.id === 2).folder).toBe('New');
  });

  it('makes a new folder just after the folder the post came from', () => {
    const out = moveToFolder(posts([[1, 'T'], [2, 'T'], [3]]), 1, 'New');
    expect(toBlocks(out).map(b => b.id)).toEqual(['folder:T', 'folder:New', 'post:3']);
  });

  it('takes a post out of a folder to just below it', () => {
    const out = removeFromFolder(posts([[1, 'T'], [2, 'T'], [3]]), 1);
    expect(toBlocks(out).map(b => b.id)).toEqual(['folder:T', 'post:1', 'post:3']);
  });

  it('takes a folder’s last post out in its place', () => {
    const out = removeFromFolder(posts([[1], [2, 'T'], [3]]), 2);
    expect(ids(out)).toEqual([1, 2, 3]);
    expect(out.find(p => p.id === 2).folder).toBeNull();
  });

  it('a blank name means no folder; the same folder changes nothing', () => {
    const list = posts([[1, 'T'], [2]]);
    expect(moveToFolder(list, 1, 'T')).toBe(list);
    expect(moveToFolder(list, 1, '   ').find(p => p.id === 1).folder).toBeNull();
  });
});
