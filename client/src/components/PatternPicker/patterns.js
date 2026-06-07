/**
 * Preset background patterns.
 *
 * Keys are stored in the database. CSS values are NEVER stored — they live
 * only here, so a compromised DB value can never inject CSS into the page.
 *
 * Preset values bypass all validation, so url() data URIs are safe to use.
 * Custom gradient strings must pass frontend + backend validation before saving.
 */

// Paw print pattern — pure CSS gradients matching maepigeon.com
export const PAW_DEFAULT_COLOR = 'rgba(0,0,0,0.85)';

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

const _c = PAW_DEFAULT_COLOR;
const _PAW_IMAGE = [
  `linear-gradient(-45deg,${_c} 7px,transparent 7px)`,
  `linear-gradient(45deg,${_c} 7px,transparent 7px)`,
  `linear-gradient(135deg,${_c} 7px,transparent 7px)`,
  `linear-gradient(-135deg,${_c} 7px,transparent 7px)`,
  `linear-gradient(-45deg,${_c} 7px,transparent 7px)`,
  `linear-gradient(45deg,${_c} 7px,transparent 7px)`,
  `linear-gradient(135deg,${_c} 7px,transparent 7px)`,
  `linear-gradient(-135deg,${_c} 7px,transparent 7px)`,
  `radial-gradient(circle,${_c} 7px,transparent 7px)`,
  `radial-gradient(circle,${_c} 7px,transparent 7px)`,
  `radial-gradient(circle,${_c} 7px,transparent 7px)`,
  `radial-gradient(circle,${_c} 7px,transparent 7px)`,
  `radial-gradient(circle,${_c} 4.67px,transparent 4.67px)`,
  `radial-gradient(circle,${_c} 4.67px,transparent 4.67px)`,
  `radial-gradient(circle,${_c} 4.67px,transparent 4.67px)`,
  `radial-gradient(circle,${_c} 4.67px,transparent 4.67px)`,
  `radial-gradient(circle,${_c} 4.67px,transparent 4.67px)`,
  `radial-gradient(circle,${_c} 4.67px,transparent 4.67px)`,
  `radial-gradient(circle,${_c} 4.67px,transparent 4.67px)`,
  `radial-gradient(circle,${_c} 4.67px,transparent 4.67px)`,
].join(',');

const _PAW_POSITION = [
  '76px 76px','76px 76px','76px 76px','76px 76px',
  '152px 152px','152px 152px','152px 152px','152px 152px',
  '-5.25px 5.25px','5.25px 5.25px',
  '70.75px 81.25px','81.25px 81.25px',
  '7px -15.75px','-7px -15.75px','-15.75px -5.25px','15.75px -5.25px',
  '83px 60.25px','69px 60.25px','60.25px 70.75px','91.75px 70.75px',
].join(', ');

// Starfield pattern — pure CSS radial gradients, no SVG
export const STARS_DEFAULT_COLOR = 'rgba(0,0,0,0.85)';
export const STARS_DEFAULT_BG = 'transparent';

export function starsImage(starColor, bgColor) {
  const c = starColor || STARS_DEFAULT_COLOR;
  const bg = bgColor || STARS_DEFAULT_BG;
  return [
    `radial-gradient(circle at 15% 25%, ${c} 1.5px, transparent 2px)`,
    `radial-gradient(circle at 35% 75%, ${c} 2px, transparent 2.5px)`,
    `radial-gradient(circle at 55% 5%, ${c} 1px, transparent 1.5px)`,
    `radial-gradient(circle at 65% 55%, ${c} 2.5px, transparent 3px)`,
    `radial-gradient(circle at 85% 35%, ${c} 1.5px, transparent 2px)`,
    `radial-gradient(circle at 10% 65%, ${c} 1px, transparent 1.5px)`,
    `radial-gradient(circle at 45% 40%, ${c} 2px, transparent 2.5px)`,
    `radial-gradient(circle at 75% 15%, ${c} 1px, transparent 1.5px)`,
    `radial-gradient(circle at 90% 80%, ${c} 2px, transparent 2.5px)`,
    `radial-gradient(circle at 25% 90%, ${c} 1.5px, transparent 2px)`,
    `linear-gradient(${bg}, ${bg})`,
  ].join(',');
}

