import { normaliseGrid, pixelLayer } from '../PostRenderer/RichTextPost/TileGrid/tileGrid.js';
import { BANNER_COLS } from './bannerGrid.js';

/** An empty banner: two transparent layers. Layer ids are random, so build it once. */
export function emptyBanner() {
  return normaliseGrid({
    v: 3, cols: BANNER_COLS, rows: 4, layers: [pixelLayer('Background'), pixelLayer('Text')],
  });
}

/**
 * Where the banner editor starts. `base` is what Cancel and Undo go back to
 * (the saved rows, or an empty banner) and what "unsaved" is measured against;
 * `grid` is what the draft starts as: kept work from an earlier visit if there
 * is any, otherwise `base` itself.
 */
export function startBanner(saved, kept) {
  const base = saved || emptyBanner();
  if (kept?.data && typeof kept.data === 'object') {
    try { return { base, grid: normaliseGrid(kept.data), restored: true }; } catch { /* use the saved rows */ }
  }
  return { base, grid: base, restored: false };
}

/** Restored work is unsaved by definition; otherwise compare with where it started. */
export function bannerIsDirty({ draft, baseJson, restored, savedNow }) {
  if (savedNow) return false;
  return restored || JSON.stringify(draft) !== baseJson;
}
