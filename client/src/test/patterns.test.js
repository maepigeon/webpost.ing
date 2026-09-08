import { describe, it, expect } from 'vitest';
import {
  isValidPattern, patternToStyle, parseWallpaper, buildWallpaper, PRESET_PATTERNS,
  extractBgColor, stripBgColor, DEFAULT_BG_COLOR,
  hexToRgb, contrastRatio, isPatternInvisible, readableInkFor, randomWallpaper,
} from '../components/PatternPicker/patterns.js';

// ── extractBgColor / stripBgColor ─────────────────────────────────────────────

describe('extractBgColor', () => {
  it('returns null for null', () => expect(extractBgColor(null)).toBeNull());
  it('returns null for plain preset key', () => expect(extractBgColor('grid')).toBeNull());
  it('returns color for preset|#hex', () => expect(extractBgColor('grid|#f0e6d3')).toBe('#f0e6d3'));
  it('returns color for |#hex (no pattern)', () => expect(extractBgColor('|#aabbcc')).toBe('#aabbcc'));
  it('returns null if suffix is not hex', () => expect(extractBgColor('grid|red')).toBeNull());
  it('accepts 3-char hex', () => expect(extractBgColor('grid|#abc')).toBe('#abc'));
  it('accepts 8-char hex', () => expect(extractBgColor('grid|#aabbccdd')).toBe('#aabbccdd'));
});

describe('stripBgColor', () => {
  it('returns null for null', () => expect(stripBgColor(null)).toBeNull());
  it('returns value unchanged when no suffix', () => expect(stripBgColor('grid')).toBe('grid'));
  it('strips valid |#hex suffix', () => expect(stripBgColor('grid|#f0e6d3')).toBe('grid'));
  it('strips from gradient value', () =>
    expect(stripBgColor('linear-gradient(red,blue)|#001122')).toBe('linear-gradient(red,blue)'));
  it('does not strip non-hex suffix', () => expect(stripBgColor('grid|red')).toBe('grid|red'));
  it('returns empty string for |#hex only', () => expect(stripBgColor('|#aabbcc')).toBe(''));
});

// ── isValidPattern ────────────────────────────────────────────────────────────

describe('isValidPattern', () => {
  it('accepts null', () => expect(isValidPattern(null)).toBe(true));
  it('accepts empty string', () => expect(isValidPattern('')).toBe(true));
  it('accepts "none"', () => expect(isValidPattern('none')).toBe(true));

  it('accepts all preset keys', () => {
    for (const key of Object.keys(PRESET_PATTERNS)) {
      expect(isValidPattern(key), `preset "${key}"`).toBe(true);
    }
  });

  it('accepts linear-gradient', () =>
    expect(isValidPattern('linear-gradient(45deg, red, blue)')).toBe(true));
  it('accepts radial-gradient', () =>
    expect(isValidPattern('radial-gradient(circle, #fff 1px, transparent 1px)')).toBe(true));
  it('accepts repeating-linear-gradient', () =>
    expect(isValidPattern('repeating-linear-gradient(45deg, rgba(0,0,0,0.1), transparent 10px)')).toBe(true));
  it('accepts conic-gradient', () =>
    expect(isValidPattern('conic-gradient(red, blue)')).toBe(true));

  it('rejects url()', () =>
    expect(isValidPattern('url(https://evil.com/img.png)')).toBe(false));
  it('rejects url() inside gradient', () =>
    expect(isValidPattern('linear-gradient(red, url(x))')).toBe(false));
  it('rejects expression()', () =>
    expect(isValidPattern('expression(alert(1))')).toBe(false));
  it('rejects javascript:', () =>
    expect(isValidPattern('javascript:alert(1)')).toBe(false));
  it('rejects data:', () =>
    expect(isValidPattern('data:image/png;base64,abc')).toBe(false));
  it('rejects @import', () =>
    expect(isValidPattern('@import url(evil.css)')).toBe(false));
  it('rejects <', () =>
    expect(isValidPattern('<script>')).toBe(false));
  it('rejects >', () =>
    expect(isValidPattern('>alert')).toBe(false));
  it('rejects backslash', () =>
    expect(isValidPattern('linear-gradient(\\0061 lert)')).toBe(false));
  it('rejects semicolon', () =>
    expect(isValidPattern('linear-gradient(red, blue); background: red')).toBe(false));
  it('rejects var()', () =>
    expect(isValidPattern('linear-gradient(var(--secret))')).toBe(false));
  it('rejects env()', () =>
    expect(isValidPattern('linear-gradient(env(HOSTNAME))')).toBe(false));
  it('rejects attr()', () =>
    expect(isValidPattern('linear-gradient(attr(data-color))')).toBe(false));

  it('rejects arbitrary string', () => expect(isValidPattern('red')).toBe(false));
  it('rejects hex color', () => expect(isValidPattern('#ff0000')).toBe(false));
  it('rejects string longer than 2000 chars', () =>
    expect(isValidPattern('linear-gradient(' + 'a'.repeat(1990) + ')')).toBe(false));

  // |#COLOR suffix support
  it('accepts preset|#hex', () => expect(isValidPattern('grid|#f0e6d3')).toBe(true));
  it('accepts gradient|#hex', () =>
    expect(isValidPattern('linear-gradient(red,blue)|#001122')).toBe(true));
  it('accepts |#hex alone (just a bg color, no pattern)', () =>
    expect(isValidPattern('|#aabbcc')).toBe(true));
  it('rejects url() even with valid suffix', () =>
    expect(isValidPattern('url(evil.com)|#f0f0f0')).toBe(false));
});

