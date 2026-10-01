/**
 * Wallpapers are tile grids.
 *
 * A wallpaper is a small grid (the tile), how it repeats, how big each grid
 * pixel is on screen, and the colour behind anything transparent:
 *
 *   { v: 3, tile: <grid>, tiling: 'brick', scale: 2, bg: '#eeede9' }
 *
 * Used for profile and post wallpapers, the site background, and the page and
 * card backgrounds of a theme. The server applies the same rules
 * (WallpaperValidator.java); this module also turns a wallpaper into CSS.
 */
import { useEffect, useState } from 'react';
import {
  TILE, normaliseGrid, pixelLayer, renderGrid, pixelatePhoto,
} from '../Pages/Posts/PostRenderer/RichTextPost/TileGrid/tileGrid.js';
import { TEXTURES } from '../Pages/Posts/PostRenderer/RichTextPost/TileGrid/textures.js';
import { IMAGES_BASE_URL } from '../../config.js';

/** Largest wallpaper tile, in grid tiles on a side. */
export const MAX_TILE_TILES = 8;

export const TILINGS = {
  repeat: 'Repeat',
  brick: 'Brick',
  'half-drop': 'Half-drop',
  mirror: 'Mirror',
  stretch: 'Stretch',
  center: 'Centre',
};

const HEX = /^#[0-9a-fA-F]{6}$/;

/** A wallpaper made only of known values, or null for none. */
export function sanitiseWallpaper(raw) {
  let w = raw;
  if (typeof w === 'string') {
    if (!w.trim()) return null;
    try { w = JSON.parse(w); } catch { return null; }
  }
  if (!w || typeof w !== 'object' || w.v !== 3) return null;
  const tile = normaliseGrid(w.tile);
  tile.cols = Math.min(tile.cols, MAX_TILE_TILES);
  tile.rows = Math.min(tile.rows, MAX_TILE_TILES);
  const scale = Number(w.scale);
  return {
    v: 3,
    tile,
    tiling: Object.hasOwn(TILINGS, w.tiling) ? w.tiling : 'repeat',
    scale: Number.isFinite(scale) ? Math.min(8, Math.max(1, scale)) : 2,
    bg: typeof w.bg === 'string' && HEX.test(w.bg) ? w.bg.toLowerCase() : '#eeede9',
  };
}

/** The stored form: a JSON string, or '' for none. */
export function serialiseWallpaper(w) {
  const clean = sanitiseWallpaper(w);
  return clean ? JSON.stringify(clean) : '';
}

// ── Making tiles ──────────────────────────────────────────────────────────────

function canvasOf(w, h) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c.getContext('2d') ? c : null;
}

/** A tile grid of one pixel layer filled with a texture from textures.js. */
export function textureTile(kind, cols = 4, rows = 4, options) {
  const c = canvasOf(cols * TILE, rows * TILE);
  if (c && TEXTURES[kind]) TEXTURES[kind].draw(c.getContext('2d'), c.width, c.height, options);
  return normaliseGrid({
    cols, rows,
    layers: [pixelLayer(TEXTURES[kind]?.label || 'Texture', { paint: c ? c.toDataURL('image/png') : null })],
  });
}

/** A wallpaper that tiles a texture; `options` are the texture's own (paw colours). */
export function textureWallpaper(kind, { cols = 4, rows = 4, tiling = 'repeat', scale = 2, bg = '#eeede9', options } = {}) {
  return { v: 3, tile: textureTile(kind, cols, rows, options), tiling, scale, bg };
}

/** A tile drawn by a function(ctx, width, height) — for stickers and one-off presets. */
export function drawnTile(cols, rows, draw, name = 'Drawing') {
  const c = canvasOf(cols * TILE, rows * TILE);
  if (c) draw(c.getContext('2d'), c.width, c.height);
  return normaliseGrid({ cols, rows, layers: [pixelLayer(name, { paint: c ? c.toDataURL('image/png') : null })] });
}

// ── Drawing a grid to an image ────────────────────────────────────────────────

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Draws a whole grid, all layers, into a new canvas at `scale` canvas pixels
 * per grid pixel. Resolves once every layer's pixels and photos have loaded.
 */
export async function renderGridImage(rawGrid, scale = 2) {
  const d = normaliseGrid(rawGrid);
  const canvas = canvasOf(d.cols * TILE * scale, d.rows * TILE * scale);
  if (!canvas) return null;
  const assets = {};
  await Promise.all(d.layers.map(async (l) => {
    try {
      if (l.kind === 'pixel' && l.paint) assets[l.id] = { paint: await loadImage(l.paint) };
      if (l.kind === 'photo') assets[l.id] = { photo: pixelatePhoto(await loadImage(IMAGES_BASE_URL + l.src), d, l) };
    } catch { /* a missing picture leaves that layer empty */ }
  }));
  if (document.fonts?.ready) await document.fonts.ready.catch(() => {});
  renderGrid(canvas.getContext('2d'), d, assets, { scale });
  return canvas;
}

