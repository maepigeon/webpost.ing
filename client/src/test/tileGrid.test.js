import { describe, it, expect } from 'vitest';
import {
  normaliseGrid, pixelLayer, rowChars, writeSlot, restyleSlots, convertLayerMode, resizeLayerText,
  orderSlots, slotsIn, containRect, bitsFromHex, hexFromBits, seedBits, slotsPerRow, LIMITS,
  photoRect, resizePhoto, zoomPhoto, PHOTO_SCALE,
} from '../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/tileGrid.js';
import { pixelGlyph } from '../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/tileFont.js';

const grid = (extra = {}) => normaliseGrid({ cols: 4, rows: 3, layers: [pixelLayer('A')], ...extra });

describe('grid data', () => {
  it('fills in defaults and clamps sizes', () => {
    const d = normaliseGrid({ cols: 999, rows: -3, mode: 'weird' });
    expect(d.cols).toBe(64);
    expect(d.rows).toBe(1);
    expect(d.mode).toBe('full');
    expect(d.layers).toHaveLength(1);
  });

  it('keeps between one and ten layers', () => {
    const many = Array.from({ length: 14 }, (_, i) => pixelLayer(`L${i}`));
    expect(normaliseGrid({ layers: many }).layers).toHaveLength(LIMITS.maxLayers);
    expect(normaliseGrid({ layers: [] }).layers).toHaveLength(1);
  });

  it('refuses photos that are not the app\'s own uploads, and paint that is not PNG', () => {
    const d = normaliseGrid({
      layers: [
        { kind: 'photo', src: 'https://tracker.example/pixel.gif' },
        { kind: 'photo', src: '/uploads/ok.png' },
        { kind: 'pixel', paint: 'javascript:alert(1)' },
      ],
    });
    expect(d.layers.map(l => l.kind)).toEqual(['photo', 'pixel']);
    expect(d.layers[1].paint).toBeNull();
  });

  it('drops malformed character styles', () => {
    const d = normaliseGrid({ layers: [{ kind: 'pixel', style: { '0,0': { font: 'smooth', color: 'red;x' }, bad: { font: 'pixel' } } }] });
    expect(d.layers[0].style).toEqual({ '0,0': { font: 'smooth' } });
  });

  it('has two slots per tile in double-char mode', () => {
    expect(slotsPerRow(grid({ mode: 'full' }))).toBe(4);
    expect(slotsPerRow(grid({ mode: 'half' }))).toBe(8);
  });
});

describe('text on a layer', () => {
  it('writes a character with its own style', () => {
    const d = grid();
    const l = writeSlot(d, d.layers[0], 1, 2, 'x', { font: 'smooth', color: '#ff0000' });
    expect(l.text).toEqual(['', '  x']);
    expect(l.style['1,2']).toEqual({ font: 'smooth', color: '#ff0000' });
    expect(rowChars(d, l, 1)).toEqual([' ', ' ', 'x', ' ']);
  });

  it('clears a slot and its style with a space', () => {
    const d = grid();
    let l = writeSlot(d, d.layers[0], 0, 0, 'a', { font: 'smooth' });
    l = writeSlot(d, l, 0, 0, ' ');
    expect(l.style['0,0']).toBeUndefined();
  });

  it('restyles only the given slots, so one grid can mix fonts', () => {
    const d = grid();
    let l = writeSlot(d, d.layers[0], 0, 0, 'a', { font: 'pixel' });
    l = writeSlot(d, l, 0, 1, 'b', { font: 'pixel' });
    l = restyleSlots(l, [{ r: 0, s: 1 }], { font: 'smooth' });
    expect(l.style['0,0'].font).toBe('pixel');
    expect(l.style['0,1'].font).toBe('smooth');
  });

  it('keeps each tile in place when switching modes', () => {
    const d = grid({ cols: 3 });
    const l = { ...d.layers[0], text: ['abc'], style: { '0,1': { font: 'smooth' } } };
    const half = convertLayerMode(d, l, 'half');
    expect(half.text).toEqual(['a b c']);
    expect(half.style['0,2']).toEqual({ font: 'smooth' });
  });

  it('cuts text and styles when the grid shrinks', () => {
    const d = grid({ cols: 5 });
    const l = { ...d.layers[0], text: ['hello', 'world', 'again'], style: { '2,0': { font: 'smooth' } } };
    const small = resizeLayerText(d, l, 3, 2);
    expect(small.text).toEqual(['hel', 'wor']);
    expect(small.style).toEqual({});
  });
});

