/**
 * Page themes: how a user's profile and posts look.
 *
 * A theme is plain data — fonts, colours, a page texture, a card style and a
 * few effects — and every preset below is just a theme. The custom editor
 * edits exactly these fields, so anything a preset does, a user's own theme
 * can do too.
 *
 * Values reach the page only as CSS custom properties and data attributes, and
 * only after sanitiseTheme(): keys from fixed lists, #rrggbb colours, clamped
 * numbers and booleans. The server applies the same rules (ThemeValidator.java).
 */

// ── Vocabulary ────────────────────────────────────────────────────────────────

export const FONTS = {
  'news-serif':  { label: 'Newsprint serif',  css: '"Old Standard TT", "Times New Roman", serif' },
  headline:      { label: 'Headline',         css: '"Playfair Display", Georgia, serif' },
  blackletter:   { label: 'Blackletter',      css: '"UnifrakturMaguntia", "Old English Text MT", serif' },
  fell:          { label: 'Old press',        css: '"IM Fell English", Georgia, serif' },
  typewriter:    { label: 'Typewriter',       css: '"Special Elite", "Courier New", monospace' },
  handwriting:   { label: 'Handwriting',      css: '"Caveat", "Bradley Hand", cursive' },
  marker:        { label: 'Marker',           css: '"Permanent Marker", "Marker Felt", cursive' },
  notebook:      { label: 'Notebook print',   css: '"Patrick Hand", "Comic Sans MS", cursive' },
  terminal:      { label: 'Terminal',         css: '"VT323", "Courier New", monospace' },
  mono:          { label: 'Modern mono',      css: '"JetBrains Mono", ui-monospace, Menlo, monospace' },
  // Samsung's Choco Cooky where the device has it (it is not licensed for the
  // web), otherwise Sniglet, a free font in the same round, bubbly spirit.
  cookie:        { label: 'Choco Cooky',      css: '"Choco cooky", "ChocoCooky", "Sniglet", "Arial Rounded MT Bold", sans-serif' },
  sans:          { label: 'Clean sans',       css: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
};

export const TEXTURES = {
  none:           'Plain colour',
  newsprint:      'Newsprint grain',
  cork:           'Cork board',
  graph:          'Graph paper',
  dots:           'Dot grid',
  scanlines:      'CRT scanlines',
  'rainbow-paws': 'Rainbow paw prints',
  wallpaper:      'My wallpaper',
};

export const BORDERS = { none: 'None', rule: 'Thin rule', double: 'Double rule', dashed: 'Dashed', glow: 'Neon glow', rainbow: 'Rainbow' };
export const SHADOWS = { none: 'None', soft: 'Soft', lifted: 'Lifted', curl: 'Paper curl', glow: 'Glow' };
export const LINES   = { none: 'None', ruled: 'Ruled lines', grid: 'Grid' };
export const PINS    = { none: 'None', tape: 'Tape', pin: 'Push pin' };
export const CASES   = { none: 'As typed', upper: 'UPPERCASE' };
export const EFFECTS = {
  glow:      'Glowing text',
  scanlines: 'Scanlines over the page',
  flicker:   'Screen flicker',
  rainbow:   'Rainbow headings',
  grain:     'Paper grain on cards',
};

// ── Presets ───────────────────────────────────────────────────────────────────

export const PRESETS = {
  newspaper: {
    label: 'Newspaper Life',
    blurb: 'Newsprint, ink and column rules. The default.',
    theme: {
      v: 1, preset: 'newspaper',
      page: { bg: '#eeede9', texture: 'newsprint', textureColor: '#000000', textureOpacity: 0.5 },
      type: { heading: 'headline', body: 'news-serif', ink: '#161616', headingInk: '#0b0b0b', accent: '#111111', headingCase: 'none', headingScale: 1.1 },
      card: { bg: '#fbfaf6', opacity: 1, border: 'double', borderColor: '#161616', radius: 0, shadow: 'none', lines: 'none', lineColor: '#9ab8d8', tilt: 0, pin: 'none' },
      fx:   { glow: false, scanlines: false, flicker: false, rainbow: false, grain: true },
    },
  },
  sticky: {
    label: 'Sticky Pad',
    blurb: 'Neon notes slapped on a studio wall.',
    theme: {
      v: 1, preset: 'sticky',
      page: { bg: '#bfe3ea', texture: 'dots', textureColor: '#2c6f7d', textureOpacity: 0.35 },
      type: { heading: 'marker', body: 'handwriting', ink: '#2a2a2a', headingInk: '#e4572e', accent: '#e4572e', headingCase: 'none', headingScale: 1.15 },
      card: { bg: '#fff27a', opacity: 1, border: 'none', borderColor: '#000000', radius: 2, shadow: 'curl', lines: 'none', lineColor: '#e8d64a', tilt: 2.2, pin: 'tape' },
      fx:   { glow: false, scanlines: false, flicker: false, rainbow: false, grain: false },
    },
  },
  notebook: {
    label: 'Notebook',
    blurb: 'Ruled pages, a red margin and blue biro.',
    theme: {
      v: 1, preset: 'notebook',
      page: { bg: '#2f3b4c', texture: 'graph', textureColor: '#ffffff', textureOpacity: 0.12 },
      type: { heading: 'handwriting', body: 'notebook', ink: '#1d2a6b', headingInk: '#1d2a6b', accent: '#d0342c', headingCase: 'none', headingScale: 1.3 },
      card: { bg: '#fffef6', opacity: 1, border: 'none', borderColor: '#000000', radius: 3, shadow: 'lifted', lines: 'ruled', lineColor: '#9ab8d8', tilt: 0, pin: 'none' },
      fx:   { glow: false, scanlines: false, flicker: false, rainbow: false, grain: false },
    },
  },
  corkboard: {
    label: 'Corkboard',
    blurb: 'Typed notes pinned up on real cork.',
    theme: {
      v: 1, preset: 'corkboard',
      page: { bg: '#b8834a', texture: 'cork', textureColor: '#3b2410', textureOpacity: 0.9 },
      type: { heading: 'marker', body: 'typewriter', ink: '#2a2118', headingInk: '#1e1812', accent: '#c0392b', headingCase: 'none', headingScale: 1.05 },
      card: { bg: '#fffdf4', opacity: 1, border: 'none', borderColor: '#000000', radius: 1, shadow: 'lifted', lines: 'none', lineColor: '#9ab8d8', tilt: 1.4, pin: 'pin' },
      fx:   { glow: false, scanlines: false, flicker: false, rainbow: false, grain: true },
    },
  },
  neon: {
    label: 'Neon Terminal',
    blurb: 'Phosphor green on black, humming.',
    theme: {
      v: 1, preset: 'neon',
      page: { bg: '#04060a', texture: 'scanlines', textureColor: '#39ff14', textureOpacity: 0.18 },
      type: { heading: 'terminal', body: 'terminal', ink: '#39ff14', headingInk: '#00f0ff', accent: '#ff2bd6', headingCase: 'upper', headingScale: 1.35 },
      card: { bg: '#060c10', opacity: 0.88, border: 'glow', borderColor: '#39ff14', radius: 4, shadow: 'glow', lines: 'none', lineColor: '#39ff14', tilt: 0, pin: 'none' },
      fx:   { glow: true, scanlines: true, flicker: true, rainbow: false, grain: false },
    },
  },
  paw: {
    label: 'Pawprint Phenomenon',
    blurb: 'Rainbow paws everywhere, round and squishy.',
    theme: {
      v: 1, preset: 'paw',
      page: { bg: '#fff4fb', texture: 'rainbow-paws', textureColor: '#ff6fb5', textureOpacity: 0.85 },
      type: { heading: 'cookie', body: 'cookie', ink: '#4a2b5c', headingInk: '#7a2ea0', accent: '#ff4f9a', headingCase: 'none', headingScale: 1.2 },
      card: { bg: '#ffffff', opacity: 0.92, border: 'rainbow', borderColor: '#ff6fb5', radius: 26, shadow: 'soft', lines: 'none', lineColor: '#ffd1ea', tilt: 0, pin: 'none' },
      fx:   { glow: false, scanlines: false, flicker: false, rainbow: true, grain: false },
    },
  },
};

export const DEFAULT_THEME = PRESETS.newspaper.theme;

// ── Sanitising ────────────────────────────────────────────────────────────────

const HEX = /^#[0-9a-fA-F]{6}$/;
const oneOf = (v, list, fallback) => (typeof v === 'string' && Object.hasOwn(list, v) ? v : fallback);
const colour = (v, fallback) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : fallback);
const number = (v, lo, hi, fallback) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
const PRESET_KEYS = { ...PRESETS, custom: true };

