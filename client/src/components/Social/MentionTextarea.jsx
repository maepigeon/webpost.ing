import { useEffect, useRef, useState } from 'react';
import { SEARCH_USERS } from '../Pages/Posts/BasicTextPostServerApi.js';
import { activeMention } from '../../utils/mentions.jsx';
import './MentionTextarea.css';

const MAX = 6;
const DELAY = 250;

/**
 * A textarea that, after "@" and two characters, offers members to mention
 * (arrow keys and Enter pick, Escape closes). Otherwise a plain textarea.
 */
export default function MentionTextarea({ value, onChange, ...rest }) {
  const ref = useRef(null);
  const [found, setFound] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [at, setAt] = useState(null);       // { start, query }
  const timer = useRef(null);
  const latest = useRef('');

  useEffect(() => () => clearTimeout(timer.current), []);

  const look = (text, caret) => {
    const m = activeMention(text, caret);
    setAt(m);
    clearTimeout(timer.current);
    if (!m) { setOpen(false); setFound([]); return; }
    latest.current = m.query;
    timer.current = setTimeout(() => {
      SEARCH_USERS(m.query).then(r => {
        if (latest.current !== m.query) return;
        const q = m.query.toLowerCase();
        const names = (Array.isArray(r) ? r : []).sort((a, b) =>
          Number(b.toLowerCase().startsWith(q)) - Number(a.toLowerCase().startsWith(q))).slice(0, MAX);
        setFound(names); setActive(0); setOpen(names.length > 0);
      }).catch(() => setOpen(false));
    }, DELAY);
  };

  const pick = (name) => {
    const el = ref.current;
    const caret = el ? el.selectionStart : value.length;
    const start = at ? at.start : caret;
    const next = value.slice(0, start) + '@' + name + ' ' + value.slice(caret);
    onChange({ target: { value: next } });
    setOpen(false); setFound([]);
    const pos = start + name.length + 2;
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(pos, pos); } });
  };

  const onKeyDown = (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % found.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + found.length) % found.length); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(found[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  };

  return (
    <div className="mention-box">
      <textarea
        {...rest}
        ref={ref}
        value={value}
        onChange={e => { onChange(e); look(e.target.value, e.target.selectionStart); }}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {open && (
        <ul className="mention-list" role="listbox" aria-label="Members to mention">
          {found.map((name, i) => (
            <li key={name} role="option" aria-selected={i === active}>
              <button type="button" tabIndex={-1}
                className={`mention-option${i === active ? ' is-active' : ''}`}
                onMouseDown={e => { e.preventDefault(); pick(name); }}>
                @{name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
