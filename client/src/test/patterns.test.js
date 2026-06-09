import { describe, it, expect } from 'vitest';
import { isValidPattern, patternToStyle, PRESET_PATTERNS, extractBgColor, stripBgColor, DEFAULT_BG_COLOR } from '../components/PatternPicker/patterns.js';

// ── extractBgColor / stripBgColor ─────────────────────────────────────────────

describe('extractBgColor', () => {
  it('returns null for null', () => expect(extractBgColor(null)).toBeNull());
  it('returns null for plain preset key', () => expect(extractBgColor('dots')).toBeNull());
  it('returns color for preset|#hex', () => expect(extractBgColor('dots|#f0e6d3')).toBe('#f0e6d3'));
  it('returns color for |#hex (no pattern)', () => expect(extractBgColor('|#aabbcc')).toBe('#aabbcc'));
  it('returns null if suffix is not hex', () => expect(extractBgColor('dots|red')).toBeNull());
  it('accepts 3-char hex', () => expect(extractBgColor('grid|#abc')).toBe('#abc'));
  it('accepts 8-char hex', () => expect(extractBgColor('grid|#aabbccdd')).toBe('#aabbccdd'));
});

describe('stripBgColor', () => {
  it('returns null for null', () => expect(stripBgColor(null)).toBeNull());
  it('returns value unchanged when no suffix', () => expect(stripBgColor('dots')).toBe('dots'));
  it('strips valid |#hex suffix', () => expect(stripBgColor('dots|#f0e6d3')).toBe('dots'));
  it('strips from gradient value', () =>
    expect(stripBgColor('linear-gradient(red,blue)|#001122')).toBe('linear-gradient(red,blue)'));
  it('does not strip non-hex suffix', () => expect(stripBgColor('dots|red')).toBe('dots|red'));
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
  it('accepts preset|#hex', () => expect(isValidPattern('dots|#f0e6d3')).toBe(true));
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

  it('resolves "dots" preset to backgroundImage + backgroundSize', () => {
    const style = patternToStyle('dots');
    expect(style).toHaveProperty('backgroundImage');
    expect(style).toHaveProperty('backgroundSize');
    expect(style.backgroundImage).toContain('radial-gradient');
  });

  it('resolves "grid" preset', () => {
    const style = patternToStyle('grid');
    expect(style.backgroundImage).toContain('linear-gradient');
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
    const style = patternToStyle('dots|#f0e6d3');
    expect(style).toHaveProperty('backgroundImage');
    expect(style._bgColor).toBe('#f0e6d3');
  });

  it('extracts _bgColor from |#hex alone (no pattern)', () => {
    const style = patternToStyle('|#aabbcc');
    expect(style._bgColor).toBe('#aabbcc');
    expect(style.backgroundImage).toBeUndefined();
  });

  it('no _bgColor when no suffix', () => {
    const style = patternToStyle('dots');
    expect(style._bgColor).toBeUndefined();
  });

  it('_bgColor absent for default color (no suffix stored)', () => {
    const style = patternToStyle('grid');
    expect('_bgColor' in style).toBe(false);
  });
});
