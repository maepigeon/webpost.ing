/**
 * Page themes: how a user's profile and posts look.
 *
 * A theme's pictures are tile grids, made in the same designer as the grids in
 * posts: the page background and the card texture are wallpapers, and the
 * sticker pinned to each card (a push pin, a strip of tape) is a small grid.
 * The rest is fonts, colours, a card shape and a few effects.
 *
 * Every preset below is just a theme built from those pieces, so anything a
 * preset does, a user's own theme can do too — and a preset's pictures can be
 * opened in the designer and redrawn.
 *
 * Values reach the page only as CSS custom properties, and only after
 * sanitiseTheme(): keys from fixed lists, #rrggbb colours, clamped numbers,
 * booleans, and grids checked by normaliseGrid. The server applies the same
 * rules (ThemeValidator.java).
 */
import { sanitiseWallpaper, textureWallpaper } from '../TileArt/wallpaper.js';
import { STICKERS } from '../TileArt/stickers.js';
import { normaliseGrid } from '../Pages/Posts/PostRenderer/RichTextPost/TileGrid/tileGrid.js';

// ── Vocabulary ────────────────────────────────────────────────────────────────

export const FONTS = {
  'news-serif':  { label: 'Newsprint serif',  css: '"Old Standard TT", "Times New Roman", serif' },
  headline:      { label: 'Headline',         css: '"Playfair Display", Georgia, serif' },
  blackletter:   { label: 'Blackletter',      css: '"UnifrakturMaguntia", "Old English Text MT", serif' },
  fell:          { label: 'Old press',        css: '"IM Fell English", Georgia, serif' },
  typewriter:    { label: 'Typewriter',       css: '"Special Elite", "Courier New", monospace' },
  marker:        { label: 'Marker',           css: '"Permanent Marker", "Marker Felt", cursive' },
  notebook:      { label: 'Notebook print',   css: '"Patrick Hand", "Comic Sans MS", cursive' },
  terminal:      { label: 'Terminal',         css: '"VT323", "Courier New", monospace' },
  mono:          { label: 'Modern mono',      css: '"JetBrains Mono", ui-monospace, Menlo, monospace' },
  // Samsung's Choco Cooky, served with the site (index.css @font-face);
  // Sniglet, in the same round, bubbly spirit, while it loads.
  cookie:        { label: 'Choco Cooky',      css: '"Choco cooky", "ChocoCooky", "Sniglet", "Arial Rounded MT Bold", sans-serif' },
  cooljazz:      { label: 'Cool Jazz',        css: '"Cool jazz", "CoolJazz", "Cooljazz", "Patrick Hand", "Comic Neue", cursive' },
  // Comic Sans and Papyrus are system fonts: shown where the device has them
  // (they are not licensed for the web), otherwise the closest free font.
  comic:         { label: 'Comic Sans',       css: '"Comic Sans MS", "Comic Neue", "Chalkboard SE", "Patrick Hand", cursive' },
  papyrus:       { label: 'Papyrus',          css: 'Papyrus, Herculanum, "Luminari", "IM Fell English", fantasy' },
  // Free Google Fonts (index.html). Tinos is metric-compatible with Times New Roman.
  times:         { label: 'Times New Roman',  css: '"Times New Roman", Times, "Tinos", "Liberation Serif", serif' },
  outfit:        { label: 'Outfit',           css: '"Outfit", system-ui, "Segoe UI", sans-serif' },
  nunito:        { label: 'Nunito',           css: '"Nunito", "Varela Round", system-ui, sans-serif' },
  plexmono:      { label: 'Plex Mono',        css: '"IBM Plex Mono", "JetBrains Mono", ui-monospace, Menlo, monospace' },
  orbitron:      { label: 'Orbitron',         css: '"Orbitron", "Eurostile", "Arial Black", sans-serif' },
  caveat:        { label: 'Caveat',           css: '"Caveat", "Patrick Hand", "Comic Sans MS", cursive' },
  bebas:         { label: 'Bebas Neue',       css: '"Bebas Neue", Impact, "Arial Narrow", sans-serif' },
  // Free look-alikes for fonts that could not be hosted (see guide/fonts-dafont-licences.md).
  josefin:       { label: 'Josefin Sans',     css: '"Josefin Sans", "Century Gothic", sans-serif' },
  pirata:        { label: 'Pirata One',       css: '"Pirata One", "UnifrakturMaguntia", serif' },
  sacramento:    { label: 'Sacramento',       css: '"Sacramento", "Great Vibes", cursive' },
  pixelify:      { label: 'Pixelify Sans',    css: '"Pixelify Sans", "VT323", monospace' },
  rubikdirt:     { label: 'Rubik Dirt',       css: '"Rubik Dirt", "Permanent Marker", sans-serif' },
  sans:          { label: 'Clean sans',       css: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
};

/** Themes saved with the old Handwriting font now use Choco Cooky, which replaced it. */
const legacyFont = (id) => (id === 'handwriting' ? 'cookie' : id);

export const BORDERS = { none: 'None', rule: 'Thin rule', double: 'Double rule', dashed: 'Dashed', glow: 'Neon glow', rainbow: 'Rainbow' };
export const SHADOWS = { none: 'None', soft: 'Soft', lifted: 'Lifted', curl: 'Paper curl', glow: 'Glow' };
export const CASES   = { none: 'As typed', upper: 'UPPERCASE' };
export const EFFECTS = {
  glow:      'Glowing text',
  scanlines: 'Scanlines over the page',
  flicker:   'Screen flicker',
  rainbow:   'Rainbow headings',
};

/** Largest sticker, in grid tiles on a side. */
export const MAX_STICKER_TILES = 4;

// ── Presets ───────────────────────────────────────────────────────────────────
// Built on first use: their pictures are drawn with a canvas.

function buildPresets() {
  return {
    newspaper: {
      label: 'Newspaper Life',
      blurb: 'Cream newsprint on a halftone page, with a red pen for links. The default.',
      theme: {
        v: 2, preset: 'newspaper',
        page: { wallpaper: textureWallpaper('halftone', { cols: 4, rows: 4, scale: 2, bg: '#e6e2d6' }), useProfileWallpaper: false },
        type: { heading: 'headline', body: 'news-serif', ink: '#1b1a17', headingInk: '#0b0b0b', accent: '#111111', link: '#9b1c1c', headingCase: 'none', headingScale: 1.15 },
        card: { bg: '#fbf8ee', opacity: 1, border: 'double', borderColor: '#1b1a17', radius: 0, shadow: 'soft', texture: null, sticker: null },
        fx: { glow: false, scanlines: false, flicker: false, rainbow: false },
      },
    },
    sticky: {
      label: 'Sticky Pad',
      blurb: 'Yellow notes taped to a green cutting mat.',
      theme: {
        v: 2, preset: 'sticky',
        page: { wallpaper: textureWallpaper('mat', { cols: 4, rows: 4, scale: 2, bg: '#2c6e5d' }), useProfileWallpaper: false },
        type: { heading: 'caveat', body: 'nunito', ink: '#2b2a22', headingInk: '#1f1e18', accent: '#1f6f5c', link: '#c2410c', headingCase: 'none', headingScale: 1.5 },
        // A flat note in the colour of the real thing, lifted off the mat, with a strip of tape.
        card: { bg: '#ffef8a', opacity: 1, border: 'none', borderColor: '#000000', radius: 1, shadow: 'lifted', texture: null, sticker: STICKERS.tape.make() },
        fx: { glow: false, scanlines: false, flicker: false, rainbow: false },
      },
    },
    notebook: {
      label: 'Notebook',
      blurb: 'Ruled pages in blue biro, open on a wooden desk.',
      theme: {
        v: 2, preset: 'notebook',
        page: { wallpaper: textureWallpaper('wood', { cols: 8, rows: 8, scale: 2, bg: '#8a6138' }), useProfileWallpaper: false },
        type: { heading: 'cookie', body: 'notebook', ink: '#1d2a6b', headingInk: '#16205a', accent: '#1d2a6b', link: '#d0342c', headingCase: 'none', headingScale: 1.3 },
        card: {
          bg: '#fffef6', opacity: 1, border: 'none', borderColor: '#000000', radius: 3, shadow: 'lifted',
          // One tile wide: narrow enough that the texture leaves out its red
          // margin, which a repeating tile would draw again and again across the card.
          texture: textureWallpaper('notebook', { cols: 1, rows: 2, scale: 1, bg: '#fffef6' }),
          sticker: null,
        },
        fx: { glow: false, scanlines: false, flicker: false, rainbow: false },
      },
    },
    corkboard: {
      label: 'Corkboard',
      blurb: 'Typed notes pinned up on real cork.',
      theme: {
        v: 2, preset: 'corkboard',
        page: { wallpaper: textureWallpaper('cork', { cols: 8, rows: 8, scale: 2, bg: '#b8834a' }), useProfileWallpaper: false },
        type: { heading: 'marker', body: 'typewriter', ink: '#2a2118', headingInk: '#1e1812', accent: '#c0392b', headingCase: 'none', headingScale: 1.05 },
        card: {
          bg: '#fffdf4', opacity: 1, border: 'none', borderColor: '#000000', radius: 1, shadow: 'lifted',
          texture: null, sticker: STICKERS.pin.make(),
        },
        fx: { glow: false, scanlines: false, flicker: false, rainbow: false },
      },
    },
    neon: {
      label: 'Neon Terminal',
      blurb: 'Soft green type on midnight blue, lit in cyan and pink.',
      theme: {
        v: 2, preset: 'neon',
        page: { wallpaper: textureWallpaper('night', { cols: 4, rows: 4, scale: 2, bg: '#070b1c' }), useProfileWallpaper: false },
        type: { heading: 'orbitron', body: 'plexmono', ink: '#b6ffcf', headingInk: '#4de3ff', accent: '#4de3ff', link: '#ff7ad9', headingCase: 'upper', headingScale: 1.15 },
        card: { bg: '#0b1230', opacity: 0.9, border: 'glow', borderColor: '#4de3ff', radius: 6, shadow: 'glow', texture: null, sticker: null },
        // Text glow blurs small mono body text; the card's own glow border and shadow stay.
        fx: { glow: false, scanlines: false, flicker: false, rainbow: false },
      },
    },
    paw: {
      label: 'Pawprint Phenomenon',
      blurb: 'Rainbow pawprints on plum, each card stamped with one.',
      theme: {
        v: 2, preset: 'paw',
        page: { wallpaper: textureWallpaper('paws', { cols: 8, rows: 8, scale: 2, bg: '#140d1c', options: { background: '#140d1c' } }), useProfileWallpaper: false },
        type: { heading: 'cookie', body: 'cookie', ink: '#f4eefc', headingInk: '#ff7fa8', accent: '#ffb86b', link: '#7fd4ff', headingCase: 'none', headingScale: 1.2 },
        card: { bg: '#221830', opacity: 1, border: 'rule', borderColor: '#ff7fa8', radius: 22, shadow: 'lifted', texture: null, sticker: STICKERS.paw.make() },
        fx: { glow: false, scanlines: false, flicker: false, rainbow: false },
      },
    },
    sand: {
      label: 'Sand',
      blurb: 'Notes left on warm sand.',
      theme: {
        v: 2, preset: 'sand',
        page: { wallpaper: textureWallpaper('sand', { cols: 8, rows: 8, scale: 2, bg: '#d6b57c' }), useProfileWallpaper: false },
        type: { heading: 'marker', body: 'typewriter', ink: '#3a2c1a', headingInk: '#2c2012', accent: '#8a5a1c', link: '#b4531a', headingCase: 'none', headingScale: 1.05 },
        card: { bg: '#fffaf0', opacity: 1, border: 'none', borderColor: '#000000', radius: 2, shadow: 'soft', texture: null, sticker: null },
        fx: { glow: false, scanlines: false, flicker: false, rainbow: false },
      },
    },
    oak: {
      label: 'Oak',
      blurb: 'Paper on an oak table.',
      theme: {
        v: 2, preset: 'oak',
        page: { wallpaper: textureWallpaper('oak', { cols: 8, rows: 8, scale: 2, bg: '#cfa468' }), useProfileWallpaper: false },
        type: { heading: 'headline', body: 'news-serif', ink: '#2a2118', headingInk: '#1e1812', accent: '#6b4a1f', link: '#9b3d12', headingCase: 'none', headingScale: 1.1 },
        card: { bg: '#fffdf6', opacity: 1, border: 'rule', borderColor: '#d8c7a6', radius: 2, shadow: 'lifted', texture: null, sticker: null },
        fx: { glow: false, scanlines: false, flicker: false, rainbow: false },
      },
    },
  };
}

let presets = null;
/** The preset themes, built on first use. */
export function getPresets() {
  if (!presets) presets = buildPresets();
  return presets;
}

/** Newspaper Life: the site default. */
export const defaultTheme = () => getPresets().newspaper.theme;

// ── Sanitising ────────────────────────────────────────────────────────────────

const HEX = /^#[0-9a-fA-F]{6}$/;
const PRESET_KEYS = ['newspaper', 'sticky', 'notebook', 'corkboard', 'neon', 'paw', 'sand', 'oak', 'custom'];
const oneOf = (v, list, fallback) => (typeof v === 'string' && (Array.isArray(list) ? list.includes(v) : Object.hasOwn(list, v)) ? v : fallback);
const colour = (v, fallback) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : fallback);
const number = (v, lo, hi, fallback) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

