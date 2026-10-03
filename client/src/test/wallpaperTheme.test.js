import { describe, it, expect } from 'vitest';
import { sanitiseWallpaper, serialiseWallpaper, MAX_TILE_TILES } from '../components/TileArt/wallpaper.js';
import { sanitiseTheme, themeVariables, readableOn, contrast, MAX_STICKER_TILES, getPresets } from '../components/PageTheme/theme.js';
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
  it('includes sand and oak presets', () => {
    const presets = Object.keys(getPresets());
    expect(presets).toContain('sand');
    expect(presets).toContain('oak');
  });

  it('accepts the newer font ids and the restyled presets use them', () => {
    for (const f of ['times', 'outfit', 'nunito', 'plexmono', 'orbitron', 'caveat', 'bebas', 'josefin', 'pirata', 'sacramento', 'pixelify', 'rubikdirt']) {
      expect(sanitiseTheme({ type: { heading: f, body: f } }).type).toMatchObject({ heading: f, body: f });
    }
    expect(sanitiseTheme(getPresets().neon.theme).type).toMatchObject({ heading: 'orbitron', body: 'plexmono' });
    expect(sanitiseTheme(getPresets().sticky.theme).type).toMatchObject({ heading: 'caveat', body: 'nunito' });
  });

  it('sanitises oak preset correctly', () => {
    const t = sanitiseTheme({ preset: 'oak' });
    expect(t.preset).toBe('oak');
  });

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

describe('readable text on a card', () => {
  it('keeps a colour that can be read, and replaces one that cannot', () => {
    expect(readableOn('#ff2bd6', '#060c10')).toBe('#ff2bd6');
    expect(readableOn('#111111', '#000000', '#f2f2f2')).toBe('#f2f2f2');
    expect(readableOn('#111111', '#000000')).toBe('#f2f2f2');
    expect(readableOn('#fefefe', '#ffffff')).toBe('#111111');
  });

  it('a black card with a dark accent still gets readable links', () => {
    const t = sanitiseTheme({ type: { ink: '#f2f2f2', accent: '#111111', headingInk: '#0b0b0b' }, card: { bg: '#000000' } });
    const vars = themeVariables(t);
    for (const k of ['--th-ink', '--th-accent', '--th-heading-ink']) expect(contrast(vars[k], '#000000')).toBeGreaterThan(2.5);
  });

  it('leaves the colours alone on a textured or see-through card, whose colour is not what shows', () => {
    const base = { type: { ink: '#000000', headingInk: '#000000', accent: '#000000' } };
    const glass = themeVariables(sanitiseTheme({ ...base, card: { bg: '#000000', opacity: 0.3 } }));
    expect(glass['--th-ink']).toBe('#000000');
    const textured = sanitiseTheme({ ...base, card: { bg: '#000000' } });
    textured.card.texture = { v: 3 };
    const vars = themeVariables(textured);
    expect([vars['--th-ink'], vars['--th-heading-ink'], vars['--th-accent']]).toEqual(['#000000', '#000000', '#000000']);
    // Once the texture's own colour is measured, text is checked against that.
    expect(themeVariables(textured, { card: { colour: '#f4f1e8' } })['--th-ink']).toBe('#000000');
    expect(themeVariables(textured, { card: { colour: '#101010' } })['--th-ink']).toBe('#f2f2f2');
  });
});