/** A theme made only of known values. Anything else falls back to Newspaper Life's. */
export function sanitiseTheme(raw) {
  const d = DEFAULT_THEME;
  const t = raw && typeof raw === 'object' ? raw : {};
  const page = t.page || {}, type = t.type || {}, card = t.card || {}, fx = t.fx || {};
  return {
    v: 1,
    preset: oneOf(t.preset, PRESET_KEYS, 'custom'),
    page: {
      bg: colour(page.bg, d.page.bg),
      texture: oneOf(page.texture, TEXTURES, 'none'),
      textureColor: colour(page.textureColor, d.page.textureColor),
      textureOpacity: number(page.textureOpacity, 0, 1, 0.5),
    },
    type: {
      heading: oneOf(type.heading, FONTS, d.type.heading),
      body: oneOf(type.body, FONTS, d.type.body),
      ink: colour(type.ink, d.type.ink),
      headingInk: colour(type.headingInk, d.type.headingInk),
      accent: colour(type.accent, d.type.accent),
      headingCase: oneOf(type.headingCase, CASES, 'none'),
      headingScale: number(type.headingScale, 0.7, 1.8, 1),
    },
    card: {
      bg: colour(card.bg, d.card.bg),
      opacity: number(card.opacity, 0, 1, 1),
      border: oneOf(card.border, BORDERS, 'rule'),
      borderColor: colour(card.borderColor, d.card.borderColor),
      radius: number(card.radius, 0, 28, 0),
      shadow: oneOf(card.shadow, SHADOWS, 'none'),
      lines: oneOf(card.lines, LINES, 'none'),
      lineColor: colour(card.lineColor, d.card.lineColor),
      tilt: number(card.tilt, 0, 5, 0),
      pin: oneOf(card.pin, PINS, 'none'),
    },
    fx: Object.fromEntries(Object.keys(EFFECTS).map(k => [k, fx[k] === true])),
  };
}

