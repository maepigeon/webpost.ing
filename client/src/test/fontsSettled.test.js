import { describe, it, expect, afterEach } from 'vitest';
import { fontsSettled } from '../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/tileGrid.js';

const setFonts = (value) => Object.defineProperty(document, 'fonts', { value, configurable: true });
afterEach(() => { delete document.fonts; });

describe('fontsSettled', () => {
  it('is null when nothing is loading, so a grid is not drawn twice', () => {
    setFonts({ status: 'loaded', ready: Promise.resolve() });
    expect(fontsSettled()).toBeNull();
  });

  it('is null in a browser without the font API', () => {
    expect(fontsSettled()).toBeNull();
  });

  it('resolves once the browser has finished loading fonts', async () => {
    setFonts({ status: 'loading', ready: Promise.resolve() });
    const settled = fontsSettled();
    expect(settled).toBeInstanceOf(Promise);
    await expect(settled).resolves.toBeUndefined();
  });
});
