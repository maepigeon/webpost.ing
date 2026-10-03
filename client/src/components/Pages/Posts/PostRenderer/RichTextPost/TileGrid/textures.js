/**
 * Pixel textures: the site's looks — cork, notebook paper, newsprint and the
 * rest — drawn as real pixels into a grid layer, where they can be edited like
 * anything else. They used to be CSS; now a theme is built from grids, and
 * these are the starting points.
 *
 * Every texture is deterministic (a seeded generator), so the same fill always
 * produces the same pixels and a preset looks identical everywhere.
 */

/** A small seeded random generator (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const px = (ctx, x, y, colour) => { ctx.fillStyle = colour; ctx.fillRect(x, y, 1, 1); };

/**
 * Cheap value noise on a coarse lattice, for blotches bigger than one pixel.
 * The lattice wraps at the canvas edges, so the texture tiles without seams.
 */
function blotches(w, h, cell, seed) {
  const r = rng(seed);
  const gw = Math.max(1, Math.round(w / cell)), gh = Math.max(1, Math.round(h / cell));
  const cw = w / gw, ch = h / gh;
  const g = Array.from({ length: gw * gh }, () => r());
  const at = (i, j) => g[((j % gh) + gh) % gh * gw + ((i % gw) + gw) % gw];
  return (x, y) => {
    const gx = x / cw, gy = y / ch;
    const x0 = Math.floor(gx), y0 = Math.floor(gy), tx = gx - x0, ty = gy - y0;
    const a = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
    const b = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
    return a * (1 - ty) + b * ty;
  };
}

const RAINBOW = ['#ff5e8a', '#ffa45c', '#f5d547', '#6ee29c', '#5ec8ff', '#a98bff'];
// Four toe beans over a heart-shaped pad.
const PAW = [
  '..XX.XX..',
  '..XX.XX..',
  'XX.....XX',
  'XX.XXX.XX',
  '..XXXXX..',
  '.XXXXXXX.',
  '.XXXXXXX.',
  '..XX.XX..',
];

// ── Paws ──────────────────────────────────────────────────────────────────────

/** One paw per cell of this many pixels. */
const PAW_CELL = 16;

/** How the paws are coloured. */
export const PAW_COLOURINGS = {
  random: 'Random colours',
  single: 'One colour',
  rainbow: 'Rainbow, downwards',
  gradient: 'My gradient',
};
export const DEFAULT_PAW_OPTIONS = { colouring: 'random', colour: '#ff5e8a', stops: ['#ff5e8a', '#f5d547', '#5ec8ff'] };
export const MAX_PAW_STOPS = 6;

/**
 * Where the paws go: one per 16-pixel cell, every cell filled, each row half
 * a cell along from the one above, like a walking trail. It used to be one
 * paw per cell with about half the cells skipped and every paw nudged at
 * random, which read as scattered.
 *
 * Rows only stagger when there is an even number of them, so the tile still
 * repeats without a seam.
 */
export function pawLayout(w, h) {
  const cols = Math.max(1, Math.floor(w / PAW_CELL));
  const rows = Math.max(1, Math.floor(h / PAW_CELL));
  const stagger = rows % 2 === 0;
  const paws = [];
  for (let row = 0; row < rows; row++) {
    const shift = stagger && row % 2 ? PAW_CELL / 2 : 0;
    for (let col = 0; col < cols; col++) {
      paws.push({ row, col, x: col * PAW_CELL + shift + 3, y: row * PAW_CELL + 4 });
    }
  }
  return { rows, cols, paws };
}

const hex = (n) => n.toString(16).padStart(2, '0');
const toRgb = (c) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, t) => {
  const [x, y] = [toRgb(a), toRgb(b)];
  return '#' + x.map((v, i) => hex(Math.round(v + (y[i] - v) * t))).join('');
};
const isColour = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

/** HSL to #rrggbb, for the rainbow. */
function hsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return '#' + [f(0), f(8), f(4)].map(hex).join('');
}

/**
 * The colour of every paw, as colours[row][col].
 *
 *   random   — a different colour from the paw before, the same every time
 *   single   — options.colour
 *   rainbow  — one hue per row, red at the top through violet, back to red
 *   gradient — options.stops, top to bottom and back to the first
 *
 * The rainbow and gradient come back round to where they started, so the
 * repeating tile meets itself without a jump.
 */
