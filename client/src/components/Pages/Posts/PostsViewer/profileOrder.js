/**
 * The order of posts on a profile, and every way of changing it.
 *
 * Pure functions over plain post objects, so the rules can be tested without a
 * browser. The server stores two things per post, `sortOrder` (position,
 * smallest first; ties newest first) and `folder` (a name, or null), and
 * everything here is derived from those two.
 *
 * Three shapes of the same order:
 *   posts  — a flat array, what the server sends and receives.
 *   blocks — what the profile shows: ungrouped posts, and folders holding their
 *            posts. A folder sits where its first post would.
 *   rows   — what the arrange list shows: blocks flattened, each folder's posts
 *            indented beneath its header. A post at depth 1 belongs to the
 *            nearest folder header above it.
 *
 * Every change produces posts numbered 0, 1, 2… in display order, so the order
 * on screen and the order saved are the same thing.
 */

export const postKey = (post) => `post:${post.id}`;
export const folderKey = (name) => `folder:${name}`;

const time = (date) => {
  const t = new Date(date).getTime();
  return Number.isNaN(t) ? 0 : t;
};

/** The server's order: position, then newest, then highest id. */
export function comparePosts(a, b) {
  return ((a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    || (time(b.date) - time(a.date))
    || (b.id - a.id);
}

export const sortPosts = (posts) => [...posts].sort(comparePosts);

/**
 * Adds a page of posts to those already shown, never showing one twice.
 *
 * A post already present keeps its place and its local state: a page can
 * overlap the last one when posts are added, deleted or rearranged between
 * fetches.
 */
export function mergePosts(existing, incoming) {
  const seen = new Set(existing.map(p => p.id));
  const added = [];
  for (const p of incoming) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    added.push(p);
  }
  return added.length ? [...existing, ...added] : existing;
}

/** Replaces posts by id with changed copies, leaving the rest untouched. */
export function applyChanges(posts, changed) {
  const byId = new Map(changed.map(p => [p.id, p]));
  return posts.map(p => byId.get(p.id) ?? p);
}

// ── Blocks: the profile view ──────────────────────────────────────────────────

export function toBlocks(posts) {
  const blocks = [];
  const folders = new Map();
  for (const post of sortPosts(posts)) {
    const name = post.folder || null;
    if (!name) {
      blocks.push({ type: 'post', id: postKey(post), post });
    } else if (folders.has(name)) {
      folders.get(name).posts.push(post);
    } else {
      const block = { type: 'folder', id: folderKey(name), name, posts: [post] };
      folders.set(name, block);
      blocks.push(block);
    }
  }
  return blocks;
}

/** Posts numbered in block order, each given the folder of its block. */
export function fromBlocks(blocks) {
  const out = [];
  for (const block of blocks) {
    const members = block.type === 'folder' ? block.posts : [block.post];
    const folder = block.type === 'folder' ? block.name : null;
    for (const post of members) out.push({ ...post, folder, sortOrder: out.length });
  }
  return out;
}

// ── Rows: the arrange list ────────────────────────────────────────────────────

export function toRows(blocks) {
  const rows = [];
  for (const block of blocks) {
    if (block.type === 'post') {
      rows.push({ type: 'post', id: block.id, post: block.post, depth: 0 });
      continue;
    }
    rows.push({ type: 'folder', id: block.id, name: block.name, count: block.posts.length, depth: 0 });
    for (const post of block.posts) rows.push({ type: 'post', id: postKey(post), post, depth: 1 });
  }
  return rows;
}

/** Posts numbered in row order; an indented post joins the folder above it. */
export function fromRows(rows) {
  const out = [];
  let folder = null;
  for (const row of rows) {
    if (row.type === 'folder') { folder = row.name; continue; }
    if (row.depth === 0) folder = null;
    out.push({ ...row.post, folder: row.depth === 1 ? folder : null, sortOrder: out.length });
  }
  return out;
}

function arrayMove(list, from, to) {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Where a dragged post would land: its depth, and the folder that means.
 *
 * Where it is dropped decides first. Among a folder's posts, or straight
 * under its header, a post joins that folder; with no folder above, it
 * cannot. Only just below a folder's last post could it be either. There
 * it goes outside the folder, unless dragged half an indent (`dx`) to the
 * right, which adds it to the end of the folder. Going outside by default
 * means dragging a post down out of a folder takes it out, which is what a
 * drag that ends below the folder looks like it should do. A post dropped
 * back where it started keeps its folder.
 */
export function projectPost(rows, activeId, overId, dx, indent) {
  const from = rows.findIndex(r => r.id === activeId);
  const to = rows.findIndex(r => r.id === overId);
  if (from === -1) return null;
  const at = to === -1 ? from : to;
  const moved = arrayMove(rows, from, at);
  const prev = moved[at - 1];
  const next = moved[at + 1];

  const maxDepth = prev && (prev.type === 'folder' || prev.depth === 1) ? 1 : 0;
  const minDepth = next && next.type === 'post' && next.depth === 1 ? 1 : 0;
  const sideways = dx >= indent / 2 ? 1 : dx <= -indent / 2 ? 0 : null;
  const wanted = sideways ?? (at === from ? rows[from].depth : 0);
  const depth = Math.min(maxDepth, Math.max(minDepth, wanted));

  let folder = null;
  if (depth === 1) {
    for (let i = at - 1; i >= 0; i--) {
      if (moved[i].type === 'folder') { folder = moved[i].name; break; }
    }
  }
  return { index: at, depth, folder };
}

/** Drops a post where projectPost said it would land. */
export function dropPost(rows, activeId, overId, depth) {
  const from = rows.findIndex(r => r.id === activeId);
  const to = rows.findIndex(r => r.id === overId);
  if (from === -1) return fromRows(rows);
  const moved = arrayMove(rows, from, to === -1 ? from : to);
  const at = moved.findIndex(r => r.id === activeId);
  moved[at] = { ...moved[at], depth };
  return fromRows(moved);
}

// ── Dragging a folder ─────────────────────────────────────────────────────────

const inFolder = (row, name) => row.type === 'post' && row.depth === 1 && row.post.folder === name;

/**
 * The rows a folder is dragged among: everything but its own posts, which
 * travel with it. (The view keeps the space they took, so nothing below the
 * folder moves when it is picked up.)
 */
export function withoutOwnPosts(rows, folderId) {
  const name = rows.find(r => r.id === folderId)?.name;
  return rows.filter(r => !inFolder(r, name));
}

/**
 * Where a dragged folder may land: never inside another folder. Over another
 * folder's header or posts it goes above that whole folder when moving up,
 * and below it when moving down. Used both to preview the drop and to make
 * it, so what is shown is what happens.
 */
export function snapFolderIndex(list, activeIndex, overIndex) {
  const target = list[overIndex];
  if (!target || overIndex === activeIndex) return overIndex;
  const name = target.type === 'folder' ? target.name : target.depth === 1 ? target.post.folder : null;
  if (!name) return overIndex;
  const header = list.findIndex(r => r.type === 'folder' && r.name === name);
  if (overIndex < activeIndex) return header;
  let last = header;
  while (last + 1 < list.length && list[last + 1].depth === 1) last += 1;
  return last;
}

/** Drops a folder, with its posts, where snapFolderIndex says. */
export function dropFolder(rows, activeId, overId) {
  const header = rows.find(r => r.id === activeId);
  if (!header) return fromRows(rows);
  const own = rows.filter(r => inFolder(r, header.name));
  const list = withoutOwnPosts(rows, activeId);
  const from = list.indexOf(header);
  const over = list.findIndex(r => r.id === overId);
  if (over === -1) return fromRows(rows);
  const moved = arrayMove(list, from, snapFolderIndex(list, from, over));
  moved.splice(moved.indexOf(header) + 1, 0, ...own);
  return fromRows(moved);
}

// ── Folder menu on the profile ───────────────────────────────────────────────

const cleanName = (name) => (name || '').trim().slice(0, 100) || null;

/**
 * Files a post into a folder from the post's menu.
 *
 * Into an existing folder: at the end of it. Into a new folder: the folder is
 * made where the post stands, so nothing jumps. The folder's position on the
 * profile is where its first post is, so the order is kept explicit here
 * rather than left to whatever positions the posts happened to have.
 */
export function moveToFolder(posts, postId, folderName) {
  const name = cleanName(folderName);
  if (!name) return removeFromFolder(posts, postId);
  const blocks = toBlocks(posts);
  const post = posts.find(p => p.id === postId);
  if (!post || (post.folder || null) === name) return posts;

  const target = blocks.find(b => b.type === 'folder' && b.name === name);
  const at = blockIndexOf(blocks, postId);
  const without = takeOut(blocks, postId);

  if (target) {
    return fromBlocks(without.map(b => (b === target ? { ...b, posts: [...b.posts, post] } : b)));
  }
  const placed = without.slice();
  placed.splice(besideOrInPlace(blocks, without, at), 0,
    { type: 'folder', id: folderKey(name), name, posts: [post] });
  return fromBlocks(placed);
}

/** Takes a post out of its folder and puts it just below that folder. */
export function removeFromFolder(posts, postId) {
  const post = posts.find(p => p.id === postId);
  if (!post || !post.folder) return posts;
  const blocks = toBlocks(posts);
  const at = blockIndexOf(blocks, postId);
  const without = takeOut(blocks, postId);
  const placed = without.slice();
  placed.splice(besideOrInPlace(blocks, without, at), 0,
    { type: 'post', id: postKey(post), post: { ...post, folder: null } });
  return fromBlocks(placed);
}

/**
 * Where a post taken out of block `at` goes back in: just after that block if
 * it is still there (a folder with other posts), or in its place if taking the
 * post out removed it (a lone post, or a folder's last post). Either way
 * nothing else on the profile moves.
 */
function besideOrInPlace(blocks, without, at) {
  return without.length === blocks.length ? at + 1 : at;
}

function blockIndexOf(blocks, postId) {
  return blocks.findIndex(b => (b.type === 'post' ? b.post.id === postId : b.posts.some(p => p.id === postId)));
}

/** Blocks without the post; a folder it leaves empty goes too. */
function takeOut(blocks, postId) {
  const out = [];
  for (const b of blocks) {
    if (b.type === 'post') { if (b.post.id !== postId) out.push(b); continue; }
    const posts = b.posts.filter(p => p.id !== postId);
    if (posts.length) out.push(posts.length === b.posts.length ? b : { ...b, posts });
  }
  return out;
}
