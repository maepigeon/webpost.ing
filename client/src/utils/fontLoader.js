/**
 * Web fonts, loaded when something on the page needs them.
 *
 * The site's own text is system-ui. The Google fonts below are for page
 * themes, post text and grid typefaces, so each one's stylesheet is added to
 * <head> the first time a family is asked for, instead of ~25 families
 * blocking every page load (index.html keeps only the preconnects).
 *
 * Families that are not in the table (system fonts, Choco Cooky and Cool Jazz,
 * which index.css serves itself) are ignored. Nothing here throws.
 */

/** Google Fonts family -> the axes part of its css2 request (weights and italics used on the site). */
export const GOOGLE_FONTS = {
  'Bebas Neue': '',
  'Caveat': ':wght@500;700',
  'Comic Neue': ':wght@400;700',
  'Great Vibes': '',
  'IM Fell English': ':ital@0;1',
  'IBM Plex Mono': ':wght@400;500;700',
  'Josefin Sans': ':wght@300;400;600',
  'JetBrains Mono': ':wght@400;500;700',
  'Nunito': ':wght@400;700;800',
  'Old Standard TT': ':ital,wght@0,400;0,700;1,400',
  'Orbitron': ':wght@500;700',
  'Outfit': ':wght@400;600;700',
  'Patrick Hand': '',
  'Permanent Marker': '',
  'Pixelify Sans': ':wght@400;700',
  'Pirata One': '',
  'Playfair Display': ':ital,wght@0,700;0,900;1,700',
  'Rubik Dirt': '',
  'Sacramento': '',
  'Sniglet': ':wght@400;800',
  'Special Elite': '',
  'Tinos': ':ital,wght@0,400;0,700;1,400',
  'UnifrakturMaguntia': '',
  'VT323': '',
};

const BY_LOWER = new Map(Object.keys(GOOGLE_FONTS).map(k => [k.toLowerCase(), k]));

/** The table's name for a CSS family name (quotes and case ignored), or null when it is not a Google font. */
export function googleFamily(name) {
  if (typeof name !== 'string') return null;
  const bare = name.trim().replace(/^["']|["']$/g, '').trim().toLowerCase();
  return BY_LOWER.get(bare) || null;
}

/** The stylesheet address for a family in the table, or null. */
export function googleFontUrl(name) {
  const family = googleFamily(name);
  if (!family) return null;
  return `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}${GOOGLE_FONTS[family]}&display=swap`;
}

/** The family names in a CSS font-family list, quotes removed ("A", B, 'C D' -> A, B, C D). */
export function familiesIn(stack) {
  if (typeof stack !== 'string') return [];
  const out = [];
  let cur = '';
  let quote = null;
  for (const ch of stack) {
    if (quote) {
      if (ch === quote) quote = null; else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ',') {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// family -> promise that settles when its stylesheet has loaded (or failed: a
// failed one is not retried, the fallback fonts in the stack do the job).
const requested = new Map();

/**
 * Adds the stylesheet for one family, once. Resolves true when it has loaded,
 * false for a family that is not loadable here or a stylesheet that failed.
 */
export function ensureFont(name) {
  try {
    const family = googleFamily(name);
    if (!family || typeof document === 'undefined' || !document.head) return Promise.resolve(false);
    const known = requested.get(family);
    if (known) return known;
    const done = new Promise(resolve => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = googleFontUrl(family);
      link.dataset.font = family;
      link.onload = () => resolve(true);
      link.onerror = () => resolve(false);
      document.head.appendChild(link);
    });
    requested.set(family, done);
    return done;
  } catch {
    return Promise.resolve(false);
  }
}

/** Ensures every loadable family in a CSS font-family list. Resolves when all have settled. */
export function ensureFontsIn(stack) {
  try {
    return Promise.all(familiesIn(stack).map(ensureFont)).then(() => undefined);
  } catch {
    return Promise.resolve();
  }
}

/** Ensures the families named by inline font-family styles anywhere inside `root` (a post's text). */
export function ensureFontsInElement(root) {
  try {
    if (!root?.querySelectorAll) return;
    const stacks = new Set();
    for (const el of root.querySelectorAll('[style*="font-family"]')) {
      if (el.style?.fontFamily) stacks.add(el.style.fontFamily);
    }
    stacks.forEach(ensureFontsIn);
  } catch { /* a missing font is not worth an error */ }
}

/**
 * Keeps `root`'s fonts loaded while it changes (a post being read in, typed
 * into, restyled): scans now and, after edits settle, again. Returns the stop function.
 */
export function watchFontsIn(root) {
  if (!root) return () => {};
  let timer = null;
  const scan = () => { timer = null; ensureFontsInElement(root); };
  scan();
  if (typeof MutationObserver === 'undefined') return () => {};
  const observer = new MutationObserver(() => { if (timer == null) timer = setTimeout(scan, 150); });
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  return () => { observer.disconnect(); if (timer != null) clearTimeout(timer); };
}
