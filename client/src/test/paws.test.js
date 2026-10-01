import { describe, it, expect } from 'vitest';
import { pawLayout, pawColours } from '../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/textures.js';

describe('pawLayout', () => {
  it('puts a paw in every cell, evenly spaced, each row half a cell along', () => {
    const { rows, cols, paws } = pawLayout(64, 64);
    expect([rows, cols, paws.length]).toEqual([4, 4, 16]);
    const row0 = paws.filter(p => p.row === 0).map(p => p.x);
    const row1 = paws.filter(p => p.row === 1).map(p => p.x);
    expect(row0).toEqual([3, 19, 35, 51]);
    expect(row1).toEqual([11, 27, 43, 59]);
    expect(new Set(paws.filter(p => p.col === 0).map(p => p.y))).toEqual(new Set([4, 20, 36, 52]));
  });

  it('does not stagger an odd number of rows, so the tile still repeats seamlessly', () => {
    const { paws } = pawLayout(32, 48);
    expect(paws.filter(p => p.row === 1).map(p => p.x)).toEqual([3, 19]);
  });
});

describe('pawColours', () => {
  const all = (grid) => grid.flat();

  it('one colour paints every paw that colour', () => {
    expect(new Set(all(pawColours({ colouring: 'single', colour: '#123456' }, 4, 4)))).toEqual(new Set(['#123456']));
  });

  it('random is the same every time, and never repeats a colour next to itself', () => {
    const a = pawColours({ colouring: 'random' }, 4, 4);
    expect(pawColours({ colouring: 'random' }, 4, 4)).toEqual(a);
    for (const line of a) for (let i = 1; i < line.length; i++) expect(line[i]).not.toBe(line[i - 1]);
  });

  it('rainbow runs down the page: one colour per row, red at the top, all different', () => {
    const g = pawColours({ colouring: 'rainbow' }, 6, 3);
    for (const line of g) expect(new Set(line).size).toBe(1);
    expect(new Set(g.map(line => line[0])).size).toBe(6);
    const [r, gr, b] = [1, 3, 5].map(i => parseInt(g[0][0].slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(gr);
    expect(r).toBeGreaterThan(b);
  });

  it('my gradient starts at the first colour and passes through every stop', () => {
    const g = pawColours({ colouring: 'gradient', stops: ['#ff0000', '#00ff00', '#0000ff'] }, 6, 2);
    expect(g.map(line => line[0])).toEqual(['#ff0000', '#808000', '#00ff00', '#008080', '#0000ff', '#800080']);
  });

  it('ignores stops that are not colours', () => {
    const g = pawColours({ colouring: 'gradient', stops: ['#ff0000', 'red; background:url(x)', '#0000ff'] }, 2, 1);
    expect(g.map(line => line[0])).toEqual(['#ff0000', '#0000ff']);
  });
});

describe('a Paws wallpaper remembers its options', () => {
  it('keeps the texture and paw colours through sanitising, and drops anything else', async () => {
    const { sanitiseWallpaper } = await import('../components/TileArt/wallpaper.js');
    const w = sanitiseWallpaper({
      v: 3, tile: { cols: 2, rows: 2, layers: [] }, tiling: 'repeat', scale: 2, bg: '#000000',
      source: { texture: 'paws', options: { colouring: 'gradient', colour: 'red', stops: ['#FF0000', 'x', '#00ff00'], evil: 1 } },
    });
    expect(w.source).toEqual({ texture: 'paws', options: { colouring: 'gradient', colour: '#ff5e8a', stops: ['#ff0000', '#00ff00'] } });
  });

  it('forgets a source it does not know', async () => {
    const { sanitiseWallpaper } = await import('../components/TileArt/wallpaper.js');
    const w = sanitiseWallpaper({ v: 3, tile: { cols: 2, rows: 2, layers: [] }, source: { texture: 'nope' } });
    expect(w.source).toBeUndefined();
  });
});