function cleanSticker(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const g = normaliseGrid(raw);
  g.cols = Math.min(g.cols, MAX_STICKER_TILES);
  g.rows = Math.min(g.rows, MAX_STICKER_TILES);
  return g;
}

/** A theme made only of known values. Anything else falls back to Newspaper Life's. */
export function sanitiseTheme(raw) {
  const d = {
    type: { heading: 'headline', body: 'news-serif', ink: '#161616', headingInk: '#0b0b0b', accent: '#111111' },
    card: { bg: '#fbfaf6', borderColor: '#161616' },
  };
  const t = raw && typeof raw === 'object' ? raw : {};
  const page = t.page || {}, type = t.type || {}, card = t.card || {}, fx = t.fx || {};
  return {
    v: 2,
    preset: oneOf(t.preset, PRESET_KEYS, 'custom'),
    page: {
      wallpaper: sanitiseWallpaper(page.wallpaper),
      useProfileWallpaper: page.useProfileWallpaper === true,
    },
    type: {
      heading: oneOf(legacyFont(type.heading), FONTS, d.type.heading),
      body: oneOf(legacyFont(type.body), FONTS, d.type.body),
      ink: colour(type.ink, d.type.ink),
      headingInk: colour(type.headingInk, d.type.headingInk),
      accent: colour(type.accent, d.type.accent),
      // Links take the accent unless they are given a colour of their own.
      link: colour(type.link, colour(type.accent, d.type.accent)),
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
      texture: sanitiseWallpaper(card.texture),
      sticker: cleanSticker(card.sticker),
    },
    fx: Object.fromEntries(Object.keys(EFFECTS).map(k => [k, fx[k] === true
      // Neon Terminal no longer has scanlines (Mae, 2026-10-01). A theme still
      // saved as the untouched preset drops them too; editing a theme makes it
      // 'custom', so one that asks for scanlines on purpose keeps them.
      && !(k === 'scanlines' && t.preset === 'neon')])),
  };
}

