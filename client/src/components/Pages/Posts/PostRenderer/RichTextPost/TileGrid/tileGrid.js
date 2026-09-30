/**
 * Tile grid: a post block made of square tiles, built up in layers. This file
 * is the data model and the renderer; the editing UI lives in TileGrid.jsx.
 *
 * Geometry, in grid pixels:
 *   - every tile is TILE × TILE (16 × 16);
 *   - "full" mode puts one character in each tile (a 16 × 16 cell);
 *   - "half" mode puts two in each tile (two 8 × 16 cells).
 *
 * Layers, bottom first. Each is either
 *   - a pixel layer: painted pixels (a PNG) plus text, where every character
 *     keeps its own font and colour; or
 *   - a photo layer: one of the user's uploads, scaled and positioned.
 * Anything not painted is transparent; the default bottom layer is solid black
 * and can be erased like any other.
 */
import { pixelGlyph } from './tileFont.js';

export const TILE = 16;
/** Canvas pixels per grid pixel. High enough for the smooth font to render crisply. */
export const SCALE = 4;

export const LIMITS = { minCols: 1, maxCols: 64, minRows: 1, maxRows: 48, minLayers: 1, maxLayers: 10 };

export const SMOOTH_FONT = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
export const FONT_NAMES = { pixel: 'Pixel', smooth: 'Smooth' };

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;
const GLYPH_HEX = /^([0-9a-f]{32}|[0-9a-f]{64})$/;
const PNG_DATA = 'data:image/png;base64,';

let idCounter = 0;
export const newLayerId = () => `l${Date.now().toString(36)}${(idCounter++).toString(36)}`;

// ── Layers ────────────────────────────────────────────────────────────────────

export function pixelLayer(name = 'Layer', extra = {}) {
  return { id: newLayerId(), kind: 'pixel', name, visible: true, paint: null, text: [], style: {}, ...extra };
}

export function photoLayer(src, name = 'Photo') {
  return { id: newLayerId(), kind: 'photo', name, visible: true, src, scale: 1, x: 0, y: 0 };
}

/** A solid black PNG the size of the grid: the default bottom layer's paint. */
export function solidPaint(cols, rows, colour = '#000000') {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = cols * TILE;
  c.height = rows * TILE;
  const ctx = c.getContext('2d');
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

export function defaultGrid(cols = 16, rows = 6) {
  return {
    v: 2,
    cols,
    rows,
    mode: 'full',
    glyphs: {},
    layers: [
      pixelLayer('Background', { paint: solidPaint(cols, rows) }),
      pixelLayer('Text'),
    ],
  };
}

function cleanLayer(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const base = {
    id: typeof raw.id === 'string' && /^[a-z0-9]{1,32}$/i.test(raw.id) ? raw.id : newLayerId(),
    name: String(raw.name || 'Layer').slice(0, 40),
    visible: raw.visible !== false,
  };
  if (raw.kind === 'photo') {
    // Only the app's own uploads: a grid must not make a reader's browser
    // fetch an arbitrary URL.
    if (typeof raw.src !== 'string' || !raw.src.startsWith('/uploads/')) return null;
    return {
      ...base, kind: 'photo', src: raw.src,
      scale: clampNum(raw.scale, 0.05, 8, 1), x: clampNum(raw.x, -4096, 4096, 0), y: clampNum(raw.y, -4096, 4096, 0),
    };
  }
  const style = {};
  if (raw.style && typeof raw.style === 'object') {
    for (const [k, v] of Object.entries(raw.style)) {
      if (!/^\d+,\d+$/.test(k) || !v || typeof v !== 'object') continue;
      const s = {};
      if (v.font === 'smooth' || v.font === 'pixel') s.font = v.font;
      if (typeof v.color === 'string' && HEX_COLOUR.test(v.color)) s.color = v.color.toLowerCase();
      if (Object.keys(s).length) style[k] = s;
    }
  }
  return {
    ...base, kind: 'pixel',
    paint: typeof raw.paint === 'string' && raw.paint.startsWith(PNG_DATA) ? raw.paint : null,
    text: Array.isArray(raw.text) ? raw.text.map(r => String(r ?? '')) : [],
    style,
  };
}

/** Keeps only well-formed custom glyphs: one character → 8×16 or 16×16 bitmap. */
export function cleanGlyphs(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [ch, hex] of Object.entries(raw)) {
    if (Array.from(ch).length === 1 && typeof hex === 'string' && GLYPH_HEX.test(hex)) out[ch] = hex;
  }
  return out;
}