export const PRESET_PATTERNS = {
  none: {
    label: 'None',
    backgroundImage: '',
    backgroundSize: 'auto',
  },
  dots: {
    label: 'Dots',
    backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.85) 1.8px, transparent 1.8px)',
    backgroundSize: '20px 20px',
  },
  grid: {
    label: 'Grid',
    backgroundImage:
      'linear-gradient(rgba(0,0,0,0.7) 1px, transparent 1px),' +
      'linear-gradient(90deg, rgba(0,0,0,0.7) 1px, transparent 1px)',
    backgroundSize: '24px 24px',
  },
  'diagonal-stripes': {
    label: 'Cross-hatch',
    backgroundImage:
      'repeating-linear-gradient(45deg, rgba(0,0,0,0.7), rgba(0,0,0,0.7) 1.5px, transparent 1.5px, transparent 14px),' +
      'repeating-linear-gradient(-45deg, rgba(0,0,0,0.7), rgba(0,0,0,0.7) 1.5px, transparent 1.5px, transparent 14px)',
    backgroundSize: 'auto',
  },
  checkerboard: {
    label: 'Checker',
    backgroundImage:
      'conic-gradient(rgba(0,0,0,0.82) 0.25turn, transparent 0.25turn 0.5turn, rgba(0,0,0,0.82) 0.5turn 0.75turn, transparent 0.75turn)',
    backgroundSize: '20px 20px',
  },
  notebook: {
    label: 'Notebook',
    backgroundImage:
      'repeating-linear-gradient(0deg, rgba(0,0,0,0.65) 0px, rgba(0,0,0,0.65) 1.5px, transparent 1.5px, transparent 22px)',
    backgroundSize: 'auto',
  },
  'paw-print': {
    label: 'Paws',
    backgroundImage: _PAW_IMAGE,
    backgroundSize: '152px 152px',
    backgroundPosition: _PAW_POSITION,
  },
  stars: {
    label: 'Stars',
    backgroundImage: starsImage(),
    backgroundSize: '120px 120px',
  },
};

/** Allowed gradient function prefixes for custom values (mirrors PatternValidator.java). */
const GRADIENT_PREFIX = /^\s*(linear-gradient|radial-gradient|conic-gradient|repeating-linear-gradient|repeating-radial-gradient)\s*\(/i;

/** Substrings that must never appear in a custom pattern (mirrors PatternValidator.java). */
const BLOCKED = /url\s*\(|expression\s*\(|javascript\s*:|data\s*:|@import|[<>\\]|;|var\s*\(|env\s*\(|attr\s*\(/i;

const COLOR_TOKEN_RE = /^(transparent|#[0-9a-fA-F]{3,8}|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*[\d.]+)?\s*\))$/i;

export function isValidPattern(value) {
  if (!value || value.trim() === '' || value.trim() === 'none') return true;
  if (value in PRESET_PATTERNS) return true;
  if (value.startsWith('paw-print:')) {
    return COLOR_TOKEN_RE.test(value.slice('paw-print:'.length).trim());
  }
  if (value.startsWith('stars:')) {
    const rest = value.slice('stars:'.length);
    const idx = rest.indexOf(':');
    const c1 = (idx >= 0 ? rest.slice(0, idx) : rest).trim();
    const c2 = idx >= 0 ? rest.slice(idx + 1).trim() : null;
    if (!COLOR_TOKEN_RE.test(c1)) return false;
    if (c2 && !COLOR_TOKEN_RE.test(c2)) return false;
    return true;
  }
  if (value.length > 2000) return false;
  if (BLOCKED.test(value)) return false;
  return GRADIENT_PREFIX.test(value);
}

/**
 * Resolves a stored pattern value to React inline style properties.
 * Safe to call with any value — invalid values produce no background.
 */
export function patternToStyle(value) {
  if (!value || value === 'none') return {};
  if (value in PRESET_PATTERNS) {
    const { backgroundImage, backgroundSize, backgroundPosition } = PRESET_PATTERNS[value];
    if (!backgroundImage) return {};
    const style = { backgroundImage, backgroundSize: backgroundSize || 'auto' };
    if (backgroundPosition) style.backgroundPosition = backgroundPosition;
    return style;
  }
  // Parameterized paw: "paw-print:COLOR" — preserves position and size
  if (value.startsWith('paw-print:')) {
    const color = value.slice('paw-print:'.length).trim();
    return {
      backgroundImage: pawImage(color),
      backgroundSize: '152px 152px',
      backgroundPosition: _PAW_POSITION,
    };
  }
  // Parameterized stars: "stars:STAR_COLOR" or "stars:STAR_COLOR:BG_COLOR"
  if (value.startsWith('stars:')) {
    const rest = value.slice('stars:'.length);
    const idx = rest.indexOf(':');
    const starColor = (idx >= 0 ? rest.slice(0, idx) : rest).trim();
    const bgColor = idx >= 0 ? rest.slice(idx + 1).trim() : STARS_DEFAULT_BG;
    return {
      backgroundImage: starsImage(starColor, bgColor),
      backgroundSize: '120px 120px',
    };
  }
  if (isValidPattern(value)) {
    // repeating-*-gradient handles its own tiling via stops — use auto so stops
    // determine the period. For other gradients, tile at 20px so the pattern
    // repeats visibly instead of stretching to fill the whole viewport.
    const isRepeating = /^\s*repeating-/i.test(value);
    return { backgroundImage: value, backgroundSize: isRepeating ? 'auto' : '20px 20px' };
  }
  return {};
}

/**
 * Find the preset key whose backgroundImage exactly matches the given CSS.
 * Used by the pattern picker test to resolve the full preset style.
 */
export function findPresetByImage(css) {
  for (const [key, preset] of Object.entries(PRESET_PATTERNS)) {
    if (preset.backgroundImage === css) return key;
  }
  return null;
}
