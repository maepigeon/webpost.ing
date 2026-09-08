/**
 * Preset background patterns.
 *
 * Keys are stored in the database. CSS values are NEVER stored — they live
 * only here, so a compromised DB value can never inject CSS into the page.
 *
 * Wallpaper data is stored as JSON v2:
 *   { "v": 2, "pattern": "hexagons", "scale": 1.5, "bgColor": "#ece9e2", "colors": ["#000000"] }
 * For custom CSS:
 *   { "v": 2, "pattern": "custom", "scale": 1, "bgColor": "#ece9e2", "colors": [], "css": "linear-gradient(...)" }
 *
 * The legacy pipe format ("hexagons|#ece9e2|scale:2") is still parsed for
 * backward compatibility with stored values, but new saves always use JSON v2.
 */

// ── Paw print ─────────────────────────────────────────────────────────────────

export const PAW_DEFAULT_COLOR = '#000000';

const _PAW_POSITION = [
  '76px 76px','76px 76px','76px 76px','76px 76px',
  '152px 152px','152px 152px','152px 152px','152px 152px',
  '-5.25px 5.25px','5.25px 5.25px',
  '70.75px 81.25px','81.25px 81.25px',
  '7px -15.75px','-7px -15.75px','-15.75px -5.25px','15.75px -5.25px',
  '83px 60.25px','69px 60.25px','60.25px 70.75px','91.75px 70.75px',
].join(', ');

export function pawImage(color) {
  const c = color || PAW_DEFAULT_COLOR;
  return [
    `linear-gradient(-45deg,${c} 7px,transparent 7px)`,
    `linear-gradient(45deg,${c} 7px,transparent 7px)`,
    `linear-gradient(135deg,${c} 7px,transparent 7px)`,
    `linear-gradient(-135deg,${c} 7px,transparent 7px)`,
    `linear-gradient(-45deg,${c} 7px,transparent 7px)`,
    `linear-gradient(45deg,${c} 7px,transparent 7px)`,
    `linear-gradient(135deg,${c} 7px,transparent 7px)`,
    `linear-gradient(-135deg,${c} 7px,transparent 7px)`,
    `radial-gradient(circle,${c} 7px,transparent 7px)`,
    `radial-gradient(circle,${c} 7px,transparent 7px)`,
    `radial-gradient(circle,${c} 7px,transparent 7px)`,
    `radial-gradient(circle,${c} 7px,transparent 7px)`,
    `radial-gradient(circle,${c} 4.67px,transparent 4.67px)`,
    `radial-gradient(circle,${c} 4.67px,transparent 4.67px)`,
    `radial-gradient(circle,${c} 4.67px,transparent 4.67px)`,
    `radial-gradient(circle,${c} 4.67px,transparent 4.67px)`,
    `radial-gradient(circle,${c} 4.67px,transparent 4.67px)`,
    `radial-gradient(circle,${c} 4.67px,transparent 4.67px)`,
    `radial-gradient(circle,${c} 4.67px,transparent 4.67px)`,
    `radial-gradient(circle,${c} 4.67px,transparent 4.67px)`,
  ].join(',');
}

// ── Polka dots ────────────────────────────────────────────────────────────────

export const STARS_DEFAULT_COLOR = '#000000';
export const STARS_DEFAULT_BG    = 'transparent';

export function starsImage(dotColor, bgFill) {
  const c = dotColor || STARS_DEFAULT_COLOR;
  const dot = `radial-gradient(circle, ${c} 7px, transparent 7px)`;
  if (bgFill && bgFill !== 'transparent') return [dot, `linear-gradient(${bgFill}, ${bgFill})`].join(',');
  return dot;
}

// ── Editable color slots per preset ──────────────────────────────────────────
//
// Defines how many user-editable pattern colors each preset has, their labels,
// and their default values. The background color is separate (bgColor field).