/** Fills in anything missing or out of range, so any stored grid still renders. */
export function normaliseGrid(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const d = {
    v: 2,
    cols: clampInt(r.cols, LIMITS.minCols, LIMITS.maxCols, 16),
    rows: clampInt(r.rows, LIMITS.minRows, LIMITS.maxRows, 6),
    mode: r.mode === 'half' ? 'half' : 'full',
    glyphs: cleanGlyphs(r.glyphs),
    layers: Array.isArray(r.layers) ? r.layers.map(cleanLayer).filter(Boolean).slice(0, LIMITS.maxLayers) : [],
  };
  if (!d.layers.length) d.layers = [pixelLayer('Background')];
  const seen = new Set();
  for (const l of d.layers) { if (seen.has(l.id)) l.id = newLayerId(); seen.add(l.id); }
  return d;
}

function clampInt(v, lo, hi, fallback) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

function clampNum(v, lo, hi, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

// ── Text slots ────────────────────────────────────────────────────────────────

export const perTile = (d) => (d.mode === 'half' ? 2 : 1);
export const slotsPerRow = (d) => d.cols * perTile(d);
/** Width of one character cell in grid pixels. */
export const slotWidth = (d) => TILE / perTile(d);
export const slotKey = (r, s) => `${r},${s}`;

/** The characters of a layer's row, padded with spaces to the full slot count. Code-point safe. */
export function rowChars(d, layer, r) {
  const chars = Array.from(layer.text[r] || '');
  const n = slotsPerRow(d);
  while (chars.length < n) chars.push(' ');
  return chars.slice(0, n);
}

/**
 * Writes one character (and optionally its style) into a pixel layer, and
 * returns the changed layer. A space clears the slot and its style.
 */
export function writeSlot(d, layer, r, s, ch, style) {
  const text = layer.text.slice();
  while (text.length <= r) text.push('');
  const chars = rowChars(d, layer, r);
  chars[s] = ch;
  text[r] = chars.join('').replace(/ +$/, '');
  const next = { ...layer.style };
  if (ch === ' ') delete next[slotKey(r, s)];
  else if (style) next[slotKey(r, s)] = { ...next[slotKey(r, s)], ...style };
  return { ...layer, text, style: next };
}

/** Changes only the style of slots, leaving their characters alone. */
export function restyleSlots(layer, slots, style) {
  const next = { ...layer.style };
  for (const { r, s } of slots) next[slotKey(r, s)] = { ...next[slotKey(r, s)], ...style };
  return { ...layer, style: next };
}

/**
 * Switching modes keeps each tile's content in place: a full-width character
 * becomes the first half of its tile; going back keeps the first half.
 */
export function convertLayerMode(d, layer, mode) {
  if (mode === d.mode || layer.kind !== 'pixel') return layer;
  const text = layer.text.map((row, r) => {
    const chars = rowChars(d, layer, r);
    const out = mode === 'half' ? chars.flatMap(ch => [ch, ' ']) : chars.filter((_, i) => i % 2 === 0);
    return out.join('').replace(/ +$/, '');
  });
  const style = {};
  for (const [k, v] of Object.entries(layer.style)) {
    const [r, s] = k.split(',').map(Number);
    if (mode === 'half') style[slotKey(r, s * 2)] = v;
    else if (s % 2 === 0) style[slotKey(r, s / 2)] = v;
  }
  return { ...layer, text, style };
}

/** Cuts a layer's text to a new size; paint is resized separately, anchored top-left. */
export function resizeLayerText(d, layer, cols, rows) {
  if (layer.kind !== 'pixel') return layer;
  const n = cols * perTile(d);
  const text = layer.text.slice(0, rows).map(row => Array.from(row).slice(0, n).join('').replace(/ +$/, ''));
  const style = {};
  for (const [k, v] of Object.entries(layer.style)) {
    const [r, s] = k.split(',').map(Number);
    if (r < rows && s < n) style[k] = v;
  }
  return { ...layer, text, style };
}

// ── Typing direction ──────────────────────────────────────────────────────────

/** The eight directions, as [row step, slot step]. */
export const DIRECTIONS = {
  'up-left': [-1, -1], up: [-1, 0], 'up-right': [-1, 1],
  left: [0, -1], right: [0, 1],
  'down-left': [1, -1], down: [1, 0], 'down-right': [1, 1],
};

/**
 * The order typing fills a set of slots in a given direction: along the
 * direction, and line after line across it. For "right" that is left to
 * right, then down; for "down" it is top to bottom, then right.
 */
export function orderSlots(slots, direction) {
  const [dr, ds] = DIRECTIONS[direction] || DIRECTIONS.right;
  const along = ({ r, s }) => r * dr + s * ds;
  // Lines run across the direction, visited top-to-bottom / left-to-right:
  // rows for horizontal typing, columns for vertical, diagonals for diagonal.
  const across = ({ r, s }) => (dr === 0 ? r : ds === 0 ? s : dr * ds > 0 ? s - r : s + r);
  return slots.slice().sort((a, b) => across(a) - across(b) || along(a) - along(b));
}

// ── Custom glyphs ─────────────────────────────────────────────────────────────
// Stored as hex, one row per line of 16: 2 hex digits per row for an 8-wide
// glyph (half width), 4 for a 16-wide one (full width).

export function glyphSize(hex) {
  return { w: hex.length === 64 ? 16 : 8, h: 16 };
}

export function bitsFromHex(hex, w) {
  const digits = w / 4;
  const bits = [];
  for (let y = 0; y < 16; y++) {
    const row = parseInt(hex.substr(y * digits, digits) || '0', 16);
    for (let x = 0; x < w; x++) bits.push(Boolean(row & (1 << (w - 1 - x))));
  }
  return bits;
}

export function hexFromBits(bits, w) {
  let hex = '';
  for (let y = 0; y < 16; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) if (bits[y * w + x]) row |= 1 << (w - 1 - x);
    hex += row.toString(16).padStart(w / 4, '0');
  }
  return hex;
}

