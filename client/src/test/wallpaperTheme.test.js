import { describe, it, expect } from 'vitest';
import { sanitiseWallpaper, serialiseWallpaper, MAX_TILE_TILES } from '../components/TileArt/wallpaper.js';
import { sanitiseTheme, themeVariables, MAX_STICKER_TILES } from '../components/PageTheme/theme.js';
import { pixelLayer } from '../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/tileGrid.js';

const tile = (cols = 2, rows = 2) => ({ cols, rows, layers: [pixelLayer('T')] });
const wallpaper = (extra = {}) => ({ v: 3, tile: tile(), tiling: 'brick', scale: 3, bg: '#123456', ...extra });

describe('wallpapers', () => {
  it('keeps a well-formed wallpaper', () => {
    const w = sanitiseWallpaper(wallpaper());
    expect(w.tiling).toBe('brick');
    expect(w.scale).toBe(3);
    expect(w.bg).toBe('#123456');
    expect(w.tile.cols).toBe(2);
  });

  it('reads the stored JSON string too', () => {
    expect(sanitiseWallpaper(JSON.stringify(wallpaper())).tiling).toBe('brick');
  });

  it('treats empty, junk and old CSS wallpapers as none', () => {
    for (const bad of [null, '', '   ', 'not json', '{"v":2,"pattern":"grid"}', 42]) {
      expect(sanitiseWallpaper(bad)).toBeNull();
    }
    expect(serialiseWallpaper(null)).toBe('');
  });

  it('clamps tiling, scale, colour and tile size', () => {
    const w = sanitiseWallpaper(wallpaper({ tiling: 'spiral', scale: 99, bg: 'red;x', tile: tile(40, 40) }));
    expect(w.tiling).toBe('repeat');
    expect(w.scale).toBe(8);
    expect(w.bg).toBe('#eeede9');
    expect(w.tile.cols).toBe(MAX_TILE_TILES);
  });
});

describe('themes', () => {
  it('fills a bare theme with Newspaper Life values', () => {
    const t = sanitiseTheme({});
    expect(t.type.heading).toBe('headline');
    expect(t.page.wallpaper).toBeNull();
    expect(t.card.sticker).toBeNull();
    expect(t.preset).toBe('custom');
  });

  it('keeps pictures as grids and clamps the sticker size', () => {
    const t = sanitiseTheme({ page: { wallpaper: wallpaper() }, card: { texture: wallpaper(), sticker: tile(9, 9) } });
    expect(t.page.wallpaper.tiling).toBe('brick');
    expect(t.card.texture).not.toBeNull();
    expect(t.card.sticker.cols).toBe(MAX_STICKER_TILES);
  });

  it('never lets text through into a style', () => {
    const t = sanitiseTheme({ type: { heading: 'Comic Sans', ink: 'expression(x)' }, card: { border: '<b>', radius: 999 } });
    const vars = JSON.stringify(themeVariables(t));
    expect(vars).not.toMatch(/Comic Sans|expression|<b>/);
    expect(t.card.radius).toBe(28);
  });

  it('shows the sticker only once its picture is ready', () => {
    const t = sanitiseTheme({ card: { sticker: tile(1, 1) } });
    expect(themeVariables(t)['--th-sticker-display']).toBe('none');
    const ready = themeVariables(t, { sticker: { url: 'data:image/png;base64,AA==', width: 32, height: 32 } });
    expect(ready['--th-sticker-display']).toBe('block');
    expect(ready['--th-sticker-w']).toBe('32px');
  });
});
