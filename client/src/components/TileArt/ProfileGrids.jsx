import { useCallback, useEffect, useRef, useState } from 'react';
import TileGrid from '../Pages/Posts/PostRenderer/RichTextPost/TileGrid/TileGrid.jsx';
import { defaultGrid } from '../Pages/Posts/PostRenderer/RichTextPost/TileGrid/tileGrid.js';
import {
  GET_PROFILE_GRIDS, CREATE_PROFILE_GRID, UPDATE_PROFILE_GRID, DELETE_PROFILE_GRID, ORDER_PROFILE_GRIDS,
} from '../Pages/Posts/BasicTextPostServerApi.js';
import { useDialog } from '../Dialog/Dialog.jsx';
import './ProfileGrids.css';

const SAVE_DELAY_MS = 900;

/**
 * Tile grids posted straight onto a profile, under the header card. The owner
 * edits them in place; each saves itself shortly after the last change.
 */
export default function ProfileGrids({ username, canEdit }) {
  const [items, setItems] = useState([]);   // [{id, grid}]
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const timers = useRef({});
  const { confirm } = useDialog();

  useEffect(() => {
    let live = true;
    setLoaded(false);
    GET_PROFILE_GRIDS(username)
      .then(list => { if (live) setItems(Array.isArray(list) ? list : []); })
      .catch(() => { if (live) setItems([]); })
      .finally(() => { if (live) setLoaded(true); });
    return () => { live = false; };
  }, [username]);

  // Anything still waiting to save goes now, rather than being lost.
  useEffect(() => () => Object.values(timers.current).forEach(t => t.flush?.()), []);

  const report = (err, fallback) => setError(err?.response?.data?.message || fallback);

  const change = useCallback((id, grid) => {
    setItems(list => list.map(it => (it.id === id ? { ...it, grid } : it)));
    const pending = timers.current[id];
    if (pending) clearTimeout(pending.timer);
    const flush = () => {
      delete timers.current[id];
      setSaving(true);
      UPDATE_PROFILE_GRID(username, id, grid)
        .then(() => setError(''))
        .catch(err => report(err, 'Could not save that grid.'))
        .finally(() => setSaving(false));
    };
    timers.current[id] = { timer: setTimeout(flush, SAVE_DELAY_MS), flush };
  }, [username]);

  const add = async () => {
    const grid = defaultGrid(16, 6);
    try {
      const { id } = await CREATE_PROFILE_GRID(username, grid);
      setItems(list => [...list, { id, grid, fresh: true }]);
      setError('');
    } catch (err) {
      report(err, 'Could not add a grid.');
    }
  };

  const remove = async (id) => {
    if (!(await confirm('Delete this grid from your profile?'))) return;
    try {
      await DELETE_PROFILE_GRID(username, id);
      setItems(list => list.filter(it => it.id !== id));
    } catch (err) {
      report(err, 'Could not delete that grid.');
    }
  };

  const move = (id, delta) => {
    setItems(list => {
      const i = list.findIndex(it => it.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const next = list.slice();
      [next[i], next[j]] = [next[j], next[i]];
      ORDER_PROFILE_GRIDS(username, next.map(it => it.id)).catch(err => report(err, 'Could not reorder.'));
      return next;
    });
  };

  if (!loaded || (!items.length && !canEdit)) return null;

  return (
    <section className="profile-grids" aria-label="Grids">
      {items.map((it, i) => (
        <div key={it.id} className="profile-grid">
          <TileGrid
            data={it.grid}
            editable={canEdit}
            startEditing={Boolean(it.fresh)}
            onChange={grid => change(it.id, grid)}
            onMoveUp={canEdit && i > 0 ? () => move(it.id, -1) : undefined}
            onMoveDown={canEdit && i < items.length - 1 ? () => move(it.id, 1) : undefined}
            onDelete={canEdit ? () => remove(it.id) : undefined}
          />
        </div>
      ))}
      {canEdit && (
        <div className="profile-grids-bar">
          <button type="button" className="profile-grids-add" onClick={add}>+ Add a grid to your profile</button>
          {saving && <span className="profile-grids-note">Saving…</span>}
          {error && <span className="profile-grids-error" role="alert">{error}</span>}
        </div>
      )}
    </section>
  );
}
