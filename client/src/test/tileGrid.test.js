import { describe, it, expect } from 'vitest';
import {
  normaliseGrid, pixelLayer, rowChars, writeSlot, writeChar, setTileWidths, isWide, restyleSlots, resizeLayerText,
  orderSlots, slotsIn, containRect, bitsFromHex, hexFromBits, seedBits, slotsPerRow, LIMITS,
  photoRect, resizePhoto, zoomPhoto, PHOTO_SCALE, cleanHref, isExternalHref, setLink, linkAt, linkTiles, cleanExt, GRID_VERSION, mergeText, writeXl, xlTiles, variantRows, FONT_NAMES, TYPEFACES, readableText, floodTiles, isElbow, linePixels, rectPixels, ellipsePixels, floodPixels, lassoTiles, takeText } from '../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/tileGrid.js';
import { pixelGlyph } from '../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/tileFont.js';
import { bitmapGlyph, SYMBOL_CHARS } from '../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/bitmapFonts.js';

const grid = (extra = {}) => normaliseGrid({ v: 3, cols: 4, rows: 3, layers: [pixelLayer('A')], ...extra });

describe('grid data', () => {
  it('fills in defaults and clamps sizes', () => {
    const d = normaliseGrid({ cols: 999, rows: -3, mode: 'weird' });
    expect(d.cols).toBe(64);
    expect(d.rows).toBe(1);
    expect(d.v).toBe(3);
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

  it('has two slots per tile, whatever widths its tiles have', () => {
    expect(slotsPerRow(grid())).toBe(8);
  });

  it('upgrades an old full-width grid so each character keeps its tile, wide', () => {
    const old = normaliseGrid({ v: 2, mode: 'full', cols: 3, rows: 1, layers: [{ id: 'a', kind: 'pixel', text: ['a c'], style: { '0,2': { font: 'smooth' } } }] });
    const l = old.layers[0];
    expect(rowChars(old, l, 0)).toEqual(['a', ' ', ' ', ' ', 'c', ' ']);
    expect(l.wide.sort()).toEqual(['0,0', '0,2']);
    expect(l.style).toEqual({ '0,4': { font: 'smooth' } });
  });

  it('keeps an old half-width grid as it was, and a grid without a version counts as old', () => {
    const half = normaliseGrid({ v: 2, mode: 'half', cols: 2, rows: 1, layers: [{ id: 'a', kind: 'pixel', text: ['abcd'] }] });
    expect(half.layers[0].text).toEqual(['abcd']);
    expect(half.layers[0].wide).toEqual([]);
    const unversioned = normaliseGrid({ cols: 2, rows: 1, layers: [{ id: 'a', kind: 'pixel', text: ['ab'] }] });
    expect(unversioned.layers[0].text).toEqual(['a b']);
  });

  it('drops wide tiles outside the grid or malformed', () => {
    const d = normaliseGrid({ v: 3, cols: 2, rows: 1, layers: [{ id: 'a', kind: 'pixel', wide: ['0,1', '0,5', '3,0', 'x', 7] }] });
    expect(d.layers[0].wide).toEqual(['0,1']);
  });
});

describe('text on a layer', () => {
  it('writes a character with its own style', () => {
    const d = grid();
    const l = writeSlot(d, d.layers[0], 1, 2, 'x', { font: 'smooth', color: '#ff0000' });
    expect(l.text).toEqual(['', '  x']);
    expect(l.style['1,2']).toEqual({ font: 'smooth', color: '#ff0000' });
    expect(rowChars(d, l, 1)).toEqual([' ', ' ', 'x', ' ', ' ', ' ', ' ', ' ']);
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

  it('types full and half width side by side, each tile its own width', () => {
    const d = grid({ cols: 3 });
    let l = writeChar(d, d.layers[0], 0, 0, 'W', null, 'full');
    l = writeChar(d, l, 0, 2, 'a', null, 'half');
    l = writeChar(d, l, 0, 3, 'b', null, 'half');
    expect(rowChars(d, l, 0).join('')).toBe('W ab  ');
    expect(isWide(l, 0, 0)).toBe(true);
    expect(isWide(l, 0, 1)).toBe(false);
    // Full width snaps to the tile's first half and clears the second.
    l = writeChar(d, l, 0, 3, 'X', null, 'full');
    expect(rowChars(d, l, 0).join('')).toBe('W X   ');
    expect(isWide(l, 0, 1)).toBe(true);
  });

  it('makes a wide tile narrow when typed into at half width, and clears it with a space', () => {
    const d = grid();
    let l = writeChar(d, d.layers[0], 0, 0, 'W', null, 'full');
    l = writeChar(d, l, 0, 1, 'z', null, 'half');
    expect(isWide(l, 0, 0)).toBe(false);
    expect(rowChars(d, l, 0).slice(0, 2)).toEqual(['W', 'z']);
    l = writeChar(d, writeChar(d, l, 0, 0, 'Q', null, 'full'), 0, 0, ' ', null, 'full');
    expect(isWide(l, 0, 0)).toBe(false);
    expect(rowChars(d, l, 0).slice(0, 2)).toEqual([' ', ' ']);
  });

  it('changes only the chosen tiles\' widths, keeping their first character', () => {
    const d = grid();
    let l = { ...d.layers[0], text: ['ab cdef'], style: { '0,3': { color: '#ff0000' } } };
    l = setTileWidths(d, l, [{ r: 0, c: 0 }, { r: 0, c: 1 }], 'full');
    expect(rowChars(d, l, 0).join('')).toBe('a c def ');
    expect(l.style['0,2']).toEqual({ color: '#ff0000' });
    expect(l.wide.sort()).toEqual(['0,0', '0,1']);
    l = setTileWidths(d, l, [{ r: 0, c: 1 }], 'half');
    expect(l.wide).toEqual(['0,0']);
    expect(rowChars(d, l, 0).join('')).toBe('a c def ');
  });

  it('cuts text and styles when the grid shrinks', () => {
    const d = grid({ cols: 5 });
    const l = { ...d.layers[0], text: ['hello', 'world', 'again'], style: { '2,0': { font: 'smooth' } } };
    const small = resizeLayerText(d, { ...l, wide: ['0,1', '0,4'] }, 2, 2);
    expect(small.text).toEqual(['hell', 'worl']);
    expect(small.style).toEqual({});
    expect(small.wide).toEqual(['0,1']);
  });
});

describe('typing direction', () => {
  // Full width: one slot per tile (the first), visited a tile at a time.
  const d = normaliseGrid({ v: 3, cols: 3, rows: 2 });
  const all = slotsIn(d, null, 'full');
  const seq = (dir) => orderSlots(all, dir, 2).map(({ r, s }) => `${r}${s / 2}`).join(' ');

  it('goes left to right, then down', () => expect(seq('right')).toBe('00 01 02 10 11 12'));
  it('goes right to left, then down', () => expect(seq('left')).toBe('02 01 00 12 11 10'));
  it('goes top to bottom, then right', () => expect(seq('down')).toBe('00 10 01 11 02 12'));
  it('goes bottom to top, then right', () => expect(seq('up')).toBe('10 00 11 01 12 02'));
  it('visits both halves of each tile at half width', () => {
    const half = orderSlots(slotsIn(d, null, 'half'), 'right').map(({ r, s }) => `${r}${s}`).join(' ');
    expect(half).toBe('00 01 02 03 04 05 10 11 12 13 14 15');
  });
  it('runs along diagonals', () => {
    const order = orderSlots(slotsIn(d, null, 'half'), 'down-right');
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

describe('links on tiles', () => {
  it('takes web addresses and site paths, and nothing that runs', () => {
    expect(cleanHref('https://example.com/x')).toBe('https://example.com/x');
    expect(cleanHref('/mae/post')).toBe('/mae/post');
    expect(cleanHref('example.com')).toBe('https://example.com');
    for (const bad of ['javascript:alert(1)', 'data:text/html,hi', '//evil.example', 'JaVaScRiPt:x', '', 'https:// x', 7]) {
      expect(cleanHref(bad)).toBeNull();
    }
  });

  it('knows which links leave the site', () => {
    expect(isExternalHref('/mae', 'https://webpost.ing')).toBe(false);
    expect(isExternalHref('https://webpost.ing/mae', 'https://webpost.ing')).toBe(false);
    expect(isExternalHref('https://example.com', 'https://webpost.ing')).toBe(true);
  });

  it('gives each tile one link, and drops bad ones when loading', () => {
    let d = normaliseGrid({ v: 3, cols: 3, rows: 1 });
    d = setLink(d, ['0,0', '0,1'], 'https://a.example');
    d = setLink(d, ['0,1', '0,2'], '/b');
    expect(linkAt(d, 0, 0).href).toBe('https://a.example');
    expect(linkAt(d, 0, 1).href).toBe('/b');
    d = setLink(d, ['0,0'], null);
    expect(d.links).toEqual([{ href: '/b', tiles: ['0,1', '0,2'] }]);
    const loaded = normaliseGrid({ ...d, links: [...d.links, { href: 'javascript:x', tiles: ['0,0'] }, { href: '/c', tiles: ['0,1', '5,5'] }] });
    expect(loaded.links).toEqual([{ href: '/b', tiles: ['0,1', '0,2'] }]);
  });

  it('finds every tile of the link at a tile', () => {
    let d = normaliseGrid({ v: 3, cols: 3, rows: 2 });
    d = setLink(d, ['0,0', '0,1', '1,1'], '/a');
    expect(linkTiles(d, 1, 1).sort()).toEqual(['0,0', '0,1', '1,1']);
    expect(linkTiles(d, 1, 2)).toEqual([]);
  });

  it('refuses script and data addresses', () => {
    expect(cleanHref('javascript:alert(1)')).toBe(null);
    expect(cleanHref('data:text/html,hi')).toBe(null);
  });
});

describe('extensions (ext)', () => {
  it('keeps well-formed namespaced JSON on the grid and on layers, through a reload', () => {
    const d = normaliseGrid({ v: 3, cols: 2, rows: 1, ext: { sticker: { anchor: [1, 2], tags: ['a'] } },
      layers: [{ id: 'a', kind: 'pixel', ext: { note: 'hi' } }, { id: 'b', kind: 'photo', src: '/uploads/x.png', ext: { credit: { by: 'mae' } } }] });
    expect(d.ext).toEqual({ sticker: { anchor: [1, 2], tags: ['a'] } });
    expect(d.layers[0].ext).toEqual({ note: 'hi' });
    expect(d.layers[1].ext).toEqual({ credit: { by: 'mae' } });
    expect(normaliseGrid(JSON.parse(JSON.stringify(d)))).toEqual(d);
    expect(d.v).toBe(GRID_VERSION);
  });

  it('drops bad namespaces, non-JSON values, deep nesting and oversize data', () => {
    expect(cleanExt({ Bad: 1, 'x y': 1, ok: 1 })).toEqual({ ok: 1 });
    expect(cleanExt({ f: () => 1 })).toBeNull();
    expect(cleanExt({ n: NaN })).toBeNull();
    expect(cleanExt({ d: { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } } })).toBeNull();
    expect(cleanExt({ big: 'x'.repeat(20000) })).toBeNull();
    expect(cleanExt([1, 2])).toBeNull();
    expect(cleanExt(JSON.parse('{"__proto__": {"polluted": 1}, "ok": 1}'))).toEqual({ ok: 1 });
    expect({}.polluted).toBeUndefined();
  });

  it('leaves ext out when there is none', () => {
    expect('ext' in normaliseGrid({})).toBe(false);
  });
});

describe('merging two layers\' text', () => {
  const d = normaliseGrid({ v: 3, cols: 4, rows: 1, layers: [pixelLayer('x')] });
  it('lets the upper layer win where it has characters, and keeps the lower elsewhere', () => {
    let lower = d.layers[0];
    lower = writeChar(d, lower, 0, 0, 'a', { color: '#111111' }, 'full');   // wide tile 0
    lower = writeChar(d, lower, 0, 2, 'b', { color: '#111111' }, 'half');   // narrow tile 1
    lower = writeChar(d, lower, 0, 3, 'c', { color: '#111111' }, 'half');
    let upper = pixelLayer('up');
    upper = writeChar(d, upper, 0, 2, 'X', { color: '#ff0000' }, 'full');   // wide, over tile 1
    const m = mergeText(d, lower, upper);
    const layer = { ...lower, ...m };
    expect(rowChars(d, layer, 0).join('')).toBe('a X     ');
    expect(m.wide.sort()).toEqual(['0,0', '0,1']);
    expect(m.style['0,2']).toEqual({ color: '#ff0000' });
    expect(m.style['0,3']).toBeUndefined();   // the lower 'c' went with its tile
  });

  it('changes nothing when the upper layer has no text', () => {
    const lower = writeChar(d, d.layers[0], 0, 0, 'a', null, 'half');
    const m = mergeText(d, lower, pixelLayer('empty'));
    expect(m.text).toEqual(lower.text);
  });
});

describe('XL font (2×2 tiles)', () => {
  const d = normaliseGrid({ v: 3, cols: 4, rows: 3, layers: [pixelLayer('x')] });
  it('is four characters: four wide tiles, each holding the letter and its quarter', () => {
    const l = writeXl(d, d.layers[0], 0, 1, 'A', { color: '#ff0000' });
    for (const [r, c, part] of xlTiles(0, 1)) {
      expect(isWide(l, r, c)).toBe(true);
      expect(rowChars(d, l, r)[c * 2]).toBe('A');
      expect(l.style[`${r},${c * 2}`]).toEqual({ color: '#ff0000', font: 'xl', part });
    }
  });
  it('draws over what was there, and is itself overwritten one tile at a time', () => {
    let l = writeChar(d, d.layers[0], 0, 0, 'z', null, 'full');
    l = writeXl(d, l, 0, 0, 'A', null);
    expect(rowChars(d, l, 0)[0]).toBe('A');
    l = writeChar(d, l, 0, 2, 'q', { font: 'pixel' }, 'half');       // a narrow letter over the top-right quarter
    expect(isWide(l, 0, 1)).toBe(false);
    expect(l.style['0,2']).toEqual({ font: 'pixel' });                // no longer a quarter
    expect(l.style['0,0'].part).toBe('tl');                           // the others are untouched
    expect(l.style['2,0']).toBeUndefined();
    expect(l.style['0,0'].font).toBe('xl');
  });
  it('is left out where it would not fit, and keeps only real parts', () => {
    const l = d.layers[0];
    expect(writeXl(d, l, 0, 3, 'A', null)).toBe(l);    // last column
    expect(writeXl(d, l, 2, 0, 'A', null)).toBe(l);    // last row
    const g = normaliseGrid({ v: 3, layers: [{ id: 'a', kind: 'pixel', style: { '0,0': { font: 'xl', part: 'zz' }, '0,2': { font: 'pixel', part: 'tl' } } }] });
    expect(g.layers[0].style).toEqual({ '0,0': { font: 'xl' }, '0,2': { font: 'pixel' } });
  });
});

describe('pixel font variants', () => {
  const H = [0x66, 0x66, 0x66, 0x7e, 0x66, 0x66, 0x66, 0x00];
  it('are named fonts the format keeps', () => {
    for (const id of ['bold', 'italic', 'outline']) expect(FONT_NAMES[id]).toBeTruthy();
    const d = normaliseGrid({ layers: [{ id: 'a', kind: 'pixel', style: { '0,0': { font: 'outline' }, '0,1': { font: 'nope' } } }] });
    expect(d.layers[0].style).toEqual({ '0,0': { font: 'outline' } });
  });
  it('thicken, lean and hollow the letters, keeping eight rows', () => {
    expect(variantRows('bold', H)[0]).toBe(0x66 | 0x33);
    const lean = variantRows('italic', H);
    expect(lean[0]).toBe(0x33);
    expect(lean[3]).toBe(0x7e);
    expect(lean[6]).toBe(0xcc);
    const hollow = variantRows('outline', [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
    expect(hollow[0]).toBe(0xff);
    expect(hollow[3]).toBe(0x81);       // only the left and right edges of the middle rows
    expect(variantRows('pixel', H)).toBe(H);
    expect(H.every(b => b <= 0xff) && variantRows('bold', H)).toHaveLength(8);
  });
});

describe('typefaces', () => {
  it('serif, script, cute and comic are fonts the format keeps, each with a family', () => {
    for (const id of ['serif', 'script', 'cute', 'jazz', 'comic', 'papyrus']) {
      expect(FONT_NAMES[id]).toBeTruthy();
      expect(TYPEFACES[id].family).toContain(',');
      const d = normaliseGrid({ layers: [{ id: 'a', kind: 'pixel', style: { '0,0': { font: id } } }] });
      expect(d.layers[0].style['0,0'].font).toBe(id);
    }
  });
});

describe('serif, sans-serif and symbols bitmap fonts', () => {
  it('are named fonts the format keeps', () => {
    for (const id of ['serifpx', 'sanspx', 'symbols']) {
      expect(FONT_NAMES[id]).toBeTruthy();
      const d = normaliseGrid({ layers: [{ id: 'a', kind: 'pixel', style: { '0,0': { font: id } } }] });
      expect(d.layers[0].style).toEqual({ '0,0': { font: id } });
    }
  });
  it('have every printable ASCII letter in both widths, as custom-glyph hex', () => {
    for (const font of ['serifpx', 'sanspx']) {
      for (let c = 0x21; c < 0x7f; c++) {
        const ch = String.fromCharCode(c);
        expect(bitmapGlyph(font, ch, false), `${font} half ${ch}`).toMatch(/^[0-9a-f]{32}$/);
        expect(bitmapGlyph(font, ch, true), `${font} full ${ch}`).toMatch(/^[0-9a-f]{64}$/);
      }
    }
  });
  it('draws symbols, and nothing for characters a font lacks', () => {
    expect(SYMBOL_CHARS).toContain('★');
    for (const ch of SYMBOL_CHARS) {
      expect(bitmapGlyph('symbols', ch, false)).toMatch(/^[0-9a-f]{32}$/);
      expect(bitmapGlyph('symbols', ch, true)).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(bitmapGlyph('symbols', 'A', true)).toBeNull();
    expect(bitmapGlyph('pixel', 'A', true)).toBeNull();
  });
});

describe('text for readers to select', () => {
  it('lists each row\'s visible letters with their slots and widths, the top layer winning', () => {
    const d = normaliseGrid({ v: 3, cols: 4, rows: 2, layers: [
      { id: 'lo', kind: 'pixel', text: ['a b', 'z'], wide: ['0,0'] },
      { id: 'hi', kind: 'pixel', text: ['  X'], wide: [] },
      { id: 'hidden', kind: 'pixel', visible: false, text: ['Q'] },
    ] });
    const rows = readableText(d);
    // lower layer: wide 'a' in tile 0 (slot 0), 'b' narrow at slot 2; upper 'X' at slot 2 wins over 'b'
    expect(rows[0].map(p => [p.text, p.slot, p.width])).toEqual([['a', 0, 2], ['X', 2, 1]]);
    expect(rows[1].map(p => p.text)).toEqual(['z']);
  });
});

describe('magic wand and pixel perfect', () => {
  // 4 × 3 tiles; 'x' marks tiles that look alike
  const look = ['xx.x', '.x..', '.xx.'];
  const sig = (r, c) => look[r][c];
  it('selects joined tiles that look the same, across edges but not corners', () => {
    expect(floodTiles(4, 3, sig, 0, 0).sort()).toEqual(['0,0', '0,1', '1,1', '2,1', '2,2']);
    expect(floodTiles(4, 3, sig, 0, 3)).toEqual(['0,3']);          // its neighbours differ
    expect(floodTiles(4, 3, sig, 1, 0).sort()).toEqual(['1,0', '2,0']);
    expect(floodTiles(4, 3, sig, 9, 9)).toEqual([]);
  });
  it('finds the elbow of a diagonal step made of two straight ones', () => {
    expect(isElbow({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 })).toBe(true);
    expect(isElbow({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 })).toBe(true);
    expect(isElbow({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 })).toBe(false);   // straight
    expect(isElbow({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 })).toBe(false);   // already diagonal
    expect(isElbow({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 2 })).toBe(false);   // a gap
  });
});

describe('shapes', () => {
  const set = (pts) => new Set(pts.map(([x, y]) => `${x},${y}`));
  it('draws a line one pixel thick from end to end', () => {
    expect(linePixels(0, 0, 3, 0)).toEqual([[0, 0], [1, 0], [2, 0], [3, 0]]);
    expect(linePixels(0, 0, 3, 3)).toEqual([[0, 0], [1, 1], [2, 2], [3, 3]]);
    const l = linePixels(5, 1, 0, 3);
    expect(l[0]).toEqual([5, 1]);
    expect(l[l.length - 1]).toEqual([0, 3]);
    expect(l).toHaveLength(6);
  });
  it('draws a rectangle edge, or fills it, whichever corner it starts from', () => {
    expect(rectPixels(0, 0, 2, 2)).toHaveLength(8);
    expect(rectPixels(2, 2, 0, 0, true)).toHaveLength(9);
    expect(set(rectPixels(0, 0, 2, 2)).has('1,1')).toBe(false);
  });
  it('draws an ellipse inside its box, edge or filled, symmetric', () => {
    const fill = set(ellipsePixels(0, 0, 8, 4, true));
    const edge = set(ellipsePixels(0, 0, 8, 4));
    expect(fill.has('4,2')).toBe(true);           // the middle
    expect(edge.has('4,2')).toBe(false);
    expect(fill.has('0,0')).toBe(false);          // the box's corner is outside
    for (const k of edge) expect(fill.has(k)).toBe(true);
    for (const k of fill) { const [x, y] = k.split(',').map(Number); expect(fill.has(`${8 - x},${y}`)).toBe(true); }
    expect(ellipsePixels(3, 3, 3, 3)).toEqual([[3, 3]]);
  });
});

describe('magic fill', () => {
  // A 4×3 picture from rows of letters: '.' clear, 'a' red, 'b' blue.
  const COLOURS = { '.': [0, 0, 0, 0], a: [255, 0, 0, 255], b: [0, 0, 255, 255], g: [0, 255, 0, 255] };
  const picture = (rows) => {
    const width = rows[0].length, height = rows.length;
    const data = new Uint8ClampedArray(width * height * 4);
    rows.forEach((row, y) => [...row].forEach((ch, x) => data.set(COLOURS[ch], (y * width + x) * 4)));
    return { width, height, data };
  };
  const letters = (image) => Array.from({ length: image.height }, (_, y) => Array.from({ length: image.width }, (_, x) => {
    const px = [...image.data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)].join();
    return Object.keys(COLOURS).find(k => COLOURS[k].join() === px);
  }).join(''));

  it('fills the joined pixels of one colour, across edges and not corners', () => {
    const image = picture(['aab.', 'a.ba', '..aa']);
    expect(floodPixels(image, 0, 0, COLOURS.g)).toBe(3);
    expect(letters(image)).toEqual(['ggb.', 'g.ba', '..aa']);
  });

  it('fills that colour everywhere when asked, and clear areas too', () => {
    const image = picture(['aab.', 'a.ba', '..aa']);
    expect(floodPixels(image, 0, 0, COLOURS.g, { everywhere: true })).toBe(6);
    expect(letters(image)).toEqual(['ggb.', 'g.bg', '..gg']);
    expect(floodPixels(image, 1, 1, COLOURS.b)).toBe(3);
    expect(letters(image)).toEqual(['ggb.', 'gbbg', 'bbgg']);
  });

  it('can clear, stays where it is allowed, and does nothing when the colour is already there', () => {
    const image = picture(['aaaa']);
    expect(floodPixels(image, 0, 0, COLOURS.a)).toBe(0);
    expect(floodPixels(image, 0, 0, COLOURS.b, { allowed: (x) => x < 2 })).toBe(2);
    expect(letters(image)).toEqual(['bbaa']);
    expect(floodPixels(image, 3, 0, COLOURS['.'])).toBe(2);
    expect(letters(image)).toEqual(['bb..']);
    expect(floodPixels(image, 9, 9, COLOURS.a)).toBe(0);
  });
});

describe('lasso', () => {
  it('selects the tiles whose centres are inside the loop', () => {
    // A loop round the first two tiles of the first row (tiles are 16 grid pixels).
    const loop = [{ x: 1, y: 1 }, { x: 31, y: 1 }, { x: 31, y: 15 }, { x: 1, y: 15 }];
    expect(lassoTiles(4, 2, loop).sort()).toEqual(['0,0', '0,1']);
  });

  it('falls back to the tiles it passes through when the loop holds no centre', () => {
    expect(lassoTiles(4, 2, [{ x: 2, y: 2 }, { x: 4, y: 3 }, { x: 18, y: 2 }]).sort()).toEqual(['0,0', '0,1']);
    expect(lassoTiles(4, 2, [])).toEqual([]);
  });
});

describe('taking text off a layer', () => {
  const d = normaliseGrid({ v: 3, cols: 2, rows: 1, layers: [pixelLayer('T')] });
  let layer = writeChar(d, d.layers[0], 0, 0, 'a', { color: '#ff0000' }, 'half');
  layer = writeChar(d, layer, 0, 2, 'b', { color: '#00ff00' }, 'full');

  it('takes everything when no tiles are named', () => {
    const { taken, left, count } = takeText(d, layer);
    expect(count).toBe(2);
    expect(taken.text[0]).toBe(layer.text[0]);
    expect(left.text[0]).toBe('');
    expect(left.style).toEqual({});
    expect(left.wide).toEqual([]);
  });

  it('takes only the named tiles, with their styles and widths', () => {
    const { taken, left, count } = takeText(d, layer, new Set(['0,1']));
    expect(count).toBe(1);
    expect(taken.text[0].trim()).toBe('b');
    expect(Object.keys(taken.style)).toEqual(['0,2']);
    expect(taken.wide).toEqual(['0,1']);
    expect(left.text[0]).toBe('a');
    expect(Object.keys(left.style)).toEqual(['0,0']);
  });
});
