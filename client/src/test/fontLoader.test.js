import { describe, it, expect, beforeEach } from 'vitest';
import {
  GOOGLE_FONTS, googleFamily, googleFontUrl, familiesIn, ensureFont, ensureFontsIn, ensureFontsInElement, watchFontsIn,
} from '../utils/fontLoader.js';
import { FONTS, ensureThemeFonts } from '../components/PageTheme/theme.js';
import { TYPEFACES, requestTypefaces } from '../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/tileGrid.js';

const links = () => [...document.head.querySelectorAll('link[data-font]')].map(l => l.dataset.font);

describe('font table', () => {
  it('looks a family up ignoring quotes and case', () => {
    expect(googleFamily('"Old Standard TT"')).toBe('Old Standard TT');
    expect(googleFamily("'playfair display'")).toBe('Playfair Display');
    expect(googleFamily('Georgia')).toBeNull();
    expect(googleFamily('Choco cooky')).toBeNull();
    expect(googleFamily(undefined)).toBeNull();
  });

  it('builds one css2 address per family with its weights and swap', () => {
    expect(googleFontUrl('Caveat')).toBe('https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&display=swap');
    expect(googleFontUrl('Bebas Neue')).toBe('https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap');
    expect(googleFontUrl('Old Standard TT')).toContain('family=Old+Standard+TT:ital,wght@0,400;0,700;1,400');
    expect(googleFontUrl('Arial')).toBeNull();
  });

  it('covers every web font the themes, grids and post picker name', () => {
    const stacks = [
      ...Object.values(FONTS).map(f => f.css),
      ...Object.values(TYPEFACES).map(t => t.family),
    ];
    // Self-hosted (index.css) and system families need no stylesheet.
    const notGoogle = new Set(['Choco cooky', 'ChocoCooky', 'Cool jazz', 'CoolJazz', 'Cooljazz']);
    const known = new Set(Object.keys(GOOGLE_FONTS).map(k => k.toLowerCase()));
    for (const stack of stacks) {
      const first = familiesIn(stack)[0];
      if (notGoogle.has(first)) continue;
      // The first family of a theme font is either in the table or a system face.
      const system = ['Comic Sans MS', 'Papyrus', 'Times New Roman', 'system-ui', 'Georgia'];
      expect(known.has(first.toLowerCase()) || system.includes(first), first).toBe(true);
    }
  });
});

describe('stack parsing', () => {
  it('splits on commas outside quotes and strips the quotes', () => {
    expect(familiesIn('"Old Standard TT", \'Times New Roman\', serif')).toEqual(['Old Standard TT', 'Times New Roman', 'serif']);
    expect(familiesIn('"A, B", C')).toEqual(['A, B', 'C']);
    expect(familiesIn('')).toEqual([]);
    expect(familiesIn(null)).toEqual([]);
  });
});

describe('injecting stylesheets', () => {
  beforeEach(() => { document.head.querySelectorAll('link[data-font]').forEach(l => l.remove()); });

  it('adds one link per family and only once', async () => {
    // Families unique to this test: the loader remembers what it has asked for.
    ensureFont('VT323'); ensureFont('"VT323"'); ensureFont('vt323');
    expect(links()).toEqual(['VT323']);
    const link = document.head.querySelector('link[data-font="VT323"]');
    expect(link.rel).toBe('stylesheet');
    expect(link.href).toContain('display=swap');
  });

  it('ignores system, self-hosted and unknown families without throwing', async () => {
    expect(await ensureFont('Georgia')).toBe(false);
    expect(await ensureFont('Choco cooky')).toBe(false);
    expect(await ensureFont(null)).toBe(false);
    await ensureFontsIn('Georgia, "Choco cooky", serif');
    await ensureFontsIn(undefined);
    expect(links()).toEqual([]);
  });

  it('resolves when the stylesheet loads, and when it fails', async () => {
    const ok = ensureFont('Sacramento');
    document.head.querySelector('link[data-font="Sacramento"]').onload();
    expect(await ok).toBe(true);
    const bad = ensureFont('Pirata One');
    document.head.querySelector('link[data-font="Pirata One"]').onerror();
    expect(await bad).toBe(false);
  });

  it('ensures each loadable family in a stack', () => {
    ensureFontsIn('"Rubik Dirt", "Permanent Marker", sans-serif');
    expect(links().sort()).toEqual(['Permanent Marker', 'Rubik Dirt']);
  });

  it('finds inline font-family styles inside an element', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p><span style="font-family: &quot;Special Elite&quot;, monospace">a</span><span style="color: red">b</span></p>';
    ensureFontsInElement(root);
    expect(links()).toEqual(['Special Elite']);
    ensureFontsInElement(null);
  });

  it('watches an element as content arrives, then stops', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const stop = watchFontsIn(root);
    root.innerHTML = '<span style="font-family: UnifrakturMaguntia, serif">x</span>';
    await new Promise(r => setTimeout(r, 300));
    expect(links()).toEqual(['UnifrakturMaguntia']);
    stop();
    root.remove();
    expect(typeof watchFontsIn(null)).toBe('function');
  });
});

describe('call sites', () => {
  beforeEach(() => { document.head.querySelectorAll('link[data-font]').forEach(l => l.remove()); });

  it('a theme loads its heading and body fonts', async () => {
    // Orbitron/IBM Plex Mono are not used by any other test here.
    ensureThemeFonts({ type: { heading: 'orbitron', body: 'plexmono' } });
    expect(links().sort()).toEqual(['IBM Plex Mono', 'JetBrains Mono', 'Orbitron']);
    await ensureThemeFonts({ type: { heading: 'nope' } });
    await ensureThemeFonts(null);
  });

  it('a grid typeface loads only its own family, once', () => {
    requestTypefaces('serif');
    requestTypefaces('serif');
    expect(links()).toEqual(['Old Standard TT']);
    requestTypefaces('serif');
    requestTypefaces('nonsense'); // not a typeface: drawn in the smooth font
    requestTypefaces('smooth');
    expect(links()).toEqual(['Old Standard TT']);
  });
});
