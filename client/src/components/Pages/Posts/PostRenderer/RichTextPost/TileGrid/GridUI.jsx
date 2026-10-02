import { useEffect, useRef, useState } from 'react';
import PixelText from './PixelText.jsx';
import GridButton from './GridButton.jsx';
import './GridUI.css';

/**
 * Grid-styled controls for the editors, so every control speaks the grid's
 * language: words in the pixel font, choices and numbers as tiles. Each is a
 * real control underneath (button, listbox, spin button) for keyboards and
 * screen readers.
 */

/** Words in the pixel font that wrap like text: each word a picture, the spaces real. */
export function PixelWords({ text, px = 1.25, className = '' }) {
  return (
    <span className={`pixel-words ${className}`.trim()} aria-label={text} role="text">
      {String(text).split(/\s+/).filter(Boolean).map((word, i) => (
        <span key={i} className="pixel-word"><PixelText text={word} px={px} /></span>
      ))}
    </span>
  );
}

/**
 * A choice from a list, drawn as tiles: a button showing the current option,
 * opening a column of options. Arrow keys move, Enter or Space picks, Escape
 * closes. `options` is [[value, label], …].
 */
export function GridSelect({ value, options, onChange, label, tip }) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const box = useRef(null);
  const current = options.find(([v]) => v === value);

  useEffect(() => {
    if (!open) return undefined;
    setAt(Math.max(0, options.findIndex(([v]) => v === value)));
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open, options, value]);

  const key = (e) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); setOpen(true); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setAt(i => Math.min(options.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(options[at][0]); setOpen(false); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); }
  };

  return (
    <span className="grid-select" ref={box}>
      <button type="button" className="tg-text-btn gb grid-select-btn" aria-haspopup="listbox" aria-expanded={open}
        aria-label={`${label}: ${current ? current[1] : value}`} data-tip={tip || label}
        onClick={() => setOpen(o => !o)} onKeyDown={key}>
        <PixelText text={current ? current[1] : String(value)} px={1.25} />
        <PixelText symbol={open ? 'open' : 'closed'} px={1.25} />
      </button>
      {open && (
        <span className="grid-select-menu" role="listbox" aria-label={label}>
          {options.map(([v, l], i) => (
            <button key={v} type="button" role="option" aria-selected={v === value} tabIndex={-1} aria-label={l}
              className={`grid-select-option${v === value ? ' is-on' : ''}${i === at ? ' is-at' : ''}`}
              onMouseEnter={() => setAt(i)} onClick={() => { onChange(v); setOpen(false); }}>
              <PixelText text={l} px={1.25} />
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

/** A whole number with − and + tiles, in the pixel font. Arrow keys step it too. */
export function GridStepper({ label, short, value, min, max, onChange, disabled }) {
  const set = (v) => onChange(Math.max(min, Math.min(max, v)));
  return (
    <span className="grid-stepper" role="spinbutton" aria-label={label} aria-valuenow={value}
      aria-valuemin={min} aria-valuemax={max} aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : 0} data-tip={label}
      onKeyDown={e => {
        if (disabled) return;
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); set(value + 1); }
        if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); set(value - 1); }
      }}>
      <PixelText text={short} px={1.25} />
      <GridButton symbol="minus" label={`Fewer: ${label}`} disabled={disabled || value <= min} onClick={() => set(value - 1)} tabIndex={-1} />
      <span className="grid-stepper-value"><PixelText text={String(value)} px={1.5} /></span>
      <GridButton symbol="plus" label={`More: ${label}`} disabled={disabled || value >= max} onClick={() => set(value + 1)} tabIndex={-1} />
    </span>
  );
}