/**
 * Lays a tile out as the repeating unit of a tiling. Brick offsets every
 * other row by half a tile, half-drop every other column, mirror flips the
 * tile into a 2×2 block; the others repeat the tile as it is.
 */
export function composeTiling(tile, tiling) {
  const w = tile.width, h = tile.height;
  if (tiling === 'brick') {
    const c = canvasOf(w, h * 2); const x = c.getContext('2d');
    x.drawImage(tile, 0, 0);
    x.drawImage(tile, -w / 2, h); x.drawImage(tile, w / 2, h);
    return c;
  }
  if (tiling === 'half-drop') {
    const c = canvasOf(w * 2, h); const x = c.getContext('2d');
    x.drawImage(tile, 0, 0);
    x.drawImage(tile, w, -h / 2); x.drawImage(tile, w, h / 2);
    return c;
  }
  if (tiling === 'mirror') {
    const c = canvasOf(w * 2, h * 2); const x = c.getContext('2d');
    x.drawImage(tile, 0, 0);
    x.save(); x.translate(w * 2, 0); x.scale(-1, 1); x.drawImage(tile, 0, 0); x.restore();
    x.save(); x.translate(0, h * 2); x.scale(1, -1); x.drawImage(tile, 0, 0); x.restore();
    x.save(); x.translate(w * 2, h * 2); x.scale(-1, -1); x.drawImage(tile, 0, 0); x.restore();
    return c;
  }
  return tile;
}

const cache = new Map();

/**
 * CSS for a wallpaper: background colour, image, size, repeat and position.
 * Resolves to {} for none. Cached, so the same wallpaper is drawn once.
 *
 * The tile is drawn at its on-screen size times the screen's pixel density,
 * so it is shown 1:1 and stays crisp without `image-rendering` — which would
 * be inherited by every image on the page if set on <body>.
 */
export function wallpaperStyle(raw) {
  const w = sanitiseWallpaper(raw);
  if (!w) return Promise.resolve({});
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const renderScale = Math.max(1, Math.min(12, Math.round(w.scale * dpr)));
  const key = `${renderScale}|${JSON.stringify(w)}`;
  if (cache.has(key)) return cache.get(key);
  const job = (async () => {
    const tile = await renderGridImage(w.tile, renderScale);
    if (!tile) return { backgroundColor: w.bg };
    const unit = composeTiling(tile, w.tiling);
    const cssW = (unit.width / renderScale) * w.scale;
    const cssH = (unit.height / renderScale) * w.scale;
    const base = { backgroundColor: w.bg, backgroundImage: `url(${unit.toDataURL('image/png')})` };
    if (w.tiling === 'stretch') return { ...base, backgroundSize: 'cover', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' };
    if (w.tiling === 'center') return { ...base, backgroundSize: `${cssW}px ${cssH}px`, backgroundRepeat: 'no-repeat', backgroundPosition: 'center' };
    return { ...base, backgroundSize: `${cssW}px ${cssH}px`, backgroundRepeat: 'repeat', backgroundPosition: '0 0' };
  })();
  cache.set(key, job);
  if (cache.size > 40) cache.delete(cache.keys().next().value);
  return job;
}

/** The CSS for a wallpaper, once it has been drawn; {} until then. */
export function useWallpaperStyle(raw) {
  const key = typeof raw === 'string' ? raw : JSON.stringify(raw ?? null);
  const [style, setStyle] = useState({});
  useEffect(() => {
    let live = true;
    wallpaperStyle(raw).then(s => { if (live) setStyle(s); }).catch(() => { if (live) setStyle({}); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return style;
}

/**
 * Puts a wallpaper on <body> while the calling page is mounted — a profile, a
 * post, a discussion — and takes it off again after.
 */
export function useBodyWallpaper(raw) {
  const style = useWallpaperStyle(raw);
  useEffect(() => {
    const b = document.body.style;
    b.backgroundColor = style.backgroundColor || '';
    b.backgroundImage = style.backgroundImage || '';
    b.backgroundSize = style.backgroundSize || '';
    b.backgroundRepeat = style.backgroundRepeat || '';
    b.backgroundPosition = style.backgroundPosition || '';
    return () => {
      b.backgroundColor = ''; b.backgroundImage = ''; b.backgroundSize = '';
      b.backgroundRepeat = ''; b.backgroundPosition = '';
    };
  }, [style]);
}
