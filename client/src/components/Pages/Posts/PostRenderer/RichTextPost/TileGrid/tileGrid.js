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
/** Mini (id "small"): the pixel letters at their own size, centred, leaving room above and below. */
/**
 * XL: the pixel letters four times the size, one character across 2 × 2 tiles
 * (32 × 32 grid pixels). It sits in its top-left tile, which is wide; the other
 * three tiles hold nothing, and typing in it moves two tiles at a time.
 */
export const FONT_NAMES = {
  pixel: 'Pixel', small: 'Mini', smooth: 'Smooth', xl: 'XL 2×2',
  // Variants of the pixel letters, made from them (see variantRows): no extra font data.
  bold: 'Pixel bold', italic: 'Pixel italic', outline: 'Pixel outline',
  // Typefaces drawn like Smooth, in a web font: soft-edged unless the grid's edges are Pixel.
  serif: 'Serif', script: 'Script', cute: 'Cute', comic: 'Comic',
};

/**
 * The typefaces: CSS family stacks, weight, and size in grid pixels for a
 * full-width cell (narrow cells use 0.9 of it). Script is larger so its thin
 * strokes read; Cute is Choco Cooky where the device has it (it is not
 * licensed for the web), otherwise the round, bubbly Sniglet.
 */
export const TYPEFACES = {
  serif:  { family: '"Old Standard TT", "Times New Roman", Georgia, serif', weight: 700, size: 15 },
  script: { family: '"Great Vibes", "Snell Roundhand", "Apple Chancery", cursive', weight: 400, size: 18 },
  cute:   { family: '"Choco cooky", "ChocoCooky", "Sniglet", "Arial Rounded MT Bold", sans-serif', weight: 800, size: 15 },
  comic:  { family: '"Comic Sans MS", "Comic Neue", "Chalkboard SE", "Patrick Hand", cursive', weight: 700, size: 15 },
};

/** Asks the browser for the typefaces now, so a grid drawn before they arrive is redrawn by fonts.ready. */
let typefacesRequested = false;
function requestTypefaces() {
  if (typefacesRequested || typeof document === 'undefined' || !document.fonts?.load) return;
  typefacesRequested = true;
  for (const t of Object.values(TYPEFACES)) document.fonts.load(`${t.weight} 16px ${t.family}`).catch(() => {});
}

/**
 * The pixel font's letters in a variant: bold thickens each stroke by a dot,
 * italic leans the top right and the bottom left, outline keeps only the
 * edge of each stroke. Rows are bytes, most significant bit on the left.
 */
export function variantRows(font, rows) {
  if (font === 'bold') return rows.map(b => (b | (b >> 1)) & 0xff);
  if (font === 'italic') return rows.map((b, y) => (y < 3 ? b >> 1 : y > 4 ? (b << 1) & 0xff : b));
  if (font === 'outline') {
    const on = (y, x) => y >= 0 && y < 8 && x >= 0 && x < 8 && (rows[y] & (0x80 >> x)) !== 0;
    return rows.map((_, y) => {
      let out = 0;
      for (let x = 0; x < 8; x++) {
        if (on(y, x) && !(on(y - 1, x) && on(y + 1, x) && on(y, x - 1) && on(y, x + 1))) out |= 0x80 >> x;
      }
      return out;
    });
  }
  return rows;
}

// ── Extensions ────────────────────────────────────────────────────────────────
// `ext` on a grid or a layer holds data this file does not know about:
// { "<namespace>": <JSON> }. It is kept through every load and save, so a new
// feature can store what it needs (a sticker's anchor, a pack's credit, an
// animation) without changing the validators, and a feature that is later
// removed leaves its data harmless. Namespaces are lowercase words; each
// value must be plain JSON, at most EXT_MAX_DEPTH deep, and the whole of one
// ext at most EXT_MAX_CHARS once written out. Anything else is dropped.

export const EXT_MAX_CHARS = 16000;
export const EXT_MAX_DEPTH = 6;
const EXT_NAMESPACE = /^[a-z][a-z0-9-]{0,23}$/;