export const PRESET_COLOR_SLOTS = {
  none:         [],
  hexagons:     [{ label: 'Lines',   default: '#000000' }],
  grid:         [{ label: 'Petals',  default: '#000000' }],
  chevron:      [{ label: 'Lines',   default: '#000000' }],
  checkerboard: [{ label: 'Squares', default: '#000000' }],
  topographic:  [{ label: 'Rings',   default: '#000000' }],
  'paw-print':  [{ label: 'Paws',    default: '#000000' }],
  stars:        [{ label: 'Dots',    default: '#000000' }],
};

// ── Parameterized preset CSS ──────────────────────────────────────────────────
//
// Renders a preset using the given colors array. Missing colors fall back to
// slot defaults. Used for actual page rendering AND active swatch preview.

export function renderPresetStyle(key, colors) {
  const slot0 = PRESET_COLOR_SLOTS[key]?.[0];
  const c0 = (Array.isArray(colors) && colors[0]) || slot0?.default || '#000000';

  switch (key) {
    case 'hexagons':
      return {
        backgroundImage:
          `repeating-linear-gradient(60deg, ${c0} 0px, ${c0} 1px, transparent 1px, transparent 28px),` +
          `repeating-linear-gradient(-60deg, ${c0} 0px, ${c0} 1px, transparent 1px, transparent 28px),` +
          `repeating-linear-gradient(0deg, ${c0} 0px, ${c0} 1px, transparent 1px, transparent 28px)`,
        backgroundSize: '32px 56px',
      };
    case 'grid':
      return {
        backgroundImage:
          `radial-gradient(ellipse 11% 22% at 50% 28%, ${c0} 100%, transparent 0%),` +
          `radial-gradient(ellipse 22% 11% at 72% 50%, ${c0} 100%, transparent 0%),` +
          `radial-gradient(ellipse 11% 22% at 50% 72%, ${c0} 100%, transparent 0%),` +
          `radial-gradient(ellipse 22% 11% at 28% 50%, ${c0} 100%, transparent 0%),` +
          `radial-gradient(circle at 50% 50%, ${c0} 7%, transparent 0%)`,
        backgroundSize: '40px 40px',
      };
    case 'chevron':
      return {
        backgroundImage:
          `linear-gradient(135deg, ${c0} 25%, transparent 25%),` +
          `linear-gradient(225deg, ${c0} 25%, transparent 25%),` +
          `linear-gradient(315deg, ${c0} 25%, transparent 25%),` +
          `linear-gradient(45deg, ${c0} 25%, transparent 25%)`,
        backgroundSize: '40px 40px',
        backgroundPosition: '-20px 0, -20px 0, 0 0, 0 0',
      };
    case 'checkerboard':
      return {
        backgroundImage: `conic-gradient(${c0} 0.25turn, transparent 0.25turn 0.5turn, ${c0} 0.5turn 0.75turn, transparent 0.75turn)`,
        backgroundSize: '20px 20px',
      };
    case 'topographic':
      return {
        backgroundImage: `repeating-radial-gradient(circle at 50% 50%, transparent 0px, transparent 28px, ${c0} 30px, transparent 32px, transparent 58px, ${c0} 60px, transparent 62px)`,
      };
    case 'paw-print':
      return {
        backgroundImage: pawImage(c0),
        backgroundSize: '152px 152px',
        backgroundPosition: _PAW_POSITION,
      };
    case 'stars':
      return {
        backgroundImage: starsImage(c0, null),
        backgroundSize: '36px 36px',
      };
    default:
      return {};
  }
}

// ── Preset catalog (for swatch thumbnails, always default black) ──────────────

export const PRESET_PATTERNS = Object.fromEntries(
  Object.keys(PRESET_COLOR_SLOTS).map(key => [
    key,
    {
      label: {
        none: 'None', hexagons: 'Hexagons', grid: 'Flowers',
        chevron: 'Chevron', checkerboard: 'Checker', topographic: 'Topo',
        'paw-print': 'Paws', stars: 'Polka',
      }[key] || key,
      ...renderPresetStyle(key, []),
    },
  ])
);

// ── Default background color ──────────────────────────────────────────────────

export const DEFAULT_BG_COLOR = '#ece9e2';

// ── JSON v2 wallpaper data ────────────────────────────────────────────────────

