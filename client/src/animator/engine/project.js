/**
 * The document model and its pure operations. Nothing here touches a canvas
 * or React; every function takes a project and returns a new one (the cels
 * Map is copied when structure changes, the bitmaps inside are shared until
 * a stroke edits them in place; history keeps patches for that).
 *
 *   { v: 1, id, name, width, height, fps, seq,
 *     frames: [{ id, hold }],                       first to last in time
 *     layers: [{ id, name, visible, opacity }],     bottom to top
 *     cels: Map('frameId:layerId' -> bitmap) }      a missing cel is transparent
 */
export const PROJECT_VERSION = 1;
export const LIMITS = {
  maxSide: 4096, warnSide: 2048, minFps: 1, maxFps: 60, maxHold: 99, maxFrames: 2400, maxLayers: 24, maxName: 40,
};

export const celKey = (frameId, layerId) => `${frameId}:${layerId}`;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const whole = (v, lo, hi, fallback) => (Number.isFinite(Number(v)) ? clamp(Math.round(Number(v)), lo, hi) : fallback);
export const clampSide = (v) => whole(v, 1, LIMITS.maxSide, 1080);
export const clampFps = (v) => whole(v, LIMITS.minFps, LIMITS.maxFps, 12);
export const clampHold = (v) => whole(v, 1, LIMITS.maxHold, 1);