export function pawColours(options, rows, cols) {
  const o = { ...DEFAULT_PAW_OPTIONS, ...(options || {}) };
  const grid = Array.from({ length: rows }, () => new Array(cols));
  if (o.colouring === 'single') {
    const c = isColour(o.colour) ? o.colour : DEFAULT_PAW_OPTIONS.colour;
    for (const line of grid) line.fill(c);
    return grid;
  }
  if (o.colouring === 'rainbow') {
    grid.forEach((line, row) => line.fill(hsl((row / rows) * 360, 0.9, 0.65)));
    return grid;
  }
  if (o.colouring === 'gradient') {
    const stops = (Array.isArray(o.stops) ? o.stops : []).filter(isColour).slice(0, MAX_PAW_STOPS);
    const ring = stops.length ? [...stops, stops[0]] : [DEFAULT_PAW_OPTIONS.colour, DEFAULT_PAW_OPTIONS.colour];
    grid.forEach((line, row) => {
      const t = (row / rows) * (ring.length - 1);
      const i = Math.min(Math.floor(t), ring.length - 2);
      line.fill(mix(ring[i], ring[i + 1], t - i));
    });
    return grid;
  }
  const r = rng(23);
  let last = -1;
  for (const line of grid) {
    for (let col = 0; col < cols; col++) {
      let c = Math.floor(r() * RAINBOW.length);
      if (c === last) c = (c + 1) % RAINBOW.length;
      last = c;
      line[col] = RAINBOW[c];
    }
  }
  return grid;
}