/**
 * Parse a stored wallpaper string (JSON v2 or legacy pipe format) into a
 * wallpaper data object:
 *   { v: 2, pattern, scale, bgColor, colors, [css] }
 */
export function parseWallpaper(stored) {
  const empty = { v: 2, pattern: 'none', scale: 1, bgColor: DEFAULT_BG_COLOR, colors: [] };
  if (!stored) return empty;

  // Defensive: the stored value is a string everywhere it is produced, but an
  // HTTP client that JSON-parses a text/plain body (axios does this by default)
  // can hand us the already-decoded object. Re-encode rather than crash on
  // `.trim()`. See TEXT_GET in BasicTextPostServerApi.js for the root fix.
  if (typeof stored === 'object') {
    if (Array.isArray(stored)) return empty;
    try { stored = JSON.stringify(stored); } catch { return empty; }
  } else if (typeof stored !== 'string') {
    return empty;
  }
  if (!stored.trim()) return empty;

  const s = stored.trim();

  // ── JSON v2 ──
  if (s.startsWith('{')) {
    try {
      const data = JSON.parse(s);
      if (data.v === 2) {
        const w = {
          v: 2,
          pattern:  data.pattern  || 'none',
          scale:    typeof data.scale === 'number' ? data.scale : 1,
          bgColor:  data.bgColor  || DEFAULT_BG_COLOR,
          colors:   Array.isArray(data.colors) ? data.colors : [],
        };
        if (data.pattern === 'custom') w.css = data.css || '';
        return w;
      }
    } catch { /* fall through to legacy */ }
    return empty;
  }

  // ── Legacy pipe format (auto-migrate on next save) ──
  const { base, bgColor: legacyBg, scale: legacyScale } = _parseSegmentsLegacy(s);
  const bg    = legacyBg    || DEFAULT_BG_COLOR;
  const scale = legacyScale || 1;

  if (!base || base === 'none') return { ...empty, scale, bgColor: bg };

  if (base in PRESET_COLOR_SLOTS) {
    return { v: 2, pattern: base, scale, bgColor: bg, colors: [] };
  }
  if (base.startsWith('paw-print:')) {
    const color = base.slice('paw-print:'.length).trim();
    return { v: 2, pattern: 'paw-print', scale, bgColor: bg, colors: [color] };
  }
  if (base.startsWith('stars:')) {
    const rest = base.slice('stars:'.length);
    const idx = rest.indexOf(':');
    const dotColor = (idx >= 0 ? rest.slice(0, idx) : rest).trim();
    const starsBg  = idx >= 0 ? rest.slice(idx + 1).trim() : null;
    return { v: 2, pattern: 'stars', scale, bgColor: starsBg || bg, colors: [dotColor] };
  }
  // Custom CSS gradient
  return { v: 2, pattern: 'custom', scale, bgColor: bg, colors: [], css: base };
}

/**
 * Serialize a wallpaper data object to a JSON v2 string for storage.
 */
export function buildWallpaper(data) {
  const scale = typeof data.scale === 'number' ? data.scale : 1;
  const d = {
    v:       2,
    pattern: data.pattern  || 'none',
    scale:   parseFloat(scale.toFixed(4).replace(/\.?0+$/, '')) || 1,
    bgColor: data.bgColor  || DEFAULT_BG_COLOR,
    colors:  Array.isArray(data.colors) ? data.colors : [],
  };
  if (data.pattern === 'custom') d.css = data.css || '';
  return JSON.stringify(d);
}

// ── Style resolution ──────────────────────────────────────────────────────────

/**
 * Convert a wallpaper data object to React inline style properties.
 * May include `_bgColor` — caller applies to document.documentElement.style.backgroundColor.
 */
