/** Colour helpers for the in-app colour picker. Colours are "#rrggbb" strings. */

const HEX = /^#[0-9a-f]{6}$/i;

/** "#abc", "abc", "#aabbcc" or "aabbcc" as "#aabbcc" (lower case), or null. */
export function normaliseHex(input) {
  if (typeof input !== 'string') return null;
  let v = input.trim().toLowerCase();
  if (v.startsWith('#')) v = v.slice(1);
  if (/^[0-9a-f]{3}$/.test(v)) v = v.split('').map(c => c + c).join('');
  return /^[0-9a-f]{6}$/.test(v) ? `#${v}` : null;
}

/** HSL (h 0–360, s and l 0–1) as "#rrggbb". */
export function hslToHex(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
}

export const HUES = 12;
export const SHADES = [0.88, 0.74, 0.6, 0.48, 0.36, 0.24];

/**
 * The picker's grid of colours as rows: a row of greys (white to black), then
 * one row per shade, one column per hue.
 */
export function paletteRows() {
  const greys = Array.from({ length: HUES }, (_, i) => hslToHex(0, 0, 1 - i / (HUES - 1)));
  const shades = SHADES.map(l => Array.from({ length: HUES }, (_, i) => hslToHex((i * 360) / HUES, 0.85, l)));
  return [greys, ...shades];
}

const RECENT_KEY = 'recentColours';
const RECENT_MAX = 8;

export function recentColours() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY));
    return Array.isArray(list) ? list.filter(c => HEX.test(c)).slice(0, RECENT_MAX) : [];
  } catch { return []; }
}

/** Remembers a colour as the most recent, once. */
export function rememberColour(hex) {
  const colour = normaliseHex(hex);
  if (!colour) return;
  const next = [colour, ...recentColours().filter(c => c !== colour)].slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* not kept */ }
}