// ── Applying ──────────────────────────────────────────────────────────────────
//
// Everything becomes a CSS custom property, including the choices that switch
// rules on and off (border style, pins, effects). Variables inherit and the
// nearest one wins, so a preview box in Settings can show a different theme
// from the page around it. Attributes on <html> could not do that.

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

const RAINBOW = 'linear-gradient(115deg, #ff5e8a, #ffa45c, #ffe45c, #6ef29c, #5ec8ff, #a98bff, #ff5e8a)';
// Deeper stops for rainbow text, so every colour stays readable on a light card.
const RAINBOW_INK = 'linear-gradient(90deg, #e0245e, #e8670c, #c49000, #189a52, #1a7fd0, #7442d6, #e0245e)';

function cardBorders(t) {
  const c = t.card.borderColor;
  switch (t.card.border) {
    case 'rule':    return ['1px solid ' + c, '1px solid ' + c, '1px solid ' + c];
    case 'double':  return ['4px double ' + c, '0 none', '1px solid ' + c];
    case 'dashed':  return ['2px dashed ' + c, '2px dashed ' + c, '2px dashed ' + c];
    case 'glow':    return ['1.5px solid ' + c, '1.5px solid ' + c, '1.5px solid ' + c];
    case 'rainbow': return ['4px solid transparent', '4px solid transparent', '4px solid transparent'];
    default:        return ['0 none', '0 none', '0 none'];
  }
}

function cardShadow(t) {
  const rgb = hexToRgb(t.card.borderColor);
  const glow = `0 0 6px rgba(${rgb}, 0.9), 0 0 24px rgba(${rgb}, 0.35), inset 0 0 16px rgba(${rgb}, 0.16)`;
  const byShadow = {
    none: 'none',
    soft: '0 6px 24px rgba(0, 0, 0, 0.12)',
    lifted: '0 2px 3px rgba(0, 0, 0, 0.25), 0 14px 28px rgba(0, 0, 0, 0.28)',
    curl: '0 1px 1px rgba(0, 0, 0, 0.12), 6px 16px 16px -8px rgba(0, 0, 0, 0.35), -6px 16px 16px -10px rgba(0, 0, 0, 0.2)',
    glow,
  }[t.card.shadow];
  if (t.card.border === 'glow' && t.card.shadow !== 'glow') return byShadow === 'none' ? glow : `${glow}, ${byShadow}`;
  return byShadow;
}

function cardBackground(t) {
  const fill = `rgba(${hexToRgb(t.card.bg)}, ${t.card.opacity})`;
  const lines = {
    none: [],
    ruled: [
      'linear-gradient(90deg, transparent 38px, rgba(208, 52, 44, 0.55) 38px 40px, transparent 40px)',
      `repeating-linear-gradient(to bottom, transparent 0 27px, ${t.card.lineColor} 27px 28px)`,
    ],
    grid: [
      `linear-gradient(${t.card.lineColor} 1px, transparent 1px) 0 0 / 20px 20px`,
      `linear-gradient(90deg, ${t.card.lineColor} 1px, transparent 1px) 0 0 / 20px 20px`,
    ],
  }[t.card.lines].map(l => `${l} padding-box`);
  if (t.card.border === 'rainbow') {
    return [...lines, `linear-gradient(${fill}, ${fill}) padding-box`, `${RAINBOW} 0 0 / 300% 100% border-box`].join(', ');
  }
  return [...lines, `linear-gradient(${fill}, ${fill}) padding-box`].join(', ');
}