export function wallpaperToStyle(data) {
  if (!data) return {};

  // No pattern but a custom background color — just apply the color.
  if (!data.pattern || data.pattern === 'none') {
    if (data.bgColor && data.bgColor !== DEFAULT_BG_COLOR) return { _bgColor: data.bgColor };
    return {};
  }

  let style = {};

  if (data.pattern === 'custom') {
    const css = (data.css || '').trim();
    if (!css || !isValidCustomCss(css)) return {};
    style = { backgroundImage: css };
  } else {
    style = renderPresetStyle(data.pattern, data.colors);
  }

  if (!style.backgroundImage) return {};

  // Scale
  const scale = typeof data.scale === 'number' ? data.scale : 1;
  if (scale !== 1) {
    const scalePx = (s) => s.replace(/(\d+(?:\.\d+)?)(px)/g, (_, n) =>
      `${(parseFloat(n) * scale).toFixed(2)}px`);
    if (style.backgroundSize && style.backgroundSize !== 'auto') {
      style.backgroundSize  = scalePx(style.backgroundSize);
      style.backgroundImage = scalePx(style.backgroundImage);
      if (style.backgroundPosition) style.backgroundPosition = scalePx(style.backgroundPosition);
    } else if (!style.backgroundSize) {
      const pct = (scale * 100).toFixed(1) + '%';
      style.backgroundSize  = `${pct} ${pct}`;
      style.backgroundImage = scalePx(style.backgroundImage);
    }
  }

  // Background color
  if (data.bgColor && data.bgColor !== DEFAULT_BG_COLOR) {
    style._bgColor = data.bgColor;
  }

  return style;
}

/**
 * Backward-compatible wrapper: accepts a stored string (JSON v2 or pipe format).
 */
export function patternToStyle(stored) {
  return wallpaperToStyle(parseWallpaper(stored));
}

// ── Validation ────────────────────────────────────────────────────────────────