// ── patternToStyle ────────────────────────────────────────────────────────────

describe('patternToStyle', () => {
  it('returns empty object for null', () =>
    expect(patternToStyle(null)).toEqual({}));
  it('returns empty object for empty string', () =>
    expect(patternToStyle('')).toEqual({}));
  it('returns empty object for "none"', () =>
    expect(patternToStyle('none')).toEqual({}));

  it('resolves "hexagons" preset to backgroundImage + backgroundSize', () => {
    const style = patternToStyle('hexagons');
    expect(style).toHaveProperty('backgroundImage');
    expect(style).toHaveProperty('backgroundSize');
    expect(style.backgroundImage).toContain('linear-gradient');
  });

  it('resolves "grid" preset', () => {
    const style = patternToStyle('grid');
    expect(style).toHaveProperty('backgroundImage');
  });

  it('applies custom gradient directly as backgroundImage', () => {
    const gradient = 'linear-gradient(135deg, #f5f7fa, #c3cfe2)';
    const style = patternToStyle(gradient);
    expect(style.backgroundImage).toBe(gradient);
  });

  it('returns empty object for dangerous custom value', () => {
    expect(patternToStyle('url(evil.com/track.png)')).toEqual({});
  });

  it('never exposes preset CSS values for unknown key', () => {
    // Unknown keys should not produce any style
    const style = patternToStyle('__unknown__');
    expect(style).toEqual({});
  });

  it('all presets produce backgroundImage or empty object', () => {
    for (const key of Object.keys(PRESET_PATTERNS)) {
      const style = patternToStyle(key);
      if (key === 'none') {
        expect(style).toEqual({});
      } else {
        expect(style).toHaveProperty('backgroundImage');
      }
    }
  });

  // |#COLOR suffix support
  it('extracts _bgColor from preset|#hex', () => {
    const style = patternToStyle('grid|#f0e6d3');
    expect(style).toHaveProperty('backgroundImage');
    expect(style._bgColor).toBe('#f0e6d3');
  });

  it('extracts _bgColor from |#hex alone (no pattern)', () => {
    const style = patternToStyle('|#aabbcc');
    expect(style._bgColor).toBe('#aabbcc');
    expect(style.backgroundImage).toBeUndefined();
  });

  it('no _bgColor when no suffix', () => {
    const style = patternToStyle('grid');
    expect(style._bgColor).toBeUndefined();
  });

  it('_bgColor absent for default color (no suffix stored)', () => {
    const style = patternToStyle('grid');
    expect('_bgColor' in style).toBe(false);
  });
});

// ── parseWallpaper: non-string input ──────────────────────────────────────────
// Regression guard: axios JSON-parses a text/plain body that looks like JSON, so
// GET /api/users/{u}/background used to hand callers an object. parseWallpaper
// then threw "stored.trim is not a function" and took the whole profile page
// down. Both the API config and parseWallpaper are now hardened.

describe('parseWallpaper — non-string input', () => {
  const v2 = { v: 2, pattern: 'paw-print', scale: 2, bgColor: '#ece9e2', colors: ['#4c0f79'] };

  it('accepts an already-parsed v2 object', () => {
    const w = parseWallpaper(v2);
    expect(w.pattern).toBe('paw-print');
    expect(w.scale).toBe(2);
    expect(w.bgColor).toBe('#ece9e2');
    expect(w.colors).toEqual(['#4c0f79']);
  });

  it('does not throw on an object and yields the same result as its JSON string', () => {
    expect(() => parseWallpaper(v2)).not.toThrow();
    expect(parseWallpaper(v2)).toEqual(parseWallpaper(JSON.stringify(v2)));
  });

  it('falls back to defaults for junk input', () => {
    for (const junk of [undefined, null, 0, false, [], {}, NaN]) {
      const w = parseWallpaper(junk);
      expect(w.pattern).toBe('none');
      expect(w.bgColor).toBe(DEFAULT_BG_COLOR);
    }
  });

  it('patternToStyle survives an object wallpaper', () => {
    const style = patternToStyle(v2);
    expect(style).toHaveProperty('backgroundImage');
    expect(style._bgColor).toBeUndefined(); // default bg → no page override
  });
});