const PIN_STYLES = {
  none: { display: 'none' },
  tape: {
    display: 'block', w: '96px', h: '26px', top: '-12px', ml: '-48px', radius: '1px', rotate: '-3deg',
    bg: 'rgba(255, 255, 255, 0.55)', shadow: '0 1px 3px rgba(0, 0, 0, 0.15)',
  },
  pin: {
    display: 'block', w: '18px', h: '18px', top: '-7px', ml: '-9px', radius: '50%', rotate: '0deg',
    shadow: '1px 4px 4px rgba(0, 0, 0, 0.45)',
  },
};

/** The custom properties a theme sets. Every value is built from sanitised input. */
export function themeVariables(theme) {
  const t = sanitiseTheme(theme);
  const [top, side, bottom] = cardBorders(t);
  const pin = PIN_STYLES[t.card.pin];
  const accentRgb = hexToRgb(t.type.accent);
  return {
    '--th-page-bg': t.page.bg,
    '--th-texture-rgb': hexToRgb(t.page.textureColor),
    '--th-texture-opacity': String(t.page.textureOpacity),
    '--th-font-heading': FONTS[t.type.heading].css,
    '--th-font-body': FONTS[t.type.body].css,
    '--th-ink': t.type.ink,
    '--th-heading-ink': t.fx.rainbow ? 'transparent' : t.type.headingInk,
    '--th-heading-bg': t.fx.rainbow ? RAINBOW_INK : 'none',
    '--th-heading-anim': t.fx.rainbow ? 'th-rainbow-drift' : 'none',
    '--th-accent': t.type.accent,
    '--th-heading-case': t.type.headingCase === 'upper' ? 'uppercase' : 'none',
    '--th-heading-scale': String(t.type.headingScale),
    '--th-text-glow': t.fx.glow ? `0 0 4px currentColor, 0 0 14px rgba(${accentRgb}, 0.45)` : 'none',
    '--th-card-background': cardBackground(t),
    '--th-card-border-top': top,
    '--th-card-border-side': side,
    '--th-card-border-bottom': bottom,
    '--th-card-shadow': cardShadow(t),
    '--th-card-radius': `${t.card.radius}px`,
    '--th-card-radius-curl': t.card.shadow === 'curl' ? '40px 6px' : `${t.card.radius}px`,
    '--th-card-anim': t.card.border === 'rainbow' ? 'th-rainbow-drift' : 'none',
    '--th-tilt': `${t.card.tilt}deg`,
    '--th-pin-display': pin.display,
    '--th-pin-w': pin.w || '0',
    '--th-pin-h': pin.h || '0',
    '--th-pin-top': pin.top || '0',
    '--th-pin-ml': pin.ml || '0',
    '--th-pin-radius': pin.radius || '0',
    '--th-pin-rotate': pin.rotate || '0deg',
    '--th-pin-bg': t.card.pin === 'pin'
      ? `radial-gradient(circle at 35% 32%, #ff8a80 0 18%, ${t.type.accent} 42%, rgba(0, 0, 0, 0.55) 100%)`
      : (pin.bg || 'none'),
    '--th-pin-shadow': pin.shadow || 'none',
    '--th-grain-opacity': t.fx.grain ? '0.07' : '0',
  };
}

/** Inline style object for a React element (a preview box). */
export function themeStyle(theme) {
  return themeVariables(theme);
}

/**
 * Puts a theme's variables on <html>; returns a function that removes them.
 *
 * `isDefault` is the site's own Newspaper Life rather than a theme someone
 * chose. A profile with no theme keeps showing its wallpaper, so the default
 * never hides it; a chosen theme does unless its texture is "My wallpaper".
 */
export function applyThemeToDocument(theme, { isDefault = false } = {}) {
  const root = document.documentElement;
  const t = sanitiseTheme(theme);
  const vars = themeVariables(t);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  // The author's wallpaper is drawn on <body>, above the theme's backdrop, so
  // it has to step aside unless the theme asks for it.
  root.toggleAttribute('data-th-hide-wallpaper', !isDefault && t.page.texture !== 'wallpaper');
  return () => {
    for (const k of Object.keys(vars)) root.style.removeProperty(k);
    root.removeAttribute('data-th-hide-wallpaper');
  };
}