describe('typing direction', () => {
  const d = normaliseGrid({ cols: 3, rows: 2 });
  const all = slotsIn(d, null);
  const seq = (dir) => orderSlots(all, dir).map(({ r, s }) => `${r}${s}`).join(' ');

  it('goes left to right, then down', () => expect(seq('right')).toBe('00 01 02 10 11 12'));
  it('goes right to left, then down', () => expect(seq('left')).toBe('02 01 00 12 11 10'));
  it('goes top to bottom, then right', () => expect(seq('down')).toBe('00 10 01 11 02 12'));
  it('goes bottom to top, then right', () => expect(seq('up')).toBe('10 00 11 01 12 02'));
  it('runs along diagonals', () => {
    const order = orderSlots(all, 'down-right');
    for (let i = 1; i < order.length; i++) {
      const [a, b] = [order[i - 1], order[i]];
      if (a.s - a.r === b.s - b.r) expect(b.r - a.r).toBe(1);
    }
  });
});

describe('photo placement', () => {
  it('letterboxes a wide photo in a square grid', () => {
    expect(containRect(200, 100, 100, 100)).toEqual({ x: 0, y: 25, w: 100, h: 50 });
  });
  it('honours scale and offset', () => {
    expect(containRect(100, 200, 100, 100, 0.5, 10, -5)).toEqual({ x: 47.5, y: 20, w: 25, h: 50 });
  });
});

describe('custom glyph bitmaps', () => {
  it('round-trips half and full width', () => {
    for (const w of [8, 16]) {
      const bits = Array.from({ length: w * 16 }, (_, i) => (i * 7) % 3 === 0);
      const hex = hexFromBits(bits, w);
      expect(hex).toHaveLength(w === 8 ? 32 : 64);
      expect(bitsFromHex(hex, w)).toEqual(bits);
    }
  });

  it('seeds a new glyph from the pixel font', () => {
    const bits = seedBits('A', 8);
    expect(bits.some(Boolean)).toBe(true);
    expect(bits.slice(0, 8)).toEqual(bits.slice(8, 16));
  });
});

describe('pixel font', () => {
  it('covers printable ASCII and nothing else', () => {
    expect(pixelGlyph('A')).toHaveLength(8);
    expect(pixelGlyph(' ').every(b => b === 0)).toBe(true);
    expect(pixelGlyph('~').some(Boolean)).toBe(true);
    expect(pixelGlyph('é')).toBeNull();
  });
});

describe('resizing a photo layer by its corners', () => {
  // A 10×4 grid is 160×64 grid pixels; a 200×100 photo fits it at 128×64.
  const d = { cols: 10, rows: 4 };
  const natural = { w: 200, h: 100 };
  const photo = (extra = {}) => ({ kind: 'photo', scale: 1, x: 0, y: 0, ...extra });
  const near = (a, b) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1);

  it('keeps the opposite corner where it was', () => {
    const before = photoRect(photo(), natural, d);
    const next = resizePhoto(photo(), natural, d, 'se', { x: before.x + 64, y: before.y + 32 });
    const after = photoRect(photo(next), natural, d);
    near(after.x, before.x); near(after.y, before.y);
    near(after.w, 64); near(after.h, 32);
    expect(next.scale).toBeCloseTo(0.5, 2);

    const grown = resizePhoto(photo(), natural, d, 'nw', { x: before.x - 64, y: before.y });
    const big = photoRect(photo(grown), natural, d);
    near(big.x + big.w, before.x + before.w); near(big.y + big.h, before.y + before.h);
    near(big.w, 192);
  });

  it('keeps the proportions, following whichever way the pointer went further', () => {
    const before = photoRect(photo(), natural, d);
    const next = resizePhoto(photo(), natural, d, 'se', { x: before.x + 10, y: before.y + 50 });
    const after = photoRect(photo(next), natural, d);
    near(after.w / after.h, 2);
    near(after.h, 50);
  });

  it('stays within the scale limits', () => {
    const r = photoRect(photo(), natural, d);
    expect(resizePhoto(photo(), natural, d, 'se', { x: r.x - 500, y: r.y - 500 }).scale).toBe(PHOTO_SCALE.min);
    expect(resizePhoto(photo(), natural, d, 'se', { x: r.x + 99999, y: r.y }).scale).toBe(PHOTO_SCALE.max);
    expect(zoomPhoto(photo({ scale: 7.9 }), 1.25).scale).toBe(PHOTO_SCALE.max);
    expect(zoomPhoto(photo(), 0.8).scale).toBeCloseTo(0.8);
  });
});

describe('edges (antialiasing)', () => {
  it('keeps smooth or pixel, and leaves the setting out otherwise', () => {
    expect(normaliseGrid({ edges: 'smooth' }).edges).toBe('smooth');
    expect(normaliseGrid({ edges: 'pixel' }).edges).toBe('pixel');
    expect('edges' in normaliseGrid({ edges: 'blurry' })).toBe(false);
    expect('edges' in normaliseGrid({})).toBe(false);
  });
});