/** A starting point for a new custom glyph: the built-in pixel glyph, scaled to fill the cell. */
export function seedBits(ch, w) {
  const bits = new Array(w * 16).fill(false);
  const g = ch ? pixelGlyph(ch) : null;
  if (!g) return bits;
  const sx = w / 8;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < w; x++) bits[y * w + x] = Boolean(g[y >> 1] & (0x80 >> Math.floor(x / sx)));
  }
  return bits;
}

// ── Photos ────────────────────────────────────────────────────────────────────

/**
 * Where a photo lands in an area: scaled to fit ("contain") and then by
 * `scale`, centred, then moved by (x, y). Whatever it does not cover shows the
 * layers underneath — black, on the default grid.
 */
export function containRect(imgW, imgH, areaW, areaH, scale = 1, x = 0, y = 0) {
  const fit = Math.min(areaW / imgW, areaH / imgH) * scale;
  const w = imgW * fit;
  const h = imgH * fit;
  return { x: (areaW - w) / 2 + x, y: (areaH - h) / 2 + y, w, h };
}

/**
 * Reduces a loaded photo to grid pixels at its scale, so it reads as part of
 * the pixel art. Drawn at its offset by the renderer.
 */
export function pixelatePhoto(img, d, layer) {
  const W = d.cols * TILE;
  const H = d.rows * TILE;
  const r = containRect(img.naturalWidth || img.width, img.naturalHeight || img.height, W, H, layer.scale);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(r.w));
  c.height = Math.max(1, Math.round(r.h));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return { canvas: c, x: Math.round(r.x), y: Math.round(r.y) };
}

