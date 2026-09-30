/**
 * Tile grid: a post block made of square tiles that hold text, painted pixels
 * and an optional photo. This file is the data model and the renderer; the
 * editing UI lives in TileGridNode.jsx.
 *
 * Geometry, in grid pixels:
 *   - every tile is TILE × TILE (16 × 16);
 *   - "full" mode puts one character in each tile (a 16 × 16 cell);
 *   - "half" mode puts two in each tile (two 8 × 16 cells).
 *
 * Layers, bottom to top: background colour → photo → painted pixels → text.
 */
import { pixelGlyph } from './tileFont.js';

export const TILE = 16;
/** Canvas pixels per grid pixel. High enough for the smooth font to render crisply. */
export const SCALE = 4;

export const LIMITS = { minCols: 1, maxCols: 64, minRows: 1, maxRows: 48 };

export const SMOOTH_FONT = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/** Background textures, drawn under everything else. */
export const GRID_TEXTURES = {
  none: 'Plain colour',
  cork: 'Cork board',
  newsprint: 'Newsprint',
  graph: 'Graph paper',
  dots: 'Dot grid',
  scanlines: 'CRT scanlines',
};

/** The three content layers. Their order in `layers` is bottom to top. */
export const LAYER_NAMES = { photo: 'Photo', paint: 'Paint', text: 'Text' };
const DEFAULT_LAYERS = ['photo', 'paint', 'text'];

export function defaultGrid() {
  return {
    cols: 16,
    rows: 6,
    mode: 'full',
    font: 'pixel',
    fg: '#ffffff',
    bg: '#000000',
    texture: 'none',
    layers: DEFAULT_LAYERS.slice(),
    text: [],
    paint: null,
    glyphs: {},
    image: null,
  };
}

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;
const GLYPH_HEX = /^([0-9a-f]{32}|[0-9a-f]{64})$/;

/** Keeps only well-formed custom glyphs: one character → 8×16 or 16×16 bitmap. */
export function cleanGlyphs(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [ch, hex] of Object.entries(raw)) {
    if (Array.from(ch).length === 1 && typeof hex === 'string' && GLYPH_HEX.test(hex)) out[ch] = hex;
  }
  return out;
}

/** Fills in anything missing or out of range, so old or hand-edited data still renders. */
export function normaliseGrid(raw) {
  const d = { ...defaultGrid(), ...(raw || {}) };
  d.cols = clampInt(d.cols, LIMITS.minCols, LIMITS.maxCols, 16);
  d.rows = clampInt(d.rows, LIMITS.minRows, LIMITS.maxRows, 6);
  d.mode = d.mode === 'half' ? 'half' : 'full';
  d.font = d.font === 'smooth' ? 'smooth' : 'pixel';
  d.fg = HEX_COLOUR.test(d.fg) ? d.fg : '#ffffff';
  d.bg = HEX_COLOUR.test(d.bg) ? d.bg : '#000000';
  d.texture = Object.hasOwn(GRID_TEXTURES, d.texture) ? d.texture : 'none';
  d.layers = Array.isArray(d.layers) && d.layers.length === 3 && DEFAULT_LAYERS.every(l => d.layers.includes(l))
    ? d.layers.slice() : DEFAULT_LAYERS.slice();
  d.text = Array.isArray(d.text) ? d.text.map(r => String(r ?? '')) : [];
  d.glyphs = cleanGlyphs(d.glyphs);
  // Only the app's own uploads and PNG paint layers: a grid must not be able
  // to make a reader's browser fetch an arbitrary URL.
  d.paint = typeof d.paint === 'string' && d.paint.startsWith('data:image/png;base64,') ? d.paint : null;
  d.image = d.image && typeof d.image.src === 'string' && d.image.src.startsWith('/uploads/')
    ? { src: d.image.src, scale: clampNum(d.image.scale, 0.1, 4, 1) } : null;
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

export function slotsPerRow(d) {
  return d.mode === 'half' ? d.cols * 2 : d.cols;
}

/** Width of one character cell in grid pixels. */
export function slotWidth(d) {
  return d.mode === 'half' ? TILE / 2 : TILE;
}

/** The characters of a row, padded with spaces to the full slot count. Code-point safe. */
export function rowChars(d, r) {
  const chars = Array.from(d.text[r] || '');
  const n = slotsPerRow(d);
  while (chars.length < n) chars.push(' ');
  return chars.slice(0, n);
}

/** Returns new text with one slot replaced. */
export function setChar(d, r, s, ch) {
  const text = d.text.slice();
  while (text.length <= r) text.push('');
  const chars = rowChars(d, r);
  chars[s] = ch;
  text[r] = chars.join('').replace(/ +$/, '');
  return text;
}

/**
 * Switching modes keeps each tile's content in place: a full-width character
 * becomes the first half of its tile; going back keeps the first half.
 */
export function convertMode(d, mode) {
  if (mode === d.mode) return d.text;
  return d.text.map((row, r) => {
    const chars = rowChars(d, r);
    const out = mode === 'half'
      ? chars.flatMap(ch => [ch, ' '])
      : chars.filter((_, i) => i % 2 === 0);
    return out.join('').replace(/ +$/, '');
  });
}

/** Cuts text to a new size; the paint layer is resized separately, anchored top-left. */
export function resizeText(d, cols, rows) {
  const n = d.mode === 'half' ? cols * 2 : cols;
  return d.text.slice(0, rows).map(row => Array.from(row).slice(0, n).join('').replace(/ +$/, ''));
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
    for (let x = 0; x < w; x++) {
      bits[y * w + x] = Boolean(g[y >> 1] & (0x80 >> Math.floor(x / sx)));
    }
  }
  return bits;
}