function plainJson(v, depth = 0) {
  if (depth > EXT_MAX_DEPTH) return false;
  if (v === null || ['string', 'boolean'].includes(typeof v)) return true;
  if (typeof v === 'number') return Number.isFinite(v);
  if (Array.isArray(v)) return v.every(x => plainJson(x, depth + 1));
  if (typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.entries(v).every(([k, x]) => k !== '__proto__' && plainJson(x, depth + 1));
  }
  return false;
}

/** The namespaces of a raw ext that are well-formed, or null if none (or too much) remain. */
export function cleanExt(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const [ns, value] of Object.entries(raw)) {
    if (EXT_NAMESPACE.test(ns) && plainJson(value)) out[ns] = value;
  }
  if (!Object.keys(out).length) return null;
  return JSON.stringify(out).length <= EXT_MAX_CHARS ? out : null;
}

/** The grid format's current version (see guide/GRID-FORMAT.md). */
export const GRID_VERSION = 3;

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;
const GLYPH_HEX = /^([0-9a-f]{32}|[0-9a-f]{64})$/;
const PNG_DATA = 'data:image/png;base64,';

let idCounter = 0;
export const newLayerId = () => `l${Date.now().toString(36)}${(idCounter++).toString(36)}`;

// ── Layers ────────────────────────────────────────────────────────────────────

