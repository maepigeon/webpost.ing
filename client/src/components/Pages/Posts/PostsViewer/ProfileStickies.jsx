import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { GET_STICKIES, PLACE_STICKY, MOVE_STICKY, REMOVE_STICKY, CREATE_STICKER } from '../BasicTextPostServerApi.js';
import { renderGridImage } from '../../../TileArt/wallpaper.js';
import { StickerCenter } from '../../../TileArt/StickerCenter.jsx';
import GridButton from '../PostRenderer/RichTextPost/TileGrid/GridButton.jsx';
import { errorMessage } from '../../../../utils/errorMessage.js';
import './ProfileStickies.css';

/** What a sticker can be stuck to: the profile's top section, or a post's card. */
const ANCHORS = '.profile-header-card, [data-post-id]';
const anchorKey = (postId) => (postId == null ? 'top' : String(postId));

/** The anchor elements on the page, by key. */
function findAnchors(root) {
  const map = new Map();
  if (!root) return map;
  const top = root.querySelector('.profile-header-card');
  if (top) map.set('top', top);
  for (const el of root.querySelectorAll('[data-post-id]')) map.set(String(el.dataset.postId), el);
  return map;
}

/** A sticker's picture, drawn once at its size. */
export function StickyArt({ grid, size, name }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let live = true;
    renderGridImage(grid, size).then(c => { if (live && c) setSrc(c.toDataURL('image/png')); }).catch(() => {});
    return () => { live = false; };
  }, [grid, size]);
  return src ? <img src={src} alt={name} draggable={false} /> : null;
}

/**
 * Stickers stuck on a profile. Each is stuck to the profile's top section or
 * to one of the owner's posts, and placed relative to it (across as a share of
 * its width, down in pixels from its top), so it stays with what it was stuck
 * on however the posts load or move. Everyone sees them, under menus and
 * dialogs, and clicks go through them to whatever is beneath. The owner can
 * add one, then arrange: drag a sticker (onto another post to move it there),
 * make it bigger or smaller, or take it off.
 */
export default function ProfileStickies({ username, canEdit, editing, onEditingChange, barSlot, root }) {
  const [stickies, setStickies] = useState([]);
  const [anchors, setAnchors] = useState(new Map());
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(null);   // { id, dx, dy }

  useEffect(() => {
    setStickies([]);
    GET_STICKIES(username).then(list => setStickies(Array.isArray(list) ? list : [])).catch(() => {});
  }, [username]);

  // Anchors come and go as posts load, page and move: find them again when the page changes.
  const refresh = useCallback(() => setAnchors(findAnchors(root)), [root]);
  useEffect(() => {
    if (!root) return undefined;
    refresh();
    const mo = new MutationObserver(() => refresh());
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [root, refresh]);

  const add = async (grid, picked) => {
    setChoosing(false);
    setError('');
    try {
      // A built-in sticker joins your collection first: a sticky is always one of yours.
      const stickerId = picked?.id ?? (await CREATE_STICKER(username, picked?.name || 'Sticker', grid)).id;
      const { id } = await PLACE_STICKY(username, stickerId, 0.85, 20, 3, null);
      setStickies(s => [...s, { id, x: 0.85, y: 20, size: 3, postId: null, stickerId, name: picked?.name || 'Sticker', grid }]);
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

  /**
   * Drag a sticker; where it is let go decides what it is stuck to: the post
   * or top section under its centre (its own anchor if it is over neither).
   */
  const drag = (e, sticky) => {
    if (!editing || e.target.closest('button')) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture?.(e.pointerId);
    const start = { x: e.clientX, y: e.clientY };
    const move = (ev) => setDragging({ id: sticky.id, dx: ev.clientX - start.x, dy: ev.clientY - start.y });
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      setDragging(null);
      const r = el.getBoundingClientRect();
      // The box already includes the drag: its top centre is where the sticker now is.
      const cx = r.left + r.width / 2;
      const cy = r.top;
      const hit = document.elementsFromPoint(cx, cy).map(n => n.closest?.(ANCHORS)).find(Boolean);
      const target = hit && root?.contains(hit) ? hit : anchors.get(anchorKey(sticky.postId));
      if (!target) return;
      const box = target.getBoundingClientRect();
      const postId = target.dataset.postId ? Number(target.dataset.postId) : null;
      save(sticky.id, {
        postId,
        x: Math.max(0, Math.min(1, (cx - box.left) / box.width)),
        y: Math.max(0, cy - box.top),
      });
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  /** Arrow keys move a focused sticker while arranging: 8 px a press, 40 with Shift; Delete takes it off. */
  const key = (e, sticky) => {
    if (!editing) return;
    const step = e.shiftKey ? 40 : 8;
    const width = anchors.get(anchorKey(sticky.postId))?.getBoundingClientRect().width || 1;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (d) { e.preventDefault(); save(sticky.id, { x: Math.max(0, Math.min(1, sticky.x + d[0] / width)), y: Math.max(0, sticky.y + d[1]) }); }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(sticky.id); }
  };

  const shown = (t) => (
    <div key={t.id} className={`sticky${editing ? ' is-editing' : ''}`}
      style={{
        left: `${t.x * 100}%`, top: t.y,
        transform: dragging?.id === t.id ? `translate(calc(-50% + ${dragging.dx}px), ${dragging.dy}px)` : undefined,
      }}
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
  );

  // One layer inside each anchor, holding the stickers stuck to it.
  const groups = new Map();
  for (const t of stickies) {
    const k = anchorKey(t.postId);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }

  return (
    <>
      {canEdit && barSlot && createPortal(
        <div className="stickies-bar">
          {/* Pills like the owner's other controls above them. */}
          <button type="button" className="edit-bio-btn" onClick={() => setChoosing(true)}>+ Sticker</button>
          {stickies.length > 0 && (
            <button type="button" className={`edit-bio-btn${editing ? ' profile-header-ink-btn--active' : ''}`} aria-pressed={editing}
              onClick={() => onEditingChange?.(!editing)}>{editing ? 'Done arranging' : 'Arrange stickers'}</button>
          )}
          {editing && <span className="stickies-hint">Drag a sticker onto any post to stick it there.</span>}
          {error && <span className="profile-inline-error" role="alert">{error}</span>}
        </div>,
        barSlot,
      )}
      {[...groups].map(([k, list]) => {
        const target = anchors.get(k);
        return target ? createPortal(
          <div className={`stickies-layer${editing ? ' is-editing' : ''}`}>{list.map(shown)}</div>,
          target, `stickies-${k}`,
        ) : null;
      })}
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
