// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { normaliseHex, hslToHex, paletteRows, HUES, SHADES, recentColours, rememberColour } from '../utils/colours.js';

describe('colour helpers', () => {
  it('accepts three or six digit hex, with or without #, in any case', () => {
    expect(normaliseHex('#ABC')).toBe('#aabbcc');
    expect(normaliseHex('ff3b30')).toBe('#ff3b30');
    expect(normaliseHex('  #00FF00 ')).toBe('#00ff00');
    for (const bad of ['', '#12', '#12345', '#ggg', 'red', null, 12]) expect(normaliseHex(bad)).toBeNull();
  });

  it('converts HSL to hex', () => {
    expect(hslToHex(0, 1, 0.5)).toBe('#ff0000');
    expect(hslToHex(120, 1, 0.5)).toBe('#00ff00');
    expect(hslToHex(240, 1, 0.5)).toBe('#0000ff');
    expect(hslToHex(0, 0, 1)).toBe('#ffffff');
    expect(hslToHex(0, 0, 0)).toBe('#000000');
  });

  it('lays the palette out as greys then one row per shade, white to black and a full hue wheel', () => {
    const rows = paletteRows();
    expect(rows).toHaveLength(1 + SHADES.length);
    expect(rows.every(r => r.length === HUES)).toBe(true);
    expect(rows[0][0]).toBe('#ffffff');
    expect(rows[0][HUES - 1]).toBe('#000000');
    expect(new Set(rows.flat()).size).toBe(rows.flat().length);
    expect(rows.flat().every(c => normaliseHex(c) === c)).toBe(true);
  });
});

describe('recent colours', () => {
  // Newer Node has a global localStorage that is undefined without a file: use a plain one.
  beforeEach(() => {
    const data = new Map();
    vi.stubGlobal('localStorage', {
      getItem: k => (data.has(k) ? data.get(k) : null),
      setItem: (k, v) => data.set(k, String(v)),
      clear: () => data.clear(),
    });
  });
  it('keeps the latest first, once each, at most eight', () => {
    for (const c of ['#111111', '#222222', '#111111']) rememberColour(c);
    expect(recentColours()).toEqual(['#111111', '#222222']);
    for (let i = 0; i < 12; i++) rememberColour(`#${String(i).padStart(2, '0')}0000`);
    expect(recentColours()).toHaveLength(8);
    rememberColour('nonsense');
    expect(recentColours()[0]).toBe('#110000');
  });
});