export function pixelLayer(name = 'Layer', extra = {}) {
  return { id: newLayerId(), kind: 'pixel', name, visible: true, paint: null, text: [], style: {}, wide: [], ...extra };
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
  if (!ctx) return null;
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

export function defaultGrid(cols = 16, rows = 6) {
  return {
    v: 3,
    cols,
    rows,
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
    ...(cleanExt(raw.ext) ? { ext: cleanExt(raw.ext) } : {}),
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
      if (FONT_NAMES[v.font]) s.font = v.font;
      if (typeof v.color === 'string' && HEX_COLOUR.test(v.color)) s.color = v.color.toLowerCase();
      if (Object.keys(s).length) style[k] = s;
    }
  }
  return {
    ...base, kind: 'pixel',
    paint: typeof raw.paint === 'string' && raw.paint.startsWith(PNG_DATA) ? raw.paint : null,
    text: Array.isArray(raw.text) ? raw.text.map(r => String(r ?? '')) : [],
    style,
    wide: Array.isArray(raw.wide) ? [...new Set(raw.wide.filter(k => typeof k === 'string' && /^\d+,\d+$/.test(k)))] : [],
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
/**
 * Antialiasing, per grid. Smooth: photos at full resolution and soft-edged
 * text. Pixel: both snapped to the grid's own pixels, hard-edged. A grid
 * without the setting keeps the original look: photos in grid pixels, soft text.
 */
export const EDGES = { smooth: 'Soft edges', pixel: 'Pixel edges' };

export function normaliseGrid(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const d = {
    v: GRID_VERSION,
    cols: clampInt(r.cols, LIMITS.minCols, LIMITS.maxCols, 16),
    rows: clampInt(r.rows, LIMITS.minRows, LIMITS.maxRows, 6),
    glyphs: cleanGlyphs(r.glyphs),
    layers: Array.isArray(r.layers) ? r.layers.map(cleanLayer).filter(Boolean).slice(0, LIMITS.maxLayers) : [],
  };
  // Before v3 a whole grid was one width; a full-width grid is upgraded so
  // that each character takes a wide tile of its own.
  const legacyFull = !(Number(r.v) >= 3) && r.mode !== 'half';
  d.layers = d.layers.map(l => (l.kind !== 'pixel' ? l
    : legacyFull ? upgradeFullWidth(l) : { ...l, wide: l.wide.filter(k => inGrid(d, k)) }));
  // How photos and smooth text are drawn (see EDGES); absent, the original look.
  if (EDGES[r.edges]) d.edges = r.edges;
  const links = cleanLinks(r.links, d);
  if (links.length) d.links = links;
  const ext = cleanExt(r.ext);
  if (ext) d.ext = ext;
  if (!d.layers.length) d.layers = [pixelLayer('Background')];
  const seen = new Set();
  for (const l of d.layers) { if (seen.has(l.id)) l.id = newLayerId(); seen.add(l.id); }
  return d;
}

// ── Links ─────────────────────────────────────────────────────────────────────
// A run of tiles can carry a link: { href, tiles: ["r,c", …] }. Only web
// addresses and paths on this site; never javascript: or data: and the like.

export const MAX_LINKS = 64;
const SITE_PATH = /^\/(?!\/)[^\s]*$/;
const WEB_URL = /^https?:\/\/[^\s/$.?#][^\s]*$/i;

/** The address as stored, or null if a grid may not link to it. Adds https:// to a bare domain. */
export function cleanHref(raw) {
  if (typeof raw !== 'string') return null;
  let href = raw.trim();
  if (!href || href.length > 500) return null;
  if (!href.startsWith('/') && !/^[a-z][a-z0-9+.-]*:/i.test(href) && /^[^\s/]+\.[^\s/]+/.test(href)) href = `https://${href}`;
  return SITE_PATH.test(href) || WEB_URL.test(href) ? href : null;
}

/** Whether a link leaves this site (and so asks first). */
export function isExternalHref(href, origin = typeof window !== 'undefined' ? window.location.origin : '') {
  if (href.startsWith('/')) return false;
  try { return new URL(href).origin !== origin; } catch { return true; }
}

function cleanLinks(raw, d) {
  if (!Array.isArray(raw)) return [];
  const taken = new Set();
  const out = [];
  for (const link of raw) {
    if (out.length >= MAX_LINKS) break;
    const href = cleanHref(link?.href);
    if (!href || !Array.isArray(link.tiles)) continue;
    const tiles = link.tiles.filter(k => typeof k === 'string' && /^\d+,\d+$/.test(k) && inGrid(d, k) && !taken.has(k));
    tiles.forEach(k => taken.add(k));
    if (tiles.length) out.push({ href, tiles });
  }
  return out;
}

/** The grid with these tiles linked to href (taken from any other link), or unlinked when href is null. */
export function setLink(d, tiles, href) {
  const keys = new Set(tiles);
  const links = (d.links || [])
    .map(l => ({ ...l, tiles: l.tiles.filter(k => !keys.has(k)) }))
    .filter(l => l.tiles.length);
  if (href) links.push({ href, tiles: [...keys] });
  const next = { ...d, links };
  if (!links.length) delete next.links;
  return next;
}

/** The link on a tile, if any. */
export const linkAt = (d, r, c) => (d.links || []).find(l => l.tiles.includes(`${r},${c}`)) || null;

const inGrid = (d, key) => { const [r, c] = key.split(',').map(Number); return r < d.rows && c < d.cols; };

/** A layer from a pre-v3 full-width grid, where character c sat in tile c. */
function upgradeFullWidth(layer) {
  const wide = new Set();
  const text = layer.text.map((row, r) => {
    const chars = Array.from(row);
    chars.forEach((ch, c) => { if (ch !== ' ') wide.add(`${r},${c}`); });
    return chars.flatMap(ch => [ch, ' ']).join('').replace(/ +$/, '');
  });
  const style = {};
  for (const [k, v] of Object.entries(layer.style)) {
    const [r, s] = k.split(',').map(Number);
    style[`${r},${s * 2}`] = v;
  }
  return { ...layer, text, style, wide: [...wide] };
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

// Text sits in slots, two to a tile (half width). A tile listed in its
// layer's `wide` holds one full-width character instead, in its first slot.
// Widths are per tile, so both kinds can share a row.

export const SLOTS_PER_TILE = 2;
export const slotsPerRow = (d) => d.cols * SLOTS_PER_TILE;
/** Width of one slot in grid pixels. */
export const SLOT_W = TILE / SLOTS_PER_TILE;
export const slotKey = (r, s) => `${r},${s}`;
export const isWide = (layer, r, c) => Boolean(layer.wide && layer.wide.includes(`${r},${c}`));

/** The characters of a layer's row, padded with spaces to the full slot count. Code-point safe. */
export function rowChars(d, layer, r) {
  const chars = Array.from(layer.text[r] || '');
  const n = slotsPerRow(d);
  while (chars.length < n) chars.push(' ');
  return chars.slice(0, n);
}

/**
 * Types one character at a slot, full or half width, and returns the changed
 * layer. Full width takes the whole tile (the slot snaps to its first half);
 * half width makes a wide tile narrow again, its character keeping the first
 * half. A space clears what is there.
 */
export function writeChar(d, layer, r, s, ch, style, width = 'half') {
  const c = Math.floor(s / SLOTS_PER_TILE);
  const first = c * SLOTS_PER_TILE;
  const key = `${r},${c}`;
  const others = (layer.wide || []).filter(k => k !== key);
  if (width === 'full') {
    let l = writeSlot(d, layer, r, first + 1, ' ');
    l = writeSlot(d, l, r, first, ch, style);
    return { ...l, wide: ch === ' ' ? others : [...others, key] };
  }
  const wasWide = others.length !== (layer.wide || []).length;
  const l = writeSlot(d, wasWide ? { ...layer, wide: others } : layer, r, s, ch, style);
  return l;
}

/**
 * Types one XL character (font "xl") at a tile: it covers that tile, the one
 * to its right and the two under them, whose text is cleared. Unchanged where
 * it would not fit (last column or row).
 */
export function writeXl(d, layer, r, c, ch, style) {
  if (r + 1 >= d.rows || c + 1 >= d.cols) return layer;
  let l = layer;
  for (const [rr, cc] of [[r, c + 1], [r + 1, c], [r + 1, c + 1]]) {
    l = writeChar(d, l, rr, cc * SLOTS_PER_TILE, ' ', undefined, 'full');
  }
  return writeChar(d, l, r, c * SLOTS_PER_TILE, ch, { ...style, font: 'xl' }, 'full');
}

/** Sets the width of whole tiles, keeping each tile's first character. */
export function setTileWidths(d, layer, tiles, width) {
  if (layer.kind !== 'pixel') return layer;
  let l = layer;
  const wide = new Set(layer.wide || []);
  for (const { r, c } of tiles) {
    const key = `${r},${c}`;
    if (width === 'half') { wide.delete(key); continue; }
    if (wide.has(key)) continue;
    const first = c * SLOTS_PER_TILE;
    const chars = rowChars(d, l, r);
    const keep = chars[first] !== ' ' ? first : chars[first + 1] !== ' ' ? first + 1 : -1;
    if (keep === first + 1) {
      const style = l.style[slotKey(r, keep)];
      l = writeSlot(d, l, r, first, chars[keep], style);
    }
    l = writeSlot(d, l, r, first + 1, ' ');
    if (keep !== -1) wide.add(key);
  }
  return { ...l, wide: [...wide] };
}

/**
 * Writes one character (and optionally its style) into a slot, and returns
 * the changed layer. A space clears the slot and its style.
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
 * The text of two pixel layers as one: wherever the upper layer has a
 * character it wins, and the tile takes the upper layer's width; elsewhere the
 * lower layer shows through. Returns { text, style, wide }.
 */
export function mergeText(d, lower, upper) {
  let merged = { ...lower, text: lower.text.slice(), style: { ...lower.style }, wide: [...(lower.wide || [])] };
  for (let r = 0; r < d.rows; r++) {
    const chars = rowChars(d, upper, r);
    for (let c = 0; c < d.cols; c++) {
      const first = c * SLOTS_PER_TILE;
      const slots = [first, first + 1].filter(s => chars[s] !== ' ');
      if (!slots.length) continue;
      const wide = isWide(upper, r, c);
      // The upper tile replaces the lower one outright, so nothing of the old tile pokes through.
      merged = writeChar(d, merged, r, first, ' ', undefined, 'half');
      merged = writeChar(d, merged, r, first + 1, ' ', undefined, 'half');
      if (wide) {
        merged = writeChar(d, merged, r, first, chars[first], upper.style[slotKey(r, first)], 'full');
      } else {
        for (const s of slots) merged = writeChar(d, merged, r, s, chars[s], upper.style[slotKey(r, s)], 'half');
      }
    }
  }
  return { text: merged.text, style: merged.style, wide: merged.wide };
}

/** Cuts a layer's text to a new size; paint is resized separately, anchored top-left. */
export function resizeLayerText(d, layer, cols, rows) {
  if (layer.kind !== 'pixel') return layer;
  const n = cols * SLOTS_PER_TILE;
  const text = layer.text.slice(0, rows).map(row => Array.from(row).slice(0, n).join('').replace(/ +$/, ''));
  const style = {};
  for (const [k, v] of Object.entries(layer.style)) {
    const [r, s] = k.split(',').map(Number);
    if (r < rows && s < n) style[k] = v;
  }
  const wide = (layer.wide || []).filter(k => { const [r, c] = k.split(',').map(Number); return r < rows && c < cols; });
  return { ...layer, text, style, wide };
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
export function orderSlots(slots, direction, step = 1) {
  const [dr, ds] = DIRECTIONS[direction] || DIRECTIONS.right;
  // `step` slots make one column: 2 when typing full width, a tile at a time.
  const along = ({ r, s }) => r * dr + (s / step) * ds;
  // Lines run across the direction, visited top-to-bottom / left-to-right:
  // rows for horizontal typing, columns for vertical, diagonals for diagonal.
  const across = ({ r, s }) => { const x = s / step; return dr === 0 ? r : ds === 0 ? x : dr * ds > 0 ? x - r : x + r; };
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

/** Limits on a photo layer's scale, the same as GridValidator's. */
export const PHOTO_SCALE = { min: 0.05, max: 8 };

/** A photo layer's rectangle on the grid, in grid pixels. */
export function photoRect(layer, natural, d) {
  return containRect(natural.w, natural.h, d.cols * TILE, d.rows * TILE, layer.scale, layer.x, layer.y);
}

/**
 * The scale and offset that put a photo's dragged corner under the pointer
 * while the opposite corner stays put. The photo keeps its proportions:
 * whichever way the pointer has gone further, across or down, sets the size.
 *
 * `corner` is 'nw', 'ne', 'sw' or 'se'; `pointer` is in grid pixels.
 */
export function resizePhoto(layer, natural, d, corner, pointer) {
  const W = d.cols * TILE, H = d.rows * TILE;
  const r = photoRect(layer, natural, d);
  const left = corner.endsWith('w'), top = corner.startsWith('n');
  const ax = left ? r.x + r.w : r.x;   // the corner that stays put
  const ay = top ? r.y + r.h : r.y;
  const aspect = r.w / r.h;
  const across = (left ? ax - pointer.x : pointer.x - ax);
  const down = (top ? ay - pointer.y : pointer.y - ay) * aspect;
  const unit = r.w / layer.scale;      // the photo's width at scale 1
  const scale = Math.min(PHOTO_SCALE.max, Math.max(PHOTO_SCALE.min, Math.max(across, down) / unit));
  const w = unit * scale, h = w / aspect;
  const x0 = left ? ax - w : ax, y0 = top ? ay - h : ay;
  return {
    scale: Math.round(scale * 1000) / 1000,
    x: Math.round(x0 - (W - w) / 2),
    y: Math.round(y0 - (H - h) / 2),
  };
}

/** A photo scaled by a factor about its centre, as the + and − buttons do. */
export function zoomPhoto(layer, factor) {
  const scale = Math.min(PHOTO_SCALE.max, Math.max(PHOTO_SCALE.min, layer.scale * factor));
  return { scale: Math.round(scale * 1000) / 1000 };
}

/**
 * Reduces a loaded photo to grid pixels at its scale, so it reads as part of
 * the pixel art. Drawn at its offset by the renderer.
 */
export function pixelatePhoto(img, d, layer) {
  const W = d.cols * TILE;
  const H = d.rows * TILE;
  const r = containRect(img.naturalWidth || img.width, img.naturalHeight || img.height, W, H, layer.scale);
  // Smooth edges keep the photo at the display's resolution; otherwise it is
  // reduced to grid pixels, sampled (pixel) or averaged (the original look).
  const k = d.edges === 'smooth' ? SCALE : 1;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(r.w * k));
  c.height = Math.max(1, Math.round(r.h * k));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = d.edges !== 'pixel';
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return { canvas: c, x: Math.round(r.x), y: Math.round(r.y), w: c.width / k, h: c.height / k };
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

/**
 * Every text slot inside a set of tiles (or the whole grid when there is
 * none): both halves of each tile, or only the first when typing full width.
 */
export function slotsIn(d, selection, width = 'half') {
  const n = width === 'full' ? 1 : SLOTS_PER_TILE;
  const tiles = selection && selection.size ? orderedTiles(selection)
    : Array.from({ length: d.rows * d.cols }, (_, i) => ({ r: Math.floor(i / d.cols), c: i % d.cols }));
  const slots = [];
  for (const { r, c } of tiles) for (let i = 0; i < n; i++) slots.push({ r, s: c * SLOTS_PER_TILE + i });
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
        ctx.imageSmoothingEnabled = d.edges === 'smooth';
        ctx.drawImage(a.photo.canvas, a.photo.x + layer.x + dx, a.photo.y + layer.y + dy, a.photo.w, a.photo.h);
        ctx.imageSmoothingEnabled = false;
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

  if (view.showLinks && d.links) {
    // Linked tiles are underlined while editing, so you can see what links.
    ctx.fillStyle = '#5ea0ff';
    for (const link of d.links) {
      for (const key of link.tiles) {
        const { r, c } = parseTileKey(key);
        ctx.fillRect(c * TILE + 1, (r + 1) * TILE - 1.5, TILE - 2, 1);
      }
    }
  }

  if (view.selection && view.selection.size) drawSelection(ctx, view.selection, view.moveBy);

  if (view.cursor) {
    const sw = view.cursorWide ? TILE : SLOT_W;
    const { r } = view.cursor;
    const s = view.cursorWide ? view.cursor.s - (view.cursor.s % SLOTS_PER_TILE) : view.cursor.s;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 / SCALE;
    // s counts half-tile slots, whatever the cursor's width.
    const x = s * SLOT_W;
    ctx.strokeRect(x + 0.25, r * TILE + 0.25, sw - 0.5, TILE - 0.5);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1 / SCALE;
    ctx.strokeRect(x + 0.75, r * TILE + 0.75, sw - 1.5, TILE - 1.5);
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
  for (let r = 0; r < d.rows; r++) {
    const chars = rowChars(d, layer, r);
    for (let c = 0; c < d.cols; c++) {
      const wide = isWide(layer, r, c);
      for (let i = 0; i < (wide ? 1 : SLOTS_PER_TILE); i++) {
        const s = c * SLOTS_PER_TILE + i;
        const ch = chars[s];
        if (ch === ' ') continue;
        const sw = wide ? TILE : SLOT_W;
        const style = layer.style[slotKey(r, s)] || {};
        ctx.fillStyle = style.color || '#ffffff';
        const x = s * SLOT_W;
        const y = r * TILE;
        if (d.glyphs[ch]) drawCustomGlyph(ctx, d.glyphs[ch], x, y, sw);
        else if (style.font === 'xl' && wide && pixelGlyph(ch)) drawXlGlyph(ctx, pixelGlyph(ch), x, y);
        else if (['bold', 'italic', 'outline'].includes(style.font) && pixelGlyph(ch)) drawPixelGlyph(ctx, variantRows(style.font, pixelGlyph(ch)), x, y, sw);
        else if (style.font === 'small' && pixelGlyph(ch)) drawSmallGlyph(ctx, pixelGlyph(ch), x, y, sw);
        else if (style.font !== 'smooth' && !TYPEFACES[style.font] && pixelGlyph(ch)) drawPixelGlyph(ctx, pixelGlyph(ch), x, y, sw);
        else if (d.edges === 'pixel') drawPixelatedChar(ctx, ch, x, y, sw, style.font);
        else drawSmoothChar(ctx, ch, x, y, sw, style.font);
      }
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

/** 8×8 font bitmap four grid pixels a dot: 32 × 32, across 2 × 2 tiles. */
function drawXlGlyph(ctx, rows, x, y) {
  for (let gy = 0; gy < 8; gy++) {
    const bits = rows[gy];
    if (!bits) continue;
    for (let gx = 0; gx < 8; gx++) if (bits & (0x80 >> gx)) ctx.fillRect(x + gx * 4, y + gy * 4, 4, 4);
  }
}

/** 8×8 font bitmap at one grid pixel a dot, centred in the cell: half a tile tall. */
function drawSmallGlyph(ctx, rows, x, y, sw) {
  const ox = x + Math.floor((sw - 8) / 2);
  const oy = y + (TILE - 8) / 2;
  for (let gy = 0; gy < 8; gy++) {
    const bits = rows[gy];
    if (!bits) continue;
    for (let gx = 0; gx < 8; gx++) if (bits & (0x80 >> gx)) ctx.fillRect(ox + gx, oy + gy, 1, 1);
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

/**
 * A smooth-font character snapped to grid pixels: drawn once into a cell of
 * grid pixels, its coverage cut at half, and each covered pixel filled.
 */
const pixelatedChars = new Map();
function drawPixelatedChar(ctx, ch, x, y, sw, font) {
  const key = `${font || 'smooth'}|${ch}|${sw}`;
  let mask = pixelatedChars.get(key);
  if (!mask) {
    if (typeof document === 'undefined') return;
    const c = document.createElement('canvas');
    c.width = sw * SCALE; c.height = TILE * SCALE;
    const g = c.getContext('2d');
    if (!g) return;
    g.scale(SCALE, SCALE);
    g.fillStyle = '#000';
    drawSmoothChar(g, ch, 0, 0, sw, font);
    const data = g.getImageData(0, 0, c.width, c.height).data;
    mask = [];
    for (let py = 0; py < TILE; py++) {
      for (let px = 0; px < sw; px++) {
        let cover = 0;
        for (let sy = 0; sy < SCALE; sy++) {
          for (let sx = 0; sx < SCALE; sx++) cover += data[(((py * SCALE + sy) * c.width) + px * SCALE + sx) * 4 + 3];
        }
        if (cover / (SCALE * SCALE) >= 128) mask.push(px, py);
      }
    }
    // Kept only once the font has loaded; until then it is the fallback's shape.
    if (document.fonts?.status !== 'loading') {
      if (pixelatedChars.size > 2000) pixelatedChars.clear();
      pixelatedChars.set(key, mask);
    }
  }
  for (let i = 0; i < mask.length; i += 2) ctx.fillRect(x + mask[i], y + mask[i + 1], 1, 1);
}

function drawSmoothChar(ctx, ch, x, y, sw, font) {
  const face = TYPEFACES[font];
  if (face) requestTypefaces();
  // A monospace advance is about 0.6em, so these sizes fill the cell width.
  const size = face ? (sw === TILE ? face.size : face.size * 0.9) : (sw === TILE ? 14 : 12.5);
  ctx.font = face ? `${face.weight} ${size}px ${face.family}` : `500 ${size}px ${SMOOTH_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, x + sw / 2, y + TILE / 2 + 0.5, sw);
}
