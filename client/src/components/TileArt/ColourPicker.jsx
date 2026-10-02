import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { normaliseHex, paletteRows, recentColours, rememberColour } from '../../utils/colours.js';
import './ColourPicker.css';

const ROWS = paletteRows();

/**
 * A colour swatch that opens the app's own picker instead of the browser's
 * dialog: a grid of colour tiles (greys, then hues by shade), the colours used
 * lately, and a field for a hex code. Pick a tile and it is chosen at once.
 *
 * It renders a button; give it the swatch class of wherever it sits
 * (`className`). Pressing in the picker does not take the keyboard from the
 * editor underneath (the grid editor types through a hidden field).
 */
export default function ColourPicker({ value, onChange, label = 'Colour', tip, className = 'colour-swatch', disabled }) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState(value);
  const [spot, setSpot] = useState(null);
  const button = useRef(null);
  const panel = useRef(null);

  useEffect(() => { setHex(value); }, [value, open]);

  // Under the swatch, or above it where there is no room below; kept on screen.
  useLayoutEffect(() => {
    if (!open || !button.current || !panel.current) return;
    const b = button.current.getBoundingClientRect();
    const p = panel.current.getBoundingClientRect();
    const below = window.innerHeight - b.bottom >= p.height + 8 || b.top < p.height + 8;
    setSpot({
      top: below ? b.bottom + 6 : b.top - p.height - 6,
      left: Math.max(8, Math.min(b.left, window.innerWidth - p.width - 8)),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!panel.current?.contains(e.target) && !button.current?.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); button.current?.focus(); } };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key, true); };
  }, [open]);

  const choose = (colour) => {
    const c = normaliseHex(colour);
    if (!c) return;
    rememberColour(c);
    onChange(c);
    setHex(c);
  };
  const typed = normaliseHex(hex);

  return (
    <>
      <button type="button" ref={button} className={className} style={{ background: value }} disabled={disabled}
        aria-label={`${label}: ${value}`} aria-haspopup="dialog" aria-expanded={open} data-tip={tip || label}
        onMouseDown={e => e.preventDefault()} onClick={() => setOpen(o => !o)} />
      {open && createPortal(
        <div ref={panel} className="colour-picker" role="dialog" aria-label={label}
          style={spot ? { top: spot.top, left: spot.left } : { visibility: 'hidden', top: 0, left: 0 }}
          onMouseDown={e => { if (e.target.tagName !== 'INPUT') e.preventDefault(); }}>
          <div className="colour-grid" role="group" aria-label="Colours">
            {ROWS.map((row, r) => row.map((c, i) => (
              <button key={`${r},${i}`} type="button" className={`colour-tile${c === value.toLowerCase() ? ' is-on' : ''}`}
                style={{ background: c }} aria-label={c} data-tip={c} aria-pressed={c === value.toLowerCase()}
                onClick={() => choose(c)} />
            )))}
          </div>
          {recentColours().length > 0 && (
            <div className="colour-recent" role="group" aria-label="Recent colours">
              {recentColours().map(c => (
                <button key={c} type="button" className="colour-tile" style={{ background: c }} aria-label={`Recent ${c}`}
                  data-tip={c} onClick={() => choose(c)} />
              ))}
            </div>
          )}
          <form className="colour-hex" onSubmit={e => { e.preventDefault(); if (typed) choose(typed); }}>
            <span className="colour-preview" style={{ background: typed || value }} aria-hidden="true" />
            <input type="text" value={hex} onChange={e => setHex(e.target.value)} aria-label="Hex colour"
              spellCheck={false} maxLength={7} aria-invalid={!typed} />
            <button type="submit" disabled={!typed}>Use</button>
          </form>
        </div>,
        document.body,
      )}
    </>
  );
}
