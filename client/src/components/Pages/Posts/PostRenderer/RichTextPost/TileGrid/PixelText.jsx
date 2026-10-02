import { pixelGlyph } from './tileFont.js';
import { symbolRows } from './symbols.js';

/**
 * Text and symbols drawn as grid pixels: each letter is the pixel font's 8×8
 * bitmap, each dot a crisp square, in the current text colour. It is the
 * look of a grid's own text, for the editors' buttons and labels.
 *
 * It is a picture only; wrap it in a real <button> (see GridButton) for the
 * click, keyboard and screen-reader parts, and give that the readable label.
 *
 *   <PixelText text="Insert" />          letters
 *   <PixelText symbol="bold" />          a symbol from the pack
 *
 * `px` is the size of one dot in CSS pixels; `pack` an optional symbol pack.
 */
export default function PixelText({ text = '', symbol = null, px = 1.5, pack }) {
  const glyphs = symbol
    ? [symbolRows(symbol, pack)].filter(Boolean)
    : Array.from(text).map(ch => (ch === ' ' ? new Array(8).fill(0) : pixelGlyph(ch))).filter(Boolean);
  const rects = [];
  glyphs.forEach((rows, i) => rows.forEach((bits, y) => {
    for (let x = 0; x < 8; x++) if (bits & (0x80 >> x)) rects.push(<rect key={`${i},${x},${y}`} x={i * 8 + x} y={y} width="1" height="1" />);
  }));
  const w = Math.max(1, glyphs.length) * 8;
  return (
    <svg className="pixel-text" width={w * px} height={8 * px} viewBox={`0 0 ${w} 8`} shapeRendering="crispEdges"
      fill="currentColor" aria-hidden="true" style={{ display: 'block' }}>
      {rects}
    </svg>
  );
}
