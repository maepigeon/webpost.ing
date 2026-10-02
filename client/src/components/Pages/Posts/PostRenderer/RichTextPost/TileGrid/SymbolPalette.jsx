import { useEffect, useState } from 'react';
import { BITMAP_FONTS, SYMBOL_CHARS } from './bitmapFonts.js';
import { GlyphThumb } from '../../../../../TileArt/PackThumbs.jsx';
import { GET_PIXEL_FONTS } from '../../../BasicTextPostServerApi.js';
import GridButton from './GridButton.jsx';
import PixelText from './PixelText.jsx';
import './SymbolPalette.css';

/**
 * An on-screen keyboard for symbols: click or tap a key to type it at the
 * cursor, as if typed. Tabs pick the pack: the built-in Symbols, or any of
 * your own pixel fonts (a character of yours is copied into the grid, so it
 * shows for everyone). Space, Backspace and Enter are keys too, so a phone
 * needs no other keyboard. It stays open until Done.
 */
export default function SymbolPalette({ onKey, onClose }) {
  const me = typeof localStorage !== 'undefined' ? localStorage.getItem('userName') : null;
  const [packs, setPacks] = useState([]);
  const [tab, setTab] = useState('symbols');

  useEffect(() => {
    if (!me) return;
    GET_PIXEL_FONTS(me)
      .then(list => setPacks((list || []).filter(f => f.glyphs && Object.keys(f.glyphs).length)))
      .catch(() => {});
  }, [me]);

  const pack = packs.find(p => String(p.id) === tab);
  const keys = pack
    ? Object.entries(pack.glyphs).map(([ch, hex]) => ({ ch, hex, show: hex }))
    : SYMBOL_CHARS.map(ch => ({ ch, show: BITMAP_FONTS.symbols.full[ch] }));
  const press = (key) => (e) => { e.preventDefault(); onKey(key); };

  return (
    <div className="tg-symbols" role="group" aria-label="Symbol keyboard" onMouseDown={e => e.preventDefault()}>
      <div className="tg-symbols-tabs" role="tablist" aria-label="Symbol packs">
        {[['symbols', 'Symbols'], ...packs.map(p => [String(p.id), p.name])].map(([id, name]) => (
          <GridButton key={id} role="tab" aria-selected={tab === id} aria-pressed={undefined} label={name}
            on={tab === id} onClick={() => setTab(id)} />
        ))}
      </div>
      <div className="tg-symbols-grid">
        {keys.map(key => (
          <button key={key.ch} type="button" className="tg-tile tg-symbol" aria-label={`Type ${key.ch}`} data-tip={key.ch}
            onClick={press(key)}>
            <GlyphThumb ch={key.ch} hex={key.show} scale={1} />
          </button>
        ))}
        {!keys.length && <PixelText text="This pack has no characters yet." px={1} />}
      </div>
      <div className="tg-symbols-keys">
        <button type="button" className="tg-text-btn gb tg-symbols-space" aria-label="Space" onClick={press({ kind: 'space' })}>
          <PixelText text="space" px={1.25} />
        </button>
        <GridButton symbol="undo" label="Backspace" title="Backspace: clear the character before the cursor" onClick={() => onKey({ kind: 'backspace' })} />
        <GridButton symbol="numbers" label="Enter" title="Enter: next line" onClick={() => onKey({ kind: 'enter' })} />
        <span className="tg-symbols-spacer" />
        <GridButton symbol="check" showLabel label="Done" onClick={onClose} />
      </div>
    </div>
  );
}