// ── Selections ────────────────────────────────────────────────────────────────

export const tileKey = (r, c) => `${r},${c}`;
export const parseTileKey = (k) => { const [r, c] = k.split(',').map(Number); return { r, c }; };

/** Every tile in the rectangle between two tiles, whichever way it was dragged. */
export function rectTiles(a, b) {
  const out = [];
  for (let r = Math.min(a.r, b.r); r <= Math.max(a.r, b.r); r++) {
    for (let c = Math.min(a.c, b.c); c <= Math.max(a.c, b.c); c++) out.push(tileKey(r, c));
  }
  return out;
}

/** Shift adds to a selection, Alt takes away, otherwise it is replaced. */
export function combineSelection(base, rect, mode) {
  if (mode === 'add') return new Set([...base, ...rect]);
  if (mode === 'remove') { const s = new Set(base); rect.forEach(k => s.delete(k)); return s; }
  return new Set(rect);
}

/** Selected tiles, top to bottom then left to right. */
export function orderedTiles(selection) {
  return [...selection].map(parseTileKey).sort((a, b) => a.r - b.r || a.c - b.c);
}

/** Every text slot inside a set of tiles (or the whole grid when there is none). */
export function slotsIn(d, selection) {
  const n = perTile(d);
  const slots = [];
  if (selection && selection.size) {
    for (const { r, c } of orderedTiles(selection)) for (let i = 0; i < n; i++) slots.push({ r, s: c * n + i });
  } else {
    for (let r = 0; r < d.rows; r++) for (let s = 0; s < slotsPerRow(d); s++) slots.push({ r, s });
  }
  return slots;
}

// ── Rendering ─────────────────────────────────────────────────────────────────

/**
 * Draws the grid onto a canvas sized (cols·TILE·SCALE) × (rows·TILE·SCALE).
 * Transparent wherever no layer has anything.
 *
 * @param {object} assets  per layer id: { paint: canvas } or { photo: {canvas, x, y} }
 * @param {object} view    canvas pixels per grid pixel (scale, default SCALE), and
 *                         editing overlays: cursor, selection, moveBy, showGrid
 */
export function renderGrid(ctx, d, assets = {}, view = {}) {
  const W = d.cols * TILE;
  const H = d.rows * TILE;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const k = view.scale || SCALE;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.imageSmoothingEnabled = false;

  for (const layer of d.layers) {
    if (!layer.visible) continue;
    const a = assets[layer.id] || {};
    const lift = view.moveBy && view.activeId === layer.id ? view.moveBy : null;
    if (layer.kind === 'photo') {
      if (a.photo) {
        const dx = (lift?.px ?? 0);
        const dy = (lift?.py ?? 0);
        ctx.drawImage(a.photo.canvas, a.photo.x + layer.x + dx, a.photo.y + layer.y + dy);
      }
      continue;
    }
    if (a.paint) ctx.drawImage(a.paint, 0, 0, W, H);
    drawLayerText(ctx, d, layer);
  }

  if (view.showGrid) {
    ctx.strokeStyle = 'rgba(128,128,128,0.35)';
    ctx.lineWidth = 1 / SCALE;
    ctx.beginPath();
    for (let x = 1; x < d.cols; x++) { ctx.moveTo(x * TILE, 0); ctx.lineTo(x * TILE, H); }
    for (let y = 1; y < d.rows; y++) { ctx.moveTo(0, y * TILE); ctx.lineTo(W, y * TILE); }
    ctx.stroke();
  }

  if (view.selection && view.selection.size) drawSelection(ctx, view.selection, view.moveBy);

  if (view.cursor) {
    const sw = slotWidth(d);
    const { r, s } = view.cursor;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 / SCALE;
    ctx.strokeRect(s * sw + 0.25, r * TILE + 0.25, sw - 0.5, TILE - 0.5);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1 / SCALE;
    ctx.strokeRect(s * sw + 0.75, r * TILE + 0.75, sw - 1.5, TILE - 1.5);
  }
  ctx.restore();
}

