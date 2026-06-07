import { describe, it, expect } from 'vitest';
import { isValidPattern, patternToStyle, PRESET_PATTERNS } from '../components/PatternPicker/patterns.js';

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
});
