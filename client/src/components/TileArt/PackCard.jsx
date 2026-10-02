import { useEffect, useState } from 'react';
import { GET_SHARED_PACK, SAVE_SHARED_PACK } from '../Pages/Posts/BasicTextPostServerApi.js';
import { errorMessage } from '../../utils/errorMessage.js';
import { PACK_KINDS } from '../../utils/packMessage.js';
import { PackPreview } from './PackThumbs.jsx';
import './Packs.css';

/**
 * A pack shared in a message: what is in it, and a button that copies it into
 * the reader's own stickers or pixel fonts. The sender sees no button.
 */
export default function PackCard({ id, mine }) {
  const [pack, setPack] = useState(null);
  const [missing, setMissing] = useState(false);
  const [state, setState] = useState('idle');   // idle | saving | saved
  const [note, setNote] = useState('');

  useEffect(() => {
    let live = true;
    GET_SHARED_PACK(id).then(p => { if (live) setPack(p); }).catch(() => { if (live) setMissing(true); });
    return () => { live = false; };
  }, [id]);

  if (missing) return <div className="pack-card pack-card--missing">This pack is no longer available.</div>;
  if (!pack) return <div className="pack-card pack-card--loading">Loading pack…</div>;

  const count = Array.isArray(pack.body) ? pack.body.length : Object.keys(pack.body || {}).length;
  const unit = pack.kind === 'stickers' ? (count === 1 ? 'sticker' : 'stickers') : (count === 1 ? 'symbol' : 'symbols');

  const save = async () => {
    setState('saving');
    setNote('');
    try {
      await SAVE_SHARED_PACK(id);
      setState('saved');
      setNote(pack.kind === 'stickers' ? 'Added to your stickers.' : 'Saved as one of your pixel fonts.');
    } catch (err) {
      setState('idle');
      setNote(errorMessage(err, 'Could not save this pack.'));
    }
  };

  return (
    <div className="pack-card" onClick={e => e.stopPropagation()}>
      <div className="pack-card-head">
        <span className="pack-card-name">{pack.name}</span>
        <span className="pack-card-meta">{PACK_KINDS[pack.kind]} · {count} {unit}</span>
      </div>
      <PackPreview kind={pack.kind} body={pack.body} />
      {!mine && (
        <button type="button" className="pack-card-save" onClick={save} disabled={state !== 'idle'}>
          {state === 'saved' ? 'Saved' : state === 'saving' ? 'Saving…'
            : pack.kind === 'stickers' ? 'Add to my stickers' : 'Save as my pixel font'}
        </button>
      )}
      {note && <p className="pack-card-note" role="status">{note}</p>}
    </div>
  );
}