export function makeProjectId() {
  return `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function createProject({ width = 1080, height = 1080, fps = 12, name = 'Untitled', id } = {}) {
  return {
    v: PROJECT_VERSION,
    id: id || makeProjectId(),
    name: String(name).slice(0, LIMITS.maxName) || 'Untitled',
    width: clampSide(width),
    height: clampSide(height),
    fps: clampFps(fps),
    seq: 2,
    frames: [{ id: 'f1', hold: 1 }],
    layers: [{ id: 'l1', name: 'Layer 1', visible: true, opacity: 1 }],
    cels: new Map(),
  };
}

const bump = (p, prefix) => ({ id: `${prefix}${p.seq}`, seq: p.seq + 1 });
const insertAt = (list, index, item) => {
  const at = clamp(index, 0, list.length);
  return [...list.slice(0, at), item, ...list.slice(at)];
};
const moved = (list, from, to) => {
  if (from < 0 || from >= list.length) return list;
  const dest = clamp(to, 0, list.length - 1);
  if (dest === from) return list;
  const copy = list.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(dest, 0, item);
  return copy;
};

export const frameIndexOf = (p, frameId) => p.frames.findIndex(f => f.id === frameId);
export const layerIndexOf = (p, layerId) => p.layers.findIndex(l => l.id === layerId);
export const getCel = (p, frameId, layerId) => p.cels.get(celKey(frameId, layerId)) || null;

/** The cel, created transparent if missing. Adds it to the (shared) Map in place. */
export function ensureCel(p, frameId, layerId, makeBitmap) {
  const key = celKey(frameId, layerId);
  let b = p.cels.get(key);
  if (!b) { b = makeBitmap(p.width, p.height); p.cels.set(key, b); }
  return b;
}

/* ---- frames ---- */

/** Insert an empty frame at `index` (default: the end). Returns { project, frameId } (null id when at the cap). */
export function addFrame(p, index = p.frames.length) {
  if (p.frames.length >= LIMITS.maxFrames) return { project: p, frameId: null };
  const { id, seq } = bump(p, 'f');
  return { project: { ...p, seq, frames: insertAt(p.frames, index, { id, hold: 1 }) }, frameId: id };
}

/** A copy of a frame (its hold and a clone of every cel) right after it. */
export function duplicateFrame(p, frameId) {
  const at = frameIndexOf(p, frameId);
  if (at < 0 || p.frames.length >= LIMITS.maxFrames) return { project: p, frameId: null };
  const { id, seq } = bump(p, 'f');
  const cels = new Map(p.cels);
  for (const layer of p.layers) {
    const src = p.cels.get(celKey(frameId, layer.id));
    if (src) cels.set(celKey(id, layer.id), src.clone());
  }
  return {
    project: { ...p, seq, cels, frames: insertAt(p.frames, at + 1, { id, hold: p.frames[at].hold }) },
    frameId: id,
  };
}

/** Remove a frame. The only frame is cleared instead, since an animation needs one. */
export function deleteFrame(p, frameId) {
  if (frameIndexOf(p, frameId) < 0) return p;
  const cels = new Map(p.cels);
  for (const layer of p.layers) cels.delete(celKey(frameId, layer.id));
  const frames = p.frames.length <= 1 ? p.frames : p.frames.filter(f => f.id !== frameId);
  return { ...p, frames, cels };
}

export function moveFrame(p, from, to) {
  const frames = moved(p.frames, from, to);
  return frames === p.frames ? p : { ...p, frames };
}

export function setHold(p, frameId, hold) {
  const h = clampHold(hold);
  if (!p.frames.some(f => f.id === frameId && f.hold !== h)) return p;
  return { ...p, frames: p.frames.map(f => (f.id === frameId ? { ...f, hold: h } : f)) };
}

/* ---- layers ---- */

export function addLayer(p, { name, index = p.layers.length } = {}) {
  if (p.layers.length >= LIMITS.maxLayers) return { project: p, layerId: null };
  const { id, seq } = bump(p, 'l');
  const label = (name || `Layer ${p.layers.length + 1}`).slice(0, LIMITS.maxName);
  return {
    project: { ...p, seq, layers: insertAt(p.layers, index, { id, name: label, visible: true, opacity: 1 }) },
    layerId: id,
  };
}

/** Remove a layer and its cels. The only layer is cleared instead. */
export function deleteLayer(p, layerId) {
  if (layerIndexOf(p, layerId) < 0) return p;
  const cels = new Map(p.cels);
  for (const f of p.frames) cels.delete(celKey(f.id, layerId));
  const layers = p.layers.length <= 1 ? p.layers : p.layers.filter(l => l.id !== layerId);
  return { ...p, layers, cels };
}

export function moveLayer(p, layerId, to) {
  const layers = moved(p.layers, layerIndexOf(p, layerId), to);
  return layers === p.layers ? p : { ...p, layers };
}

const patchLayer = (p, layerId, patch) => {
  const l = p.layers.find(x => x.id === layerId);
  if (!l || Object.keys(patch).every(k => l[k] === patch[k])) return p;
  return { ...p, layers: p.layers.map(x => (x.id === layerId ? { ...x, ...patch } : x)) };
};
export const renameLayer = (p, id, name) => {
  const n = String(name).trim().slice(0, LIMITS.maxName);
  return n ? patchLayer(p, id, { name: n }) : p;
};
export const setLayerVisible = (p, id, visible) => patchLayer(p, id, { visible: Boolean(visible) });
export const setLayerOpacity = (p, id, opacity) => patchLayer(p, id, { opacity: clamp(Number(opacity) || 0, 0, 1) });

/* ---- project-wide ---- */

export function setFps(p, fps) {
  const v = clampFps(fps);
  return v === p.fps ? p : { ...p, fps: v };
}

export const setName = (p, name) => ({ ...p, name: String(name).slice(0, LIMITS.maxName) });

/**
 * Change the canvas size. Art keeps its pixel size and sits at (anchorX, anchorY)
 * of the free space (0.5 = centred); what no longer fits is cut off.
 */
export function resizeProject(p, width, height, { anchorX = 0.5, anchorY = 0.5 } = {}) {
  const w = clampSide(width), h = clampSide(height);
  if (w === p.width && h === p.height) return p;
  const ox = Math.round((w - p.width) * anchorX), oy = Math.round((h - p.height) * anchorY);
  const cels = new Map();
  for (const [key, b] of p.cels) cels.set(key, b.resized(w, h, ox, oy));
  return { ...p, width: w, height: h, cels };
}

/* ---- memory ---- */

export const celBytes = (w, h) => w * h * 4;

export function projectBytes(p) {
  let n = 0;
  for (const b of p.cels.values()) n += b.bytes;
  return n;
}

/** Bytes of cels held by one of two projects but not the other (what a history entry keeps alive). */
export function differingBytes(a, b) {
  let n = 0;
  for (const [k, v] of a.cels) if (b.cels.get(k) !== v) n += v.bytes;
  for (const [k, v] of b.cels) if (a.cels.get(k) !== v) n += v.bytes;
  return n;
}

/** A plain-words warning about canvas size, or null. */
export function sizeWarning(width, height) {
  if (Math.max(width, height) <= LIMITS.warnSide) return null;
  const mb = Math.round(celBytes(width, height) / 1048576);
  return `Large canvas: every layer of every frame takes about ${mb} MB of memory. Phones and older tablets may run out and close the page.`;
}

/* ---- saving the shape (pixels are stored separately) ---- */

export function toMeta(p) {
  return {
    v: p.v, id: p.id, name: p.name, width: p.width, height: p.height, fps: p.fps, seq: p.seq,
    frames: p.frames.map(f => ({ id: f.id, hold: f.hold })),
    layers: p.layers.map(l => ({ id: l.id, name: l.name, visible: l.visible, opacity: l.opacity })),
  };
}

/** Rebuild a project (without cels) from stored metadata; null if it is unusable or from a newer version. */
export function fromMeta(m) {
  if (!m || typeof m !== 'object' || m.v !== PROJECT_VERSION) return null;
  if (!Array.isArray(m.frames) || !m.frames.length || !Array.isArray(m.layers) || !m.layers.length) return null;
  if (!m.frames.every(f => f && typeof f.id === 'string') || !m.layers.every(l => l && typeof l.id === 'string')) return null;
  return {
    v: PROJECT_VERSION,
    id: String(m.id),
    name: String(m.name ?? 'Untitled').slice(0, LIMITS.maxName),
    width: clampSide(m.width),
    height: clampSide(m.height),
    fps: clampFps(m.fps),
    seq: Number.isFinite(m.seq) ? m.seq : m.frames.length + m.layers.length + 2,
    frames: m.frames.map(f => ({ id: f.id, hold: clampHold(f.hold) })),
    layers: m.layers.map(l => ({
      id: l.id, name: String(l.name ?? 'Layer').slice(0, LIMITS.maxName),
      visible: l.visible !== false, opacity: clamp(Number(l.opacity ?? 1), 0, 1),
    })),
    cels: new Map(),
  };
}