// ── Photo placement ───────────────────────────────────────────────────────────

/**
 * Where a photo lands in an area: scaled to fit ("contain") and then by
 * `scale`, centred. Anything the photo does not cover is left black, which is
 * the border when its shape does not match the grid's.
 */
export function containRect(imgW, imgH, areaW, areaH, scale = 1) {
  const fit = Math.min(areaW / imgW, areaH / imgH) * scale;
  const w = imgW * fit;
  const h = imgH * fit;
  return { x: (areaW - w) / 2, y: (areaH - h) / 2, w, h };
}

// ── Rendering ─────────────────────────────────────────────────────────────────

/**
 * Draws the grid onto a canvas sized (cols·TILE·SCALE) × (rows·TILE·SCALE).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} d                  normalised grid data
 * @param {object} layers
 * @param {HTMLCanvasElement|null} layers.photo  the photo, already reduced to grid pixels
 * @param {HTMLCanvasElement|null} layers.paint  the paint layer, in grid pixels
 * @param {{r:number,s:number}|null} layers.cursor  text caret, when editing
 * @param {boolean} layers.showGrid   faint tile lines, when editing
 */
export function renderGrid(ctx, d, { photo = null, paint = null, texture = null, cursor = null, selection = null, moveBy = null, showGrid = false } = {}) {
  const W = d.cols * TILE;
  const H = d.rows * TILE;
  ctx.save();
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);

  ctx.fillStyle = d.bg;
  ctx.fillRect(0, 0, W, H);
  drawTexture(ctx, d, texture, W, H);

  ctx.imageSmoothingEnabled = false;
  for (const layer of d.layers) {
    if (layer === 'photo' && photo) ctx.drawImage(photo, 0, 0, W, H);
    else if (layer === 'paint' && paint) ctx.drawImage(paint, 0, 0, W, H);
    else if (layer === 'text') drawText(ctx, d);
  }

  if (showGrid) {
    ctx.strokeStyle = 'rgba(128,128,128,0.35)';
    ctx.lineWidth = 1 / SCALE;
    ctx.beginPath();
    for (let x = 1; x < d.cols; x++) { ctx.moveTo(x * TILE, 0); ctx.lineTo(x * TILE, H); }
    for (let y = 1; y < d.rows; y++) { ctx.moveTo(0, y * TILE); ctx.lineTo(W, y * TILE); }
    ctx.stroke();
  }

  if (selection && selection.size) drawSelection(ctx, selection, moveBy);

  if (cursor) {
    const sw = slotWidth(d);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 / SCALE;
    ctx.strokeRect(cursor.s * sw + 0.25, cursor.r * TILE + 0.25, sw - 0.5, TILE - 0.5);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1 / SCALE;
    ctx.strokeRect(cursor.s * sw + 0.75, cursor.r * TILE + 0.75, sw - 1.5, TILE - 1.5);
  }
  ctx.restore();
}

/**
 * The background texture. Line textures are drawn directly in the text colour
 * at low strength; cork and newsprint are noise images (see textureImage).
 */
