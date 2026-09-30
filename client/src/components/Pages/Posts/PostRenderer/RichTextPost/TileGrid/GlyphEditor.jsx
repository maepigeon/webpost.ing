import { useState, useRef } from 'react';
import { bitsFromHex, hexFromBits, seedBits } from './tileGrid.js';

// ── Custom characters ─────────────────────────────────────────────────────────

/**
 * Draw a bitmap and assign it to a character. The bitmap is 8×16 in double-char
 * mode and 16×16 in one-char mode, matching the cell it will fill; wherever
 * that character is typed, the bitmap is drawn instead of the font's glyph.
 */
export default function GlyphEditor({ width, glyphs, onChange, onClose }) {
  const [ch, setCh] = useState('');
  const [bits, setBits] = useState(() => new Array(width * 16).fill(false));
  const drawing = useRef(null);

  const load = (c) => {
    setCh(c);
    const hex = glyphs[c];
    setBits(hex && (hex.length === 64 ? 16 : 8) === width ? bitsFromHex(hex, width) : seedBits(c, width));
  };

  const setBit = (i, on) => setBits(b => { if (b[i] === on) return b; const n = b.slice(); n[i] = on; return n; });

  const save = () => {
    if (!ch) return;
    onChange({ ...glyphs, [ch]: hexFromBits(bits, width) });
  };
  const remove = () => {
    if (!ch || !glyphs[ch]) return;
    const next = { ...glyphs };
    delete next[ch];
    onChange(next);
  };

  return (
    <div className="tilegrid-glyphs" role="dialog" aria-label="Custom characters">
      <div className="tilegrid-row">
        <label>Character
          <input className="tilegrid-char" value={ch} maxLength={2}
            onChange={e => { const c = Array.from(e.target.value).pop() || ''; if (c) load(c); else setCh(''); }} />
        </label>
        <span className="tilegrid-hint">{width === 8 ? 'Half width, 8 × 16' : 'Full width, 16 × 16'}</span>
      </div>

      <div className="tilegrid-bitmap" style={{ gridTemplateColumns: `repeat(${width}, 1fr)`, aspectRatio: `${width} / 16` }}
        onPointerLeave={() => { drawing.current = null; }}
        onPointerUp={() => { drawing.current = null; }}>
        {bits.map((on, i) => (
          <span key={i} className={on ? 'on' : ''}
            onPointerDown={e => { e.preventDefault(); drawing.current = !on; setBit(i, !on); }}
            onPointerEnter={() => { if (drawing.current !== null) setBit(i, drawing.current); }} />
        ))}
      </div>

      <div className="tilegrid-row">
        <button type="button" onClick={() => setBits(new Array(width * 16).fill(false))}>Clear</button>
        <button type="button" onClick={() => setBits(seedBits(ch, width))} disabled={!ch}>Start from font</button>
        <button type="button" onClick={save} disabled={!ch} className="is-on">Save “{ch || '?'}”</button>
        <button type="button" onClick={remove} disabled={!ch || !glyphs[ch]} className="tilegrid-danger">Delete</button>
      </div>

      {Object.keys(glyphs).length > 0 && (
        <div className="tilegrid-row">
          <span className="tilegrid-label">Yours</span>
          {Object.keys(glyphs).map(c => (
            <button key={c} type="button" className={c === ch ? 'is-on' : ''} onClick={() => load(c)}>{c}</button>
          ))}
        </div>
      )}

      <div className="tilegrid-row tilegrid-row--end">
        <button type="button" className="tilegrid-done" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