export const TEXTURES = {
  cork: {
    label: 'Cork',
    draw(ctx, w, h) {
      const r = rng(7);
      const big = blotches(w, h, 9, 11);
      const shades = ['#8f6232', '#a8763f', '#b8834a', '#c79560', '#d9ae78'];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const v = big(x, y) * 0.55 + r() * 0.45;
          px(ctx, x, y, shades[Math.min(4, Math.floor(v * 5))]);
          if (r() < 0.035) px(ctx, x, y, r() < 0.5 ? '#5a3a1a' : '#e8c592');
        }
      }
    },
  },
  newsprint: {
    label: 'Newsprint',
    draw(ctx, w, h) {
      const r = rng(3);
      ctx.fillStyle = '#eeede9';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const v = r();
        if (v < 0.07) px(ctx, x, y, '#e2e0da');
        else if (v < 0.085) px(ctx, x, y, '#cfcdc6');
      }
    },
  },
  halftone: {
    label: 'Halftone',
    // A printed photo up close: rows of ink dots on warm newsprint, every other row shifted.
    draw(ctx, w, h) {
      ctx.fillStyle = '#e6e2d6';
      ctx.fillRect(0, 0, w, h);
      const r = rng(5);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (r() < 0.05) px(ctx, x, y, '#ddd8ca');
      const big = blotches(w, h, 16, 31);
      for (let y = 2, row = 0; y < h; y += 4, row++) {
        for (let x = row % 2 ? 2 : 0; x < w; x += 4) {
          const v = big(x, y);
          px(ctx, x, y, v > 0.62 ? '#a8a294' : v > 0.4 ? '#c2bdae' : '#d3cebf');
          if (v > 0.72) px(ctx, (x + 1) % w, y, '#b9b4a5');
        }
      }
    },
  },
  wood: {
    label: 'Wood',
    // A desk top: long grain lines that wander a little, darker streaks, the odd knot of shadow.
    draw(ctx, w, h) {
      const shades = ['#6f4a2a', '#7d5631', '#8a6138', '#966b40', '#a27649'];
      const band = blotches(w, h, 6, 17);
      const drift = blotches(w, h, 24, 29);
      const r = rng(11);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          // Stretched along x, so the noise reads as grain running left to right.
          const v = band(x / 6, y + drift(x, y) * 5) * 0.75 + r() * 0.25;
          px(ctx, x, y, shades[Math.min(4, Math.floor(v * 5))]);
        }
      }
      ctx.fillStyle = 'rgba(60, 36, 16, 0.35)';
      for (let y = 7; y < h; y += 16) ctx.fillRect(0, y, w, 1);   // the gaps between boards
    },
  },
  mat: {
    label: 'Cutting mat',
    // The green mat on a craft table: a fine grid, heavier every fourth line.
    draw(ctx, w, h) {
      ctx.fillStyle = '#2c6e5d';
      ctx.fillRect(0, 0, w, h);
      const r = rng(13);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (r() < 0.06) px(ctx, x, y, '#2a6857');
      ctx.fillStyle = '#3b8370';
      for (let x = 0; x < w; x += 4) ctx.fillRect(x, 0, 1, h);
      for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
      ctx.fillStyle = '#62a892';
      for (let x = 0; x < w; x += 16) ctx.fillRect(x, 0, 1, h);
      for (let y = 0; y < h; y += 16) ctx.fillRect(0, y, w, 1);
    },
  },
  night: {
    label: 'Night grid',
    // Deep blue with a faint grid, bright where the lines cross, and a few stars between.
    draw(ctx, w, h) {
      ctx.fillStyle = '#070b1c';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#131c44';
      for (let x = 0; x < w; x += 16) ctx.fillRect(x, 0, 1, h);
      for (let y = 0; y < h; y += 16) ctx.fillRect(0, y, w, 1);
      for (let x = 0; x < w; x += 16) for (let y = 0; y < h; y += 16) px(ctx, x, y, '#4de3ff');
      const r = rng(41);
      for (let i = 0; i < (w * h) / 220; i++) {
        const x = Math.floor(r() * w), y = Math.floor(r() * h);
        if (x % 16 && y % 16) px(ctx, x, y, r() < 0.3 ? '#ff5ecf' : '#2b3a7a');
      }
    },
  },
  notebook: {
    label: 'Notebook',
    draw(ctx, w, h) {
      ctx.fillStyle = '#fffef6';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#9ab8d8';
      for (let y = 15; y < h; y += 16) ctx.fillRect(0, y, w, 1);
      ctx.fillStyle = '#e07a74';
      if (w > 24) ctx.fillRect(12, 0, 1, h);
    },
  },
  graph: {
    label: 'Graph paper',
    draw(ctx, w, h) {
      ctx.fillStyle = '#fbfbf7';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#dde6ef';
      for (let x = 0; x < w; x += 4) ctx.fillRect(x, 0, 1, h);
      for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
      ctx.fillStyle = '#a9bfd4';
      for (let x = 0; x < w; x += 16) ctx.fillRect(x, 0, 1, h);
      for (let y = 0; y < h; y += 16) ctx.fillRect(0, y, w, 1);
    },
  },
  dots: {
    label: 'Dot grid',
    draw(ctx, w, h) {
      ctx.fillStyle = '#f7f7f2';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#b9c3cf';
      for (let y = 4; y < h; y += 8) for (let x = 4; x < w; x += 8) ctx.fillRect(x, y, 1, 1);
    },
  },
  sticky: {
    label: 'Sticky note',
    draw(ctx, w, h) {
      ctx.fillStyle = '#fff27a';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f7e45c';
      ctx.fillRect(0, h - 3, w, 3);
      ctx.fillStyle = '#fff8a8';
      ctx.fillRect(0, 0, w, 1);
    },
  },
  scanlines: {
    label: 'CRT',
    draw(ctx, w, h) {
      ctx.fillStyle = '#04060a';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#0a1a10';
      for (let y = 0; y < h; y += 2) ctx.fillRect(0, y, w, 1);
    },
  },
  neon: {
    label: 'Neon grid',
    draw(ctx, w, h) {
      ctx.fillStyle = '#04060a';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#0f3d14';
      for (let x = 0; x < w; x += 16) ctx.fillRect(x, 0, 1, h);
      for (let y = 0; y < h; y += 16) ctx.fillRect(0, y, w, 1);
      ctx.fillStyle = '#39ff14';
      for (let x = 0; x < w; x += 16) for (let y = 0; y < h; y += 16) ctx.fillRect(x, y, 1, 1);
    },
  },
  paws: {
    label: 'Paws',
    // Pawprints on black in an even, staggered pattern; see pawLayout and
    // pawColours for the colouring options.
    // options.background: the colour behind the paws, or null to leave it
    // transparent, so a wallpaper's own "Behind" colour shows.
    draw(ctx, w, h, options) {
      const background = options?.background === undefined ? '#000000' : options.background;
      if (background) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, w, h);
      }
      const layout = pawLayout(w, h);
      const colours = pawColours(options, layout.rows, layout.cols);
      for (const { row, col, x, y } of layout.paws) {
        ctx.fillStyle = colours[row][col];
        PAW.forEach((line, dy) => [...line].forEach((ch, dx) => {
          // Wrapped at the right edge, so a shifted row still tiles seamlessly.
          if (ch === 'X') ctx.fillRect((x + dx) % w, y + dy, 1, 1);
        }));
      }
    },
  },
};

/**
 * Fills the given tiles of a paint canvas with a texture. The texture is drawn
 * once across the whole grid and clipped to the tiles, so neighbouring fills
 * line up.
 */
export function fillTexture(paintCanvas, kind, tiles, tileSize, options) {
  const tex = TEXTURES[kind];
  if (!tex) return;
  const w = paintCanvas.width, h = paintCanvas.height;
  const full = document.createElement('canvas');
  full.width = w;
  full.height = h;
  tex.draw(full.getContext('2d'), w, h, options);
  const ctx = paintCanvas.getContext('2d');
  ctx.save();
  ctx.beginPath();
  for (const { r, c } of tiles) ctx.rect(c * tileSize, r * tileSize, tileSize, tileSize);
  ctx.clip();
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(full, 0, 0);
  ctx.restore();
}

/** A small preview of a texture, for its button. */
export function texturePreview(kind, size = 32, options) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  TEXTURES[kind].draw(c.getContext('2d'), size, size, options);
  return c.toDataURL('image/png');
}