/**
 * A selection is any set of tiles. It is shaded, and outlined only along edges
 * that do not touch another selected tile, so a shape reads as one region.
 * While it is being dragged, `moveBy` shows where it will land.
 */
function drawSelection(ctx, selection, moveBy) {
  const dr = moveBy?.r || 0;
  const dc = moveBy?.c || 0;
  ctx.save();
  ctx.fillStyle = 'rgba(80, 160, 255, 0.28)';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5 / SCALE;
  ctx.setLineDash([1, 1]);
  ctx.beginPath();
  for (const key of selection) {
    const { r: r0, c: c0 } = parseTileKey(key);
    const x = (c0 + dc) * TILE, y = (r0 + dr) * TILE;
    ctx.fillRect(x, y, TILE, TILE);
    if (!selection.has(tileKey(r0 - 1, c0))) { ctx.moveTo(x, y); ctx.lineTo(x + TILE, y); }
    if (!selection.has(tileKey(r0 + 1, c0))) { ctx.moveTo(x, y + TILE); ctx.lineTo(x + TILE, y + TILE); }
    if (!selection.has(tileKey(r0, c0 - 1))) { ctx.moveTo(x, y); ctx.lineTo(x, y + TILE); }
    if (!selection.has(tileKey(r0, c0 + 1))) { ctx.moveTo(x + TILE, y); ctx.lineTo(x + TILE, y + TILE); }
  }
  ctx.stroke();
  ctx.strokeStyle = '#000000';
  ctx.lineDashOffset = 1;
  ctx.stroke();
  ctx.restore();
}

function drawLayerText(ctx, d, layer) {
  const sw = slotWidth(d);
  for (let r = 0; r < d.rows; r++) {
    const chars = rowChars(d, layer, r);
    for (let s = 0; s < chars.length; s++) {
      const ch = chars[s];
      if (ch === ' ') continue;
      const style = layer.style[slotKey(r, s)] || {};
      ctx.fillStyle = style.color || '#ffffff';
      const x = s * sw;
      const y = r * TILE;
      if (d.glyphs[ch]) drawCustomGlyph(ctx, d.glyphs[ch], x, y, sw);
      else if (style.font !== 'smooth' && pixelGlyph(ch)) drawPixelGlyph(ctx, pixelGlyph(ch), x, y, sw);
      else drawSmoothChar(ctx, ch, x, y, sw);
    }
  }
}

/** 8×8 font bitmap stretched to the cell: 2×2 per bit when full width, 1×2 when half. */
function drawPixelGlyph(ctx, rows, x, y, sw) {
  const px = sw / 8;
  const py = TILE / 8;
  for (let gy = 0; gy < 8; gy++) {
    const bits = rows[gy];
    if (!bits) continue;
    for (let gx = 0; gx < 8; gx++) if (bits & (0x80 >> gx)) ctx.fillRect(x + gx * px, y + gy * py, px, py);
  }
}

function drawCustomGlyph(ctx, hex, x, y, sw) {
  const { w } = glyphSize(hex);
  const bits = bitsFromHex(hex, w);
  const px = sw / w;
  for (let gy = 0; gy < 16; gy++) {
    for (let gx = 0; gx < w; gx++) if (bits[gy * w + gx]) ctx.fillRect(x + gx * px, y + gy, px, 1);
  }
}

function drawSmoothChar(ctx, ch, x, y, sw) {
  // A monospace advance is about 0.6em, so these sizes fill the cell width.
  const size = sw === TILE ? 14 : 12.5;
  ctx.font = `500 ${size}px ${SMOOTH_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, x + sw / 2, y + TILE / 2 + 0.5, sw);
}