/** Allowed gradient function prefixes (mirrors PatternValidator.java). */
const GRADIENT_PREFIX = /^\s*(linear-gradient|radial-gradient|conic-gradient|repeating-linear-gradient|repeating-radial-gradient)\s*\(/i;

/** Substrings that must never appear in custom CSS (mirrors PatternValidator.java). */
const BLOCKED = /url\s*\(|expression\s*\(|javascript\s*:|data\s*:|@import|[<>\\]|;|var\s*\(|env\s*\(|attr\s*\(/i;

/** Validate a raw CSS gradient string (the `css` field for custom patterns). */
export function isValidCustomCss(css) {
  if (!css || !css.trim()) return false;
  if (css.length > 2000) return false;
  if (BLOCKED.test(css)) return false;
  return GRADIENT_PREFIX.test(css);
}

/** Validate a full stored wallpaper string (JSON v2 or legacy). Used client-side only. */
export function isValidPattern(stored) {
  if (!stored || !stored.trim()) return true;
  const s = stored.trim();
  if (s.startsWith('{')) {
    try {
      const data = JSON.parse(s);
      return data.v === 2;
    } catch { return false; }
  }
  // Legacy pipe format
  if (s.length > 2000) return false;
  const { base } = _parseSegmentsLegacy(s);
  if (!base || base === 'none') return true;
  if (base in PRESET_COLOR_SLOTS) return true;
  if (base.startsWith('paw-print:')) return true;
  if (base.startsWith('stars:')) return true;
  if (BLOCKED.test(base)) return false;
  return GRADIENT_PREFIX.test(base);
}

// ── Legacy pipe parser (internal) ─────────────────────────────────────────────

function _parseSegmentsLegacy(value) {
  if (!value) return { base: '', bgColor: null, scale: 1 };
  const parts = value.split('|');
  const base  = parts[0];
  let bgColor = null;
  let scale   = 1;
  for (let i = 1; i < parts.length; i++) {
    const s = parts[i].trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(s))              bgColor = s;
    else if (/^scale:(\d+(?:\.\d+)?)$/.test(s))      scale   = parseFloat(RegExp.$1);
  }
  return { base, bgColor, scale };
}

// ── Legacy shims (kept for tests; not used internally) ────────────────────────

/** Returns the explicit |#hex bg-color suffix, or null if not set. */
export function extractBgColor(stored) {
  if (!stored) return null;
  const m = stored.match(/\|#([0-9a-fA-F]{3,8})(?:\||$)/);
  return m ? `#${m[1]}` : null;
}

/** Returns stored with any |#hex suffix removed. Leaves other content unchanged. */
export function stripBgColor(stored) {
  if (!stored) return null;
  return stored.replace(/\|#[0-9a-fA-F]{3,8}(?=\||$)/, '');
}

/** Returns the |scale:X suffix value, defaulting to 1. */
export function extractScale(stored) {
  if (!stored) return 1;
  const m = stored.match(/\|scale:(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 1;
}

export function findPresetByImage() { return null; } // no longer meaningful

// ══════════════════════════════════════════════════════════════════════════════
//  Colour maths — used by the picker to keep wallpapers legible
// ══════════════════════════════════════════════════════════════════════════════

/** Parses #rgb / #rrggbb into [r, g, b] 0-255, or null if unparseable. */
export function hexToRgb(hex) {
  if (typeof hex !== 'string') return null;
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/**
 * WCAG relative luminance, 0 (black) to 1 (white).
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function relativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG contrast ratio between two colours, 1 (identical) to 21 (black on white).
 * Returns null if either colour cannot be parsed.
 */
export function contrastRatio(hexA, hexB) {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  if (la === null || lb === null) return null;
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Below this ratio a pattern is effectively invisible against its background.
 * Not a WCAG text threshold — a wallpaper is decoration, and wants to sit well
 * below the 4.5:1 needed for body copy. This only catches the case where the
 * pattern has vanished entirely, which is what made the editor look broken.
 */
export const MIN_PATTERN_CONTRAST = 1.25;

/**
 * True when a wallpaper's pattern would be invisible against its own page
 * background — the black-paws-on-black-page case.
 */
export function isPatternInvisible(data) {
  if (!data || data.pattern === 'none' || data.pattern === 'custom') return false;
  const patternColor = data.colors?.[0];
  if (!patternColor) return false;
  const ratio = contrastRatio(patternColor, data.bgColor || DEFAULT_BG_COLOR);
  return ratio !== null && ratio < MIN_PATTERN_CONTRAST;
}

/**
 * Returns whichever of black/white reads better on the given background, so a
 * pattern colour picked automatically is always visible.
 */
export function readableInkFor(bgHex) {
  const lum = relativeLuminance(bgHex);
  if (lum === null) return '#000000';
  return lum > 0.42 ? '#1a1060' : '#f4f1ea';
}

// ── Randomiser ────────────────────────────────────────────────────────────────

/** Warm, palette-consistent backgrounds for the randomiser to draw from. */
const RANDOM_BACKGROUNDS = [
  '#ece9e2', '#f4f1ea', '#e8e4f5', '#f5ece4', '#e4eef0',
  '#f0e6d3', '#1a1832', '#2a2340', '#23302e', '#f7e9ef',
];

/** Ink colours that sit well on the backgrounds above. */
const RANDOM_INKS = [
  '#6c63ff', '#4b44cc', '#f5891c', '#3cc85c', '#d32f2f',
  '#1a1060', '#8880ff', '#c98b3c', '#2f7d6a', '#a03b6b',
];

function pick(arr, rand) { return arr[Math.floor(rand() * arr.length)]; }

/**
 * Builds a random wallpaper that is guaranteed legible: the ink is re-rolled
 * (and finally forced) until it has enough contrast with the background.
 *
 * `rand` is injectable so tests can make this deterministic.
 */
export function randomWallpaper(rand = Math.random) {
  const keys = Object.keys(PRESET_COLOR_SLOTS).filter(k => k !== 'none');
  const pattern = pick(keys, rand);
  const bgColor = pick(RANDOM_BACKGROUNDS, rand);

  let ink = pick(RANDOM_INKS, rand);
  for (let i = 0; i < 8 && contrastRatio(ink, bgColor) < 1.6; i++) {
    ink = pick(RANDOM_INKS, rand);
  }
  if (contrastRatio(ink, bgColor) < 1.6) ink = readableInkFor(bgColor);

  const slots = PRESET_COLOR_SLOTS[pattern] || [];
  const colors = slots.map((_, i) => (i === 0 ? ink : readableInkFor(bgColor)));

  return {
    v: 2,
    pattern,
    scale: Math.round((0.6 + rand() * 1.6) * 20) / 20,
    bgColor,
    colors,
  };
}
