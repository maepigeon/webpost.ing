import { describe, it, expect } from 'vitest';
import {
  normaliseGrid, defaultGrid, rowChars, setChar, convertMode, resizeText,
  containRect, bitsFromHex, hexFromBits, seedBits, slotsPerRow,
} from '../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/tileGrid.js';
import { pixelGlyph } from '../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/tileFont.js';

describe('tile grid data', () => {
  it('fills in defaults and clamps sizes', () => {
    const d = normaliseGrid({ cols: 999, rows: -3, mode: 'weird', font: 'smooth' });
    expect(d.cols).toBe(64);
    expect(d.rows).toBe(1);
    expect(d.mode).toBe('full');
    expect(d.font).toBe('smooth');
    expect(d.image).toBeNull();
  });

  it('has two slots per tile in double-char mode', () => {
    expect(slotsPerRow({ ...defaultGrid(), cols: 10, mode: 'full' })).toBe(10);
    expect(slotsPerRow({ ...defaultGrid(), cols: 10, mode: 'half' })).toBe(20);
  });

  it('writes a character into a slot and pads the row', () => {
    const d = { ...defaultGrid(), cols: 4 };
    const text = setChar(d, 1, 2, 'x');
    expect(text).toEqual(['', '  x']);
    expect(rowChars({ ...d, text }, 1)).toEqual([' ', ' ', 'x', ' ']);
  });

  it('keeps emoji as one character', () => {
    const d = { ...defaultGrid(), cols: 3, text: ['a🙂b'] };
    expect(rowChars(d, 0)).toEqual(['a', '🙂', 'b']);
  });

  it('keeps each tile in place when switching modes', () => {
    const full = { ...defaultGrid(), cols: 3, mode: 'full', text: ['abc'] };
    const half = convertMode(full, 'half');
    expect(half).toEqual(['a b c']);
    expect(convertMode({ ...full, mode: 'half', text: half }, 'full')).toEqual(['abc']);
  });

  it('cuts text when the grid shrinks', () => {
    const d = { ...defaultGrid(), cols: 5, text: ['hello', 'world', 'again'] };
    expect(resizeText(d, 3, 2)).toEqual(['hel', 'wor']);
  });
});

describe('photo placement', () => {
  it('letterboxes a wide photo in a square grid', () => {
    const r = containRect(200, 100, 100, 100);
    expect(r).toEqual({ x: 0, y: 25, w: 100, h: 50 });
  });

  it('pillarboxes a tall photo and honours scale', () => {
    const r = containRect(100, 200, 100, 100, 0.5);
    expect(r).toEqual({ x: 37.5, y: 25, w: 25, h: 50 });
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
    // The font's rows are doubled vertically to fill the 16-tall cell.
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
