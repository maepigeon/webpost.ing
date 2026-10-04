import { differingBytes, ensureCel } from './project.js';

/**
 * Undo and redo. Two kinds of entry:
 *   patch  one cel's changed rectangle, before and after (strokes, fills)
 *   state  the project's shape before and after (frames, layers, fps, resize)
 * Memory is capped: the oldest entries are dropped once the total passes the limit.
 */
export const DEFAULT_LIMIT_BYTES = 64 * 1024 * 1024;

export const patchEntry = (frameId, layerId, rect, before, after) => ({
  type: 'patch', frameId, layerId, rect, before, after, bytes: before.byteLength + after.byteLength + 64,
});

/** A state entry. `coalesce` merges a run of the same kind of edit (dragging a slider) into one step. */
export const stateEntry = (before, after, coalesce = null) => ({
  type: 'state', before, after, coalesce, bytes: differingBytes(before, after) + 256,
});

export function createHistory({ limitBytes = DEFAULT_LIMIT_BYTES } = {}) {
  let undos = [];
  let redos = [];
  let bytes = 0;

  const trim = () => {
    while (bytes > limitBytes && undos.length > 1) bytes -= undos.shift().bytes;
  };

  /** Apply one side of an entry. Returns { project, touched } where touched names the cel changed, if any. */
  const apply = (entry, side, project, makeBitmap) => {
    if (entry.type === 'state') return { project: entry[side], touched: null };
    const cel = ensureCel(project, entry.frameId, entry.layerId, makeBitmap);
    const { x, y, w, h } = entry.rect;
    cel.writeRect(x, y, w, h, entry[side]);
    return { project, touched: { frameId: entry.frameId, layerId: entry.layerId } };
  };

  return {
    push(entry) {
      const top = undos[undos.length - 1];
      if (entry.type === 'state' && entry.coalesce && top && top.type === 'state' && top.coalesce === entry.coalesce && !redos.length) {
        bytes -= top.bytes;
        top.after = entry.after;
        top.bytes = differingBytes(top.before, top.after) + 256;
        bytes += top.bytes;
        return;
      }
      for (const r of redos) bytes -= r.bytes;
      redos = [];
      undos.push(entry);
      bytes += entry.bytes;
      trim();
    },
    undo(project, makeBitmap) {
      const entry = undos.pop();
      if (!entry) return null;
      redos.push(entry);
      return apply(entry, 'before', project, makeBitmap);
    },
    redo(project, makeBitmap) {
      const entry = redos.pop();
      if (!entry) return null;
      undos.push(entry);
      return apply(entry, 'after', project, makeBitmap);
    },
    canUndo: () => undos.length > 0,
    canRedo: () => redos.length > 0,
    clear() { undos = []; redos = []; bytes = 0; },
    get bytes() { return bytes; },
    get size() { return undos.length; },
  };
}