// ── Applying ──────────────────────────────────────────────────────────────────
//
// Everything becomes a CSS custom property, including the choices that switch
// rules on and off (border style, sticker, effects). Variables inherit and the
// nearest one wins, so a preview box in Settings can show a different theme
// from the page around it.
//
// The pictures are drawn asynchronously (wallpaper.js). `images` carries them
// once ready: { card: {backgroundImage, backgroundSize, backgroundRepeat},
// sticker: {url, width, height} }. Until then the card is its plain colour.

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

/** Relative luminance of a #rrggbb colour (WCAG). */
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two #rrggbb colours, from 1 (the same) to 21. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Below this against the card, text counts as unreadable and is replaced. */
const READABLE = 2.5;

/**
 * A text colour that can be read on the card: the one chosen if it can be,
 * otherwise `fallback`, otherwise black or white. A theme with a black card
 * and a forgotten dark accent still shows its links.
 */
export function readableOn(colour, card, fallback = null) {
  if (contrast(colour, card) >= READABLE) return colour;
  if (fallback && contrast(fallback, card) >= READABLE) return fallback;
  return luminance(card) > 0.4 ? '#111111' : '#f2f2f2';
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

function cardBackground(t, texture) {
  const fill = `rgba(${hexToRgb(t.card.bg)}, ${t.card.opacity})`;
  const layers = [];
  if (texture?.backgroundImage) {
    const size = texture.backgroundSize || 'auto';
    const repeat = texture.backgroundRepeat || 'repeat';
    layers.push(`${texture.backgroundImage} 0 0 / ${size} ${repeat} padding-box`);
  }
  layers.push(`linear-gradient(${fill}, ${fill}) padding-box`);
  if (t.card.border === 'rainbow') layers.push(`${RAINBOW} 0 0 / 300% 100% border-box`);
  return layers.join(', ');
}

/** The custom properties a theme sets. Every value is built from sanitised input. */
export function themeVariables(theme, images = {}) {
  const t = sanitiseTheme(theme);
  const [top, side, bottom] = cardBorders(t);
  const accentRgb = hexToRgb(t.type.accent);
  const sticker = t.card.sticker && images.sticker;
  // Text is drawn on the card, so each text colour is checked against it.
  // The card's surface is its colour, or under a texture the texture's
  // measured colour (images.card.colour, once drawn). When that isn't known,
  // or the card is mostly see-through, the colours chosen are left alone.
  const surface = t.card.opacity < 0.6 ? null
    : t.card.texture ? (/^#[0-9a-f]{6}$/i.test(images.card?.colour || '') ? images.card.colour : null)
    : t.card.bg;
  const ink = surface ? readableOn(t.type.ink, surface) : t.type.ink;
  const headingInk = surface ? readableOn(t.type.headingInk, surface, ink) : t.type.headingInk;
  const accent = surface ? readableOn(t.type.accent, surface, ink) : t.type.accent;
  const link = surface ? readableOn(t.type.link, surface, ink) : t.type.link;
  return {
    '--th-font-heading': FONTS[t.type.heading].css,
    '--th-font-body': FONTS[t.type.body].css,
    '--th-ink': ink,
    '--th-heading-ink': t.fx.rainbow ? 'transparent' : headingInk,
    '--th-heading-bg': t.fx.rainbow ? RAINBOW_INK : 'none',
    '--th-heading-anim': t.fx.rainbow ? 'th-rainbow-drift' : 'none',
    '--th-accent': accent,
    '--th-link': link,
    // Red for Delete: the usual one, or a lighter one on a dark card.
    '--th-danger': !surface || contrast('#c62828', surface) >= 4.5 ? '#c62828' : '#ff8a80',
    '--th-heading-case': t.type.headingCase === 'upper' ? 'uppercase' : 'none',
    '--th-heading-scale': String(t.type.headingScale),
    '--th-text-glow': t.fx.glow ? `0 0 4px currentColor, 0 0 14px rgba(${accentRgb}, 0.45)` : 'none',
    '--th-card-background': cardBackground(t, t.card.texture ? images.card : null),
    // The card as one flat colour, for text drawn on an ink-filled control.
    '--th-card-solid': surface || t.card.bg,
    '--th-card-border-top': top,
    '--th-card-border-side': side,
    '--th-card-border-bottom': bottom,
    '--th-card-shadow': cardShadow(t),
    '--th-card-radius': `${t.card.radius}px`,
    '--th-card-radius-curl': t.card.shadow === 'curl' ? '40px 6px' : `${t.card.radius}px`,
    '--th-card-anim': t.card.border === 'rainbow' ? 'th-rainbow-drift' : 'none',
    '--th-sticker-display': sticker ? 'block' : 'none',
    '--th-sticker-image': sticker ? `url(${images.sticker.url})` : 'none',
    '--th-sticker-w': sticker ? `${images.sticker.width}px` : '0px',
    '--th-sticker-h': sticker ? `${images.sticker.height}px` : '0px',
  };
}

/**
 * Puts a theme's variables on <html>; returns a function that removes them.
 *
 * `isDefault` is the site's own Newspaper Life rather than a theme someone
 * chose. A profile with no theme keeps showing its wallpaper, so the default
 * never hides it; a chosen theme does unless it asks to use the wallpaper.
 */
export function applyThemeToDocument(theme, images = {}, { isDefault = false } = {}) {
  const root = document.documentElement;
  const t = sanitiseTheme(theme);
  const vars = themeVariables(t, images);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.toggleAttribute('data-th-hide-wallpaper', !isDefault && !t.page.useProfileWallpaper);
  return () => {
    for (const k of Object.keys(vars)) root.style.removeProperty(k);
    root.removeAttribute('data-th-hide-wallpaper');
  };
}
