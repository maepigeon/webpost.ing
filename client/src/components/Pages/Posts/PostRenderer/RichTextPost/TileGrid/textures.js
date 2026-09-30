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
    // Pawprints scattered on black, each one solid and a random colour. One
    // paw per 16-pixel cell, nudged about and sometimes left out, so the
    // spacing looks loose; cells never overlap, so the tile repeats cleanly.
    draw(ctx, w, h) {
      const r = rng(23);
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w, h);
      let last = -1;
      for (let y = 0; y + 16 <= h; y += 16) {
        for (let x = 0; x + 16 <= w; x += 16) {
          if (r() < 0.55) continue;
          let c = Math.floor(r() * RAINBOW.length);
          if (c === last) c = (c + 1) % RAINBOW.length;
          last = c;
          ctx.fillStyle = RAINBOW[c];
          const ox = x + 1 + Math.floor(r() * 6), oy = y + 1 + Math.floor(r() * 7);
          PAW.forEach((line, dy) => [...line].forEach((ch, dx) => { if (ch === 'X') ctx.fillRect(ox + dx, oy + dy, 1, 1); }));
        }
      }
    },
  },
};

/**
 * Fills the given tiles of a paint canvas with a texture. The texture is drawn
 * once across the whole grid and clipped to the tiles, so neighbouring fills
 * line up.
 */
export function fillTexture(paintCanvas, kind, tiles, tileSize) {
  const tex = TEXTURES[kind];
  if (!tex) return;
  const w = paintCanvas.width, h = paintCanvas.height;
  const full = document.createElement('canvas');
  full.width = w;
  full.height = h;
  tex.draw(full.getContext('2d'), w, h);
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
export function texturePreview(kind, size = 32) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  TEXTURES[kind].draw(c.getContext('2d'), size, size);
  return c.toDataURL('image/png');
}
