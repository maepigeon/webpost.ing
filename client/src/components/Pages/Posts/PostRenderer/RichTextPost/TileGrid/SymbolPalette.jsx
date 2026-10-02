import { BITMAP_FONTS, SYMBOL_CHARS } from './bitmapFonts.js';
import { GlyphThumb } from '../../../../../TileArt/PackThumbs.jsx';
import './SymbolPalette.css';

/**
 * The Symbols font's characters, for typing what a keyboard has no key for.
 * Pressing one types it at the cursor in the Symbols font, as if typed; the
 * palette stays open so several can go in a row.
 */
export default function SymbolPalette({ onInsert, onClose }) {
  return (
    <div className="tg-symbols" role="group" aria-label="Symbols">
      <div className="tg-symbols-grid">
        {SYMBOL_CHARS.map(ch => (
          <button key={ch} type="button" className="tg-tile tg-symbol" aria-label={`Type ${ch}`} data-tip={ch}
            onMouseDown={e => e.preventDefault()} onClick={() => onInsert(ch)}>
            <GlyphThumb ch={ch} hex={BITMAP_FONTS.symbols.full[ch]} scale={1} />
          </button>
        ))}
      </div>
      <div className="tilegrid-row tilegrid-row--end">
        <button type="button" className="tilegrid-done" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
