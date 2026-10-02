import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GET_STICKIES, PLACE_STICKY, MOVE_STICKY, REMOVE_STICKY, CREATE_STICKER } from '../BasicTextPostServerApi.js';
import { renderGridImage } from '../../../TileArt/wallpaper.js';
import { StickerCenter } from '../../../TileArt/StickerCenter.jsx';
import GridButton from '../PostRenderer/RichTextPost/TileGrid/GridButton.jsx';
import { errorMessage } from '../../../../utils/errorMessage.js';
import './ProfileStickies.css';

/** A sticker's picture, drawn once at its size. */
function StickyArt({ grid, size, name }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let live = true;
    renderGridImage(grid, size).then(c => { if (live && c) setSrc(c.toDataURL('image/png')); }).catch(() => {});
    return () => { live = false; };
  }, [grid, size]);
  return src ? <img src={src} alt={name} draggable={false} /> : null;
}

/**
 * Stickers stuck on a profile, anywhere on it. Everyone sees them; the owner
 * can add one from their collection (or the built-ins), drag them about,
 * make them bigger or smaller, and take them off. Placed over the profile's
 * column, as a fraction of its width across and pixels down.
 */
export default function ProfileStickies({ username, canEdit, editing, onEditingChange, barSlot }) {
  const [stickies, setStickies] = useState([]);
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState('');
  const layer = useRef(null);

  useEffect(() => {
    setStickies([]);
    GET_STICKIES(username).then(list => setStickies(Array.isArray(list) ? list : [])).catch(() => {});
  }, [username]);

  const add = async (grid, picked) => {
    setChoosing(false);
    setError('');
    try {
      // A built-in sticker joins your collection first: a sticky is always one of yours.
      const stickerId = picked?.id ?? (await CREATE_STICKER(username, picked?.name || 'Sticker', grid)).id;
      const y = Math.max(20, window.scrollY - (layer.current?.getBoundingClientRect().top + window.scrollY || 0) + 160);
      const { id } = await PLACE_STICKY(username, stickerId, 0.5, y, 3);
      setStickies(s => [...s, { id, x: 0.5, y, size: 3, stickerId, name: picked?.name || 'Sticker', grid }]);
      onEditingChange?.(true);
    } catch (err) { setError(errorMessage(err, 'Could not add that sticker.')); }
  };

  const save = (id, changes) => {
    setStickies(s => s.map(t => (t.id === id ? { ...t, ...changes } : t)));
    MOVE_STICKY(username, id, changes).catch(err => setError(errorMessage(err, 'Could not move that sticker.')));
  };

  const remove = (id) => {
    setStickies(s => s.filter(t => t.id !== id));
    REMOVE_STICKY(username, id).catch(err => setError(errorMessage(err, 'Could not remove that sticker.')));
  };

  /** Drag a sticker by pointer; it is saved where it is let go. */
  const drag = (e, sticky) => {
    if (!editing || e.target.closest('button')) return;
    e.preventDefault();
    const box = layer.current.getBoundingClientRect();
    const start = { px: e.clientX, py: e.clientY, x: sticky.x, y: sticky.y };
    const el = e.currentTarget;
    el.setPointerCapture?.(e.pointerId);
    const at = (ev) => ({
      x: Math.max(0, Math.min(1, start.x + (ev.clientX - start.px) / box.width)),
      y: Math.max(0, start.y + (ev.clientY - start.py)),
    });
    const move = (ev) => setStickies(s => s.map(t => (t.id === sticky.id ? { ...t, ...at(ev) } : t)));
    const up = (ev) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      save(sticky.id, at(ev));
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  /** Arrow keys move a focused sticker while arranging: 8 px a press, 40 with Shift. */
  const key = (e, sticky) => {
    if (!editing) return;
    const step = e.shiftKey ? 40 : 8;
    const width = layer.current?.getBoundingClientRect().width || 1;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (d) { e.preventDefault(); save(sticky.id, { x: Math.max(0, Math.min(1, sticky.x + d[0] / width)), y: Math.max(0, sticky.y + d[1]) }); }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(sticky.id); }
  };

  return (
    <>
      {canEdit && barSlot && createPortal(
        <div className="stickies-bar">
          <GridButton symbol="heart" showLabel label="Add sticker" onClick={() => setChoosing(true)} />
          {stickies.length > 0 && (
            <GridButton symbol={editing ? 'check' : 'pencil'} showLabel label={editing ? 'Done arranging' : 'Arrange stickers'}
              on={editing} onClick={() => onEditingChange?.(!editing)} />
          )}
          {error && <span className="profile-inline-error" role="alert">{error}</span>}
        </div>,
        barSlot,
      )}
      <div className={`stickies-layer${editing ? ' is-editing' : ''}`} ref={layer} aria-label="Stickers on this profile">
        {stickies.map(t => (
          <div key={t.id} className="sticky" style={{ left: `${t.x * 100}%`, top: t.y }}
            tabIndex={editing ? 0 : -1} role={editing ? 'group' : undefined}
            aria-label={editing ? `${t.name}: drag or use the arrow keys to move` : undefined}
            onPointerDown={e => drag(e, t)} onKeyDown={e => key(e, t)}>
            <StickyArt grid={t.grid} size={t.size} name={t.name} />
            {editing && (
              <span className="sticky-tools">
                <GridButton symbol="minus" label="Smaller" disabled={t.size <= 1} onClick={() => save(t.id, { size: t.size - 1 })} />
                <GridButton symbol="plus" label="Bigger" disabled={t.size >= 6} onClick={() => save(t.id, { size: t.size + 1 })} />
                <GridButton symbol="cross" label="Take it off" onClick={() => remove(t.id)} />
              </span>
            )}
          </div>
        ))}
      </div>
      {choosing && createPortal(
        <div className="post-theme-overlay" role="dialog" aria-modal="true" aria-label="Choose a sticker"
          onMouseDown={e => { if (e.target === e.currentTarget) setChoosing(false); }}
          onKeyDown={e => { if (e.key === 'Escape') setChoosing(false); }}>
          <div className="post-theme-panel">
            <div className="post-theme-head">
              <h2>Stick a sticker on your profile</h2>
              <button type="button" className="post-theme-close" onClick={() => setChoosing(false)}>Cancel</button>
            </div>
            <StickerCenter onPick={add} />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
