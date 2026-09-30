import { useState, useRef, useEffect } from 'react';
import { bitsFromHex, hexFromBits, seedBits } from './tileGrid.js';
import { GET_PIXEL_FONTS, CREATE_PIXEL_FONT, UPDATE_PIXEL_FONT } from '../../../BasicTextPostServerApi.js';

/**
 * The signed-in user's pixel font libraries, and actions on them. A grid
 * copies the characters it uses, so a post never breaks if a library changes.
 */
function Libraries({ glyphs, onUse }) {
  const me = typeof localStorage !== 'undefined' ? localStorage.getItem('userName') : null;
  const [fonts, setFonts] = useState([]);
  const [chosen, setChosen] = useState('');
  const [note, setNote] = useState('');

  const load = () => { if (me) GET_PIXEL_FONTS(me).then(f => setFonts(Array.isArray(f) ? f : [])).catch(() => {}); };
  useEffect(load, [me]);

  if (!me) return null;
  const font = fonts.find(f => String(f.id) === chosen);
  const count = Object.keys(glyphs).length;
  const fail = (err, msg) => setNote(err?.response?.data?.message || msg);

  const saveNew = async () => {
    const name = window.prompt('Name this pixel font:')?.trim();
    if (!name) return;
    try {
      const { id } = await CREATE_PIXEL_FONT(me, name.slice(0, 40), glyphs);
      setNote(`Saved “${name}”.`);
      load();
      setChosen(String(id));
    } catch (err) { fail(err, 'Could not save the font.'); }
  };

  const update = async () => {
    if (!font) return;
    try {
      await UPDATE_PIXEL_FONT(me, font.id, font.name, { ...font.glyphs, ...glyphs });
      setNote(`Updated “${font.name}”.`);
      load();
    } catch (err) { fail(err, 'Could not update the font.'); }
  };

  return (
    <div className="tilegrid-row tilegrid-libraries">
      <span className="tilegrid-label">Fonts</span>
      <select value={chosen} onChange={e => setChosen(e.target.value)} aria-label="Your pixel fonts">
        <option value="">{fonts.length ? 'Your pixel fonts…' : 'No saved fonts yet'}</option>
        {fonts.map(f => <option key={f.id} value={f.id}>{f.name} ({Object.keys(f.glyphs || {}).length})</option>)}
      </select>
      <button type="button" disabled={!font} onClick={() => { onUse(font.glyphs); setNote(`Using “${font.name}”.`); }}
        title="Copy this font's characters into the grid">Use</button>
      <button type="button" disabled={!font || !count} onClick={update}
        title="Add this grid's characters to the font, replacing any it already has">Update</button>
      <button type="button" disabled={!count} onClick={saveNew} title="Save this grid's characters as a new font">Save as font…</button>
      {note && <span className="tilegrid-hint">{note}</span>}
    </div>
  );
}

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

      <Libraries glyphs={glyphs} onUse={g => onChange({ ...glyphs, ...g })} />

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