// ── Colour maths ──────────────────────────────────────────────────────────────

describe('hexToRgb', () => {
  it('parses 6-digit hex', () => expect(hexToRgb('#4c0f79')).toEqual([76, 15, 121]));
  it('parses 3-digit shorthand', () => expect(hexToRgb('#fff')).toEqual([255, 255, 255]));
  it('tolerates a missing hash', () => expect(hexToRgb('000000')).toEqual([0, 0, 0]));
  it('is case insensitive', () => expect(hexToRgb('#ABCDEF')).toEqual(hexToRgb('#abcdef')));
  it('rejects junk', () => {
    for (const bad of ['#12', '#12345', 'rebeccapurple', '', null, undefined, 42, {}]) {
      expect(hexToRgb(bad), String(bad)).toBeNull();
    }
  });
});

describe('contrastRatio', () => {
  it('is 21:1 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });
  it('is 1:1 for a colour against itself', () => {
    expect(contrastRatio('#4c0f79', '#4c0f79')).toBeCloseTo(1, 5);
  });
  it('is symmetric', () => {
    expect(contrastRatio('#000000', '#ece9e2')).toBeCloseTo(contrastRatio('#ece9e2', '#000000'), 6);
  });
  it('returns null when either colour is unparseable', () => {
    expect(contrastRatio('#000000', 'nope')).toBeNull();
    expect(contrastRatio('nope', '#000000')).toBeNull();
  });
});

describe('isPatternInvisible', () => {
  // The exact wallpaper that made a live profile page render solid black.
  const blackOnBlack = { v: 2, pattern: 'paw-print', scale: 1, bgColor: '#000000', colors: ['#000000'] };

  it('flags black paws on a black page', () => {
    expect(isPatternInvisible(blackOnBlack)).toBe(true);
  });

  it('accepts black paws on the default cream page', () => {
    expect(isPatternInvisible({ ...blackOnBlack, bgColor: DEFAULT_BG_COLOR })).toBe(false);
  });

  it('flags near-misses, not just exact matches', () => {
    expect(isPatternInvisible({ ...blackOnBlack, colors: ['#050505'] })).toBe(true);
  });

  it('ignores wallpapers with no pattern', () => {
    expect(isPatternInvisible({ v: 2, pattern: 'none', bgColor: '#000000', colors: [] })).toBe(false);
  });

  it('ignores custom gradients, whose colours it cannot read', () => {
    expect(isPatternInvisible({ v: 2, pattern: 'custom', bgColor: '#000', colors: ['#000'], css: 'linear-gradient(red,blue)' }))
      .toBe(false);
  });

  it('does not throw on junk', () => {
    for (const junk of [null, undefined, {}, { pattern: 'stars' }]) {
      expect(() => isPatternInvisible(junk)).not.toThrow();
    }
  });
});

describe('readableInkFor', () => {
  it('returns dark ink on a light background', () => {
    expect(contrastRatio(readableInkFor('#ece9e2'), '#ece9e2')).toBeGreaterThan(4.5);
  });
  it('returns light ink on a dark background', () => {
    expect(contrastRatio(readableInkFor('#1a1832'), '#1a1832')).toBeGreaterThan(4.5);
  });
  it('falls back to black for an unparseable background', () => {
    expect(readableInkFor('not-a-colour')).toBe('#000000');
  });
});

describe('randomWallpaper', () => {
  // Deterministic pseudo-random source so the assertions are reproducible.
  const seeded = (seed) => () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  it('always produces a legible wallpaper', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const w = randomWallpaper(seeded(seed));
      expect(isPatternInvisible(w), `seed ${seed}: ${JSON.stringify(w)}`).toBe(false);
    }
  });

  it('produces a wallpaper that survives a save/load round trip', () => {
    const w = randomWallpaper(seeded(7));
    expect(parseWallpaper(buildWallpaper(w))).toEqual(w);
  });

  it('produces a renderable pattern with a sane scale', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const w = randomWallpaper(seeded(seed));
      expect(Object.keys(PRESET_PATTERNS)).toContain(w.pattern);
      expect(w.scale).toBeGreaterThanOrEqual(0.25);
      expect(w.scale).toBeLessThanOrEqual(4);
      expect(patternToStyle(buildWallpaper(w))).toHaveProperty('backgroundImage');
    }
  });

  it('varies between calls', () => {
    const seen = new Set();
    for (let seed = 1; seed <= 40; seed++) seen.add(buildWallpaper(randomWallpaper(seeded(seed))));
    expect(seen.size).toBeGreaterThan(5);
  });
});
