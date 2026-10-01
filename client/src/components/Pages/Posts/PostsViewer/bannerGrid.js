/**
 * The profile banner's first four rows, which the site fills in: name, follow
 * counts, join date and public posts, with the avatar beside them on the
 * right. Built as an ordinary grid so it is drawn like the owner's rows under
 * it, in the same tiles and pixel font.
 */
import { normaliseGrid, pixelLayer, writeChar, SLOTS_PER_TILE } from '../PostRenderer/RichTextPost/TileGrid/tileGrid.js';

export const BANNER_COLS = 32;
export const INFO_ROWS = 4;
/** Tiles on the right taken by the avatar (square: as wide as the info rows are tall). */
export const AVATAR_TILES = INFO_ROWS;
const TEXT_TILES = BANNER_COLS - AVATAR_TILES - 1;   // one tile of margin on the left

const LABEL = '#9a9a9a';
const VALUE = '#ffffff';

const joinedText = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime())
    ? `joined ${d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`
    : '';
};

/**
 * The four lines, each as parts with a colour, and where the follow counts
 * fall so they can be clicked: { grid, label, hits }.
 */
export function bannerInfo({ username = '', followers = 0, following = 0, joined = null, publicPosts = 0, narrow = false }) {
  const lines = [
    [['user: ', LABEL], [username, VALUE]],
    [[`${followers}`, VALUE], [followers === 1 ? ' follower ' : ' followers ', LABEL], [`${following}`, VALUE], [' following', LABEL]],
    [[joinedText(joined), LABEL]],
    [[`${publicPosts}`, VALUE], [publicPosts === 1 ? ' public post' : ' public posts', LABEL]],
  ];
  let text = pixelLayer('Info');
  const d = normaliseGrid({ v: 3, cols: BANNER_COLS, rows: INFO_ROWS, layers: [text] });
  text = d.layers[0];
  const hits = [];
  lines.forEach((parts, r) => {
    const chars = Array.from(parts.map(p => p[0]).join(''));
    // Two characters a tile (`narrow`, for a wide banner), or one, as long as
    // the line fits beside the avatar.
    const wide = !narrow && chars.length <= TEXT_TILES;
    const room = wide ? TEXT_TILES : TEXT_TILES * SLOTS_PER_TILE;
    let s = SLOTS_PER_TILE;   // after the margin
    let i = 0;
    for (const [part, color] of parts) {
      const start = i;
      for (const ch of Array.from(part)) {
        if (i >= room) break;
        if (ch !== ' ') text = writeChar(d, text, r, s, ch, { color }, wide ? 'full' : 'half');
        s += wide ? SLOTS_PER_TILE : 1;
        i += 1;
      }
      // Where each count's part sits, as fractions of the banner's width, for the click targets.
      if (r === 1) hits.push({ from: (SLOTS_PER_TILE + start * (wide ? 2 : 1)) / (BANNER_COLS * SLOTS_PER_TILE), to: s / (BANNER_COLS * SLOTS_PER_TILE) });
    }
  });
  const label = lines.map(parts => parts.map(p => p[0]).join('')).filter(Boolean).join('. ');
  return {
    grid: { ...d, layers: [text] },
    label,
    // followers = its number and word; following = its number and word.
    hits: hits.length === 4 ? { followers: { from: hits[0].from, to: hits[1].to }, following: { from: hits[2].from, to: hits[3].to } } : null,
  };
}
