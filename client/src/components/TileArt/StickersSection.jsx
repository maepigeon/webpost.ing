import { useEffect, useState } from 'react';
import { GET_STICKERS, CREATE_STICKER, UPDATE_STICKER, DELETE_STICKER } from '../Pages/Posts/BasicTextPostServerApi.js';
import TileGrid from '../Pages/Posts/PostRenderer/RichTextPost/TileGrid/TileGrid.jsx';
import { normaliseGrid, pixelLayer } from '../Pages/Posts/PostRenderer/RichTextPost/TileGrid/tileGrid.js';
import { STICKERS } from './stickers.js';
import { StickerThumb } from './PackThumbs.jsx';
import { useDialog } from '../Dialog/Dialog.jsx';
import { errorMessage } from '../../utils/errorMessage.js';
import './Packs.css';

/** Largest sticker, in tiles on a side; the server clamps to the same. */
const MAX_TILES = 8;

const blankSticker = () => normaliseGrid({ cols: 2, rows: 2, layers: [pixelLayer('Drawing')] });

/**
 * Your sticker collection: small grids drawn in the grid editor. Stickers can
 * be shared in messages as a pack, and saved from packs others send you.
 */
export default function StickersSection({ username }) {
  const [stickers, setStickers] = useState(null);
  const [editing, setEditing] = useState(null);    // {id?, name, grid}
  const [note, setNote] = useState('');
  const { confirm } = useDialog();

  const load = () => GET_STICKERS(username).then(s => setStickers(Array.isArray(s) ? s : [])).catch(() => setStickers([]));
  useEffect(() => { load(); }, [username]);   // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const name = editing.name.trim();
    if (!name) { setNote('Give the sticker a name.'); return; }
    try {
      if (editing.id) await UPDATE_STICKER(username, editing.id, name, editing.grid);
      else await CREATE_STICKER(username, name, editing.grid);
      setNote(`Saved “${name}”.`);
      setEditing(null);
      load();
    } catch (err) { setNote(errorMessage(err, 'Could not save the sticker.')); }
  };

  const remove = async (s) => {
    if (!(await confirm(`Delete the sticker “${s.name}”? Packs you have already shared keep their copies.`))) return;
    try { await DELETE_STICKER(username, s.id); load(); }
    catch (err) { setNote(errorMessage(err, 'Could not delete that sticker.')); }
  };

  return (
    <section className="settings-section">
      <h2 className="settings-section-title">Stickers</h2>
      <p className="settings-section-hint">
        Small grids of your own, up to {MAX_TILES} × {MAX_TILES} tiles. Share them in Messages as a
        pack; anyone you send one to can add a copy to their own stickers.
      </p>

      {stickers && stickers.length > 0 && (
        <ul className="sticker-list">
          {stickers.map(s => (
            <li key={s.id}>
              <StickerThumb grid={s.grid} name={s.name} scale={1} />
              <span className="sticker-list-name">{s.name}</span>
              <button type="button" className="settings-link-btn" onClick={() => { setNote(''); setEditing({ id: s.id, name: s.name, grid: s.grid }); }}>Edit</button>
              <button type="button" className="settings-link-btn" onClick={() => remove(s)}>Delete</button>
            </li>
          ))}
        </ul>
      )}
      {stickers && stickers.length === 0 && !editing && <p className="settings-section-hint">No stickers yet.</p>}

      {!editing ? (
        <div className="sticker-start">
          <span className="sticker-start-label">New sticker from</span>
          <button type="button" className="pack-btn" onClick={() => { setNote(''); setEditing({ name: '', grid: blankSticker() }); }}>Blank</button>
          {Object.entries(STICKERS).map(([k, s]) => (
            <button key={k} type="button" className="pack-btn"
              onClick={() => { setNote(''); setEditing({ name: s.label, grid: s.make() }); }}>{s.label}</button>
          ))}
        </div>
      ) : (
        <div className="sticker-editor">
          <label className="pack-field">Name
            <input value={editing.name} maxLength={40} onChange={e => setEditing(ed => ({ ...ed, name: e.target.value }))} />
          </label>
          <TileGrid data={editing.grid} onChange={grid => setEditing(ed => ({ ...ed, grid }))} editable startEditing
            maxCols={MAX_TILES} maxRows={MAX_TILES} initialColour="#000000" onDone={save} />
          <div className="pack-dialog-actions">
            <button type="button" className="pack-btn" onClick={() => setEditing(null)}>Cancel</button>
            <button type="button" className="pack-btn pack-btn--primary" onClick={save}>Save sticker</button>
          </div>
        </div>
      )}
      {note && <p className="settings-notice" role="status">{note}</p>}
    </section>
  );
}