function drawTexture(ctx, d, image, W, H) {
  if (d.texture === 'none') return;
  if (image) {
    ctx.save();
    ctx.globalAlpha = d.texture === 'cork' ? 1 : 0.22;
    ctx.globalCompositeOperation = d.texture === 'cork' ? 'source-over' : 'multiply';
    const pattern = ctx.createPattern(image, 'repeat');
    if (pattern) {
      // Half size in grid pixels: fine enough to read as a surface, coarse
      // enough that the grain survives being scaled up with the grid.
      pattern.setTransform?.(new DOMMatrix().scale(0.5));
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.strokeStyle = d.fg;
  ctx.fillStyle = d.fg;
  ctx.globalAlpha = 0.16;
  ctx.lineWidth = 1 / SCALE;
  if (d.texture === 'graph') {
    ctx.beginPath();
    for (let x = 0; x <= W; x += 4) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 0; y <= H; y += 4) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  } else if (d.texture === 'dots') {
    for (let y = 2; y < H; y += 4) for (let x = 2; x < W; x += 4) ctx.fillRect(x - 0.25, y - 0.25, 0.5, 0.5);
  } else if (d.texture === 'scanlines') {
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000000';
    for (let y = 0; y < H; y += 1) ctx.fillRect(0, y + 0.5, W, 0.25);
  }
  ctx.restore();
}

const TEXTURE_SVGS = {
  cork: "<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><rect width='100%' height='100%' fill='#b8834a'/><filter id='a'><feTurbulence type='fractalNoise' baseFrequency='.28' numOctaves='2' seed='4' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .23 0 0 0 0 .13 0 0 0 0 .05 0 0 0 -1.6 1.05'/></filter><filter id='b'><feTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='2' seed='9' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .16 0 0 0 0 .09 0 0 0 0 .03 0 0 0 -3 1.9'/></filter><filter id='c'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='1' seed='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 .86 0 0 0 0 .62 0 0 0 -3.4 2'/></filter><rect width='100%' height='100%' filter='url(#a)'/><rect width='100%' height='100%' filter='url(#b)'/><rect width='100%' height='100%' filter='url(#c)' opacity='.55'/></svg>",
  newsprint: "<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>",
};

/** The image a texture is drawn from, or null for textures drawn as lines. */
export function textureImage(texture) {
  const svg = TEXTURE_SVGS[texture];
  if (!svg) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
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
  ctx.setLineDash([2 / SCALE * 2, 2 / SCALE * 2]);
  ctx.beginPath();
  for (const key of selection) {
    const [r0, c0] = key.split(',').map(Number);
    const r = r0 + dr, c = c0 + dc;
    const x = c * TILE, y = r * TILE;
    ctx.fillRect(x, y, TILE, TILE);
    if (!selection.has(`${r0 - 1},${c0}`)) { ctx.moveTo(x, y); ctx.lineTo(x + TILE, y); }
    if (!selection.has(`${r0 + 1},${c0}`)) { ctx.moveTo(x, y + TILE); ctx.lineTo(x + TILE, y + TILE); }
    if (!selection.has(`${r0},${c0 - 1}`)) { ctx.moveTo(x, y); ctx.lineTo(x, y + TILE); }
    if (!selection.has(`${r0},${c0 + 1}`)) { ctx.moveTo(x + TILE, y); ctx.lineTo(x + TILE, y + TILE); }
  }
  ctx.stroke();
  ctx.strokeStyle = '#000000';
  ctx.lineDashOffset = 2 / SCALE * 2;
  ctx.stroke();
  ctx.restore();
}

// ── Tile selections ───────────────────────────────────────────────────────────

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

/** Selected tiles in reading order: left to right, then down. */
export function orderedTiles(selection) {
  return [...selection].map(parseTileKey).sort((a, b) => a.r - b.r || a.c - b.c);
}

/** Text slots inside the selection, in the order typing fills them. */
export function selectionSlots(d, selection) {
  const perTile = d.mode === 'half' ? 2 : 1;
  const slots = [];
  for (const { r, c } of orderedTiles(selection)) {
    for (let i = 0; i < perTile; i++) slots.push({ r, s: c * perTile + i });
  }
  // Tiles are sorted by row then column, but a row's half-width slots must also
  // run left to right across tiles, which the sort above already guarantees.
  return slots;
}

function drawText(ctx, d) {
  const sw = slotWidth(d);
  ctx.fillStyle = d.fg;
  for (let r = 0; r < d.rows; r++) {
    const chars = rowChars(d, r);
    for (let s = 0; s < chars.length; s++) {
      const ch = chars[s];
      if (ch === ' ') continue;
      const x = s * sw;
      const y = r * TILE;
      if (d.glyphs[ch]) drawCustomGlyph(ctx, d.glyphs[ch], x, y, sw);
      else if (d.font === 'pixel' && pixelGlyph(ch)) drawPixelGlyph(ctx, pixelGlyph(ch), x, y, sw);
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
    for (let gx = 0; gx < 8; gx++) {
      if (bits & (0x80 >> gx)) ctx.fillRect(x + gx * px, y + gy * py, px, py);
    }
  }
}

function drawCustomGlyph(ctx, hex, x, y, sw) {
  const { w } = glyphSize(hex);
  const bits = bitsFromHex(hex, w);
  const px = sw / w;
  for (let gy = 0; gy < 16; gy++) {
    for (let gx = 0; gx < w; gx++) {
      if (bits[gy * w + gx]) ctx.fillRect(x + gx * px, y + gy, px, 1);
    }
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

/** Reduces a loaded photo to grid pixels, black where it does not reach. */
export function pixelatePhoto(img, d) {
  const W = d.cols * TILE;
  const H = d.rows * TILE;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const r = containRect(img.naturalWidth || img.width, img.naturalHeight || img.height, W, H, d.image?.scale ?? 1);
  ctx.drawImage(img, r.x, r.y, r.w, r.h);
  return c;
}
