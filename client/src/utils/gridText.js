/**
 * Plain text laid out as a grid: words wrapped onto rows of narrow pixel
 * letters (two to a tile), on a transparent background, in one colour, with
 * optional links over runs of the text. For fixed copy that should look like
 * the rest of the site's grids, such as the home page.
 */
import { normaliseGrid, pixelLayer, writeChar, setLink, SLOTS_PER_TILE } from '../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/tileGrid.js';

/** Greedy word wrap: rows no longer than `width` characters (longer words are broken). */
export function wrapWords(text, width) {
  const rows = [];
  let row = '';
  for (let word of String(text).split(/\s+/).filter(Boolean)) {
    while (word.length > width) {
      if (row) { rows.push(row); row = ''; }
      rows.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!row) row = word;
    else if (row.length + 1 + word.length <= width) row += ` ${word}`;
    else { rows.push(row); row = word; }
  }
  if (row) rows.push(row);
  return rows;
}

/**
 * @param text   the copy
 * @param opts.cols   grid width in tiles (two characters each)
 * @param opts.color  text colour, hex
 * @param opts.font   'small' (half a tile tall, room between rows) or 'pixel'
 * @param opts.links  [{ text, href }]: the first occurrence of `text` links to `href`
 */
export function textGrid(text, { cols = 24, color = '#333333', font = 'small', links = [] } = {}) {
  const rows = wrapWords(text, cols * SLOTS_PER_TILE);
  const d = normaliseGrid({ v: 3, cols, rows: Math.max(1, rows.length), layers: [pixelLayer('Text')] });
  let layer = d.layers[0];
  const starts = [];   // where each row begins in the original text
  let from = 0;
  for (const row of rows) {
    const at = text.indexOf(row.split(' ')[0], from);
    starts.push(at);
    from = at + row.length;
  }
  rows.forEach((row, r) => {
    Array.from(row).forEach((ch, i) => {
      if (ch !== ' ') layer = writeChar(d, layer, r, i, ch, { color, font }, 'half');
    });
  });
  let grid = { ...d, layers: [layer] };
  for (const { text: label, href } of links) {
    const tiles = [];
    rows.forEach((row, r) => {
      const at = row.indexOf(label);
      if (at === -1) return;
      for (let i = at; i < at + label.length; i++) tiles.push(`${r},${Math.floor(i / SLOTS_PER_TILE)}`);
    });
    if (tiles.length) grid = setLink(grid, [...new Set(tiles)], href);
  }
  return grid;
}
