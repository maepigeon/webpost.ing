/**
 * Stickers: the small grid pinned to the top of every card in a theme — a
 * push pin, a strip of tape. Each is an ordinary tile grid, so it can be
 * opened in the grid designer and redrawn; these are the starting points.
 */
import { drawnTile } from './wallpaper.js';

const px = (ctx, x, y, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); };

/** Draws rows of characters; each character maps to a colour ('.' is empty). */
function sprite(ctx, rows, palette, ox = 0, oy = 0) {
  rows.forEach((line, y) => [...line].forEach((ch, x) => { if (palette[ch]) px(ctx, ox + x, oy + y, palette[ch]); }));
}

const PIN = [
  '................',
  '.....RRRRRR.....',
  '....RWWRRRRR....',
  '...RWWRRRRRRr...',
  '...RWRRRRRRRr...',
  '...RRRRRRRRRr...',
  '...RRRRRRRRrr...',
  '....RRRRRRrr....',
  '.....rrrrrr.....',
  '.......gg.......',
  '.......gg.......',
  '.......gG.......',
  '.......gG.......',
  '........G.......',
  '................',
  '................',
];

// Four round toes over a pad shaped like an upside-down heart, mirror-symmetric.
const PAW = [
  '....PP....PP....',
  '...PPPP..PPPP...',
  '...PPPP..PPPP...',
  '....PP....PP....',
  '.PP..........PP.',
  'PPPP........PPPP',
  'PPPP........PPPP',
  '.PP..........PP.',
  '.......PP.......',
  '.....PPPPPP.....',
  '....PPPPPPPP....',
  '...PPPPPPPPPP...',
  '..PPPPPPPPPPPP..',
  '..PPPPPPPPPPPP..',
  '..PPPPP..PPPPP..',
  '...PPP....PPP...',
];

const STAR = [
  '................',
  '.......YY.......',
  '.......YY.......',
  '......YYYY......',
  '......YYYY......',
  '.YYYYYYYYYYYYYY.',
  '..YYYYYYYYYYYY..',
  '....YYYYYYYY....',
  '.....YYYYYY.....',
  '.....YYYYYY.....',
  '....YYY..YYY....',
  '....YY....YY....',
  '...YY......YY...',
  '................',
  '................',
  '................',
];

const HEART = [
  '................',
  '................',
  '...HHH....HHH...',
  '..HHHHH..HHHHH..',
  '..HWHHHHHHHHHH..',
  '..HWHHHHHHHHHH..',
  '..HHHHHHHHHHHH..',
  '...HHHHHHHHHH...',
  '....HHHHHHHH....',
  '.....HHHHHH.....',
  '......HHHH......',
  '.......HH.......',
  '................',
  '................',
  '................',
  '................',
];

export const STICKERS = {
  pin: {
    label: 'Push pin',
    make: () => drawnTile(1, 1, (ctx) => sprite(ctx, PIN, { R: '#d8342c', r: '#9c1f1a', W: '#ff9a8f', g: '#9aa3ab', G: '#5f676e' }), 'Pin'),
  },
  tape: {
    label: 'Tape',
    make: () => drawnTile(4, 1, (ctx, w) => {
      // Masking-tape cream with torn ends, so it shows on white paper as well as dark.
      ctx.fillStyle = 'rgba(236, 219, 164, 0.92)';
      ctx.fillRect(2, 3, w - 4, 10);
      ctx.fillStyle = 'rgba(214, 194, 132, 0.95)';
      ctx.fillRect(2, 12, w - 4, 1);
      for (let y = 3; y < 13; y += 2) { ctx.clearRect(2, y, 1, 1); ctx.clearRect(w - 3, y + 1, 1, 1); }
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.fillRect(3, 4, w - 6, 1);
    }, 'Tape'),
  },
  paw: {
    label: 'Paw',
    make: () => drawnTile(1, 1, (ctx) => sprite(ctx, PAW, { P: '#ff4f9a' }), 'Paw'),
  },
  star: {
    label: 'Star',
    make: () => drawnTile(1, 1, (ctx) => sprite(ctx, STAR, { Y: '#f5c400' }), 'Star'),
  },
  heart: {
    label: 'Heart',
    make: () => drawnTile(1, 1, (ctx) => sprite(ctx, HEART, { H: '#e0245e', W: '#ff9bb8' }), 'Heart'),
  },
};
