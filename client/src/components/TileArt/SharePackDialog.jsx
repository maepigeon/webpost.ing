import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GET_STICKERS, GET_PIXEL_FONTS, SHARE_PACK } from '../Pages/Posts/BasicTextPostServerApi.js';
import { errorMessage } from '../../utils/errorMessage.js';
import { packMessage } from '../../utils/packMessage.js';
import { PackPreview, StickerThumb } from './PackThumbs.jsx';
import './Packs.css';

/**
 * Pick a pack to share in a conversation: some of your stickers, under a name
 * you give the pack, or one of your pixel fonts as a symbols pack. On share it
 * hands the message text to `onSend`, which posts it like any other message.
 *
 * Rendered into <body>: the messages page's backdrop-filter would otherwise
 * trap the fixed overlay inside it. Focus moves in on open, stays in while it
 * is open, and goes back to whatever opened it on close.
 */
export default function SharePackDialog({ username, onSend, onClose }) {
  const [tab, setTab] = useState('stickers');
  const [stickers, setStickers] = useState(null);
  const [fonts, setFonts] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [name, setName] = useState('');
  const [fontId, setFontId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef(null);

  useEffect(() => {
    GET_STICKERS(username).then(s => setStickers(Array.isArray(s) ? s : [])).catch(() => setStickers([]));
    GET_PIXEL_FONTS(username).then(f => setFonts(Array.isArray(f) ? f : [])).catch(() => setFonts([]));
  }, [username]);

  useEffect(() => {
    const opener = document.activeElement;
    dialogRef.current?.querySelector('[role="tab"][aria-selected="true"]')?.focus();
    return () => { if (opener && document.contains(opener)) opener.focus(); };
  }, []);

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll('button:not(:disabled), input, [tabindex]:not([tabindex="-1"])')];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!dialogRef.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const switchTab = (next) => {
    setTab(next);
    dialogRef.current?.querySelector(`#pack-tab-${next}`)?.focus();
  };
  const onTabKey = (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); switchTab(tab === 'stickers' ? 'symbols' : 'stickers'); }
  };

  const toggle = (id) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const ready = tab === 'stickers' ? picked.size > 0 && name.trim() : fontId != null;

  const share = async () => {
    if (!ready) return;
    setBusy(true);
    setError('');
    try {
      const pack = tab === 'stickers'
        ? { kind: 'stickers', name: name.trim().slice(0, 40), stickerIds: [...picked] }
        : { kind: 'symbols', fontId };
      const { id } = await SHARE_PACK(pack);
      const shownName = tab === 'stickers' ? pack.name : fonts.find(f => f.id === fontId)?.name || 'Symbols';
      await onSend(packMessage(pack.kind, shownName, id));
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Could not share that pack.'));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="pack-dialog-backdrop" onClick={onClose}>
      <div className="pack-dialog" role="dialog" aria-modal="true" aria-label="Share a pack" ref={dialogRef}
        onClick={e => e.stopPropagation()}>
        <div className="pack-dialog-title">Share a pack</div>
        <div className="pack-tabs" role="tablist" aria-label="Kind of pack" onKeyDown={onTabKey}>
          {[['stickers', 'Stickers'], ['symbols', 'Symbols']].map(([k, label]) => (
            <button key={k} id={`pack-tab-${k}`} type="button" role="tab" aria-selected={tab === k}
              aria-controls="pack-tabpanel" tabIndex={tab === k ? 0 : -1}
              className={tab === k ? 'is-on' : ''} onClick={() => switchTab(k)}>{label}</button>
          ))}
        </div>

        <div id="pack-tabpanel" role="tabpanel" aria-labelledby={`pack-tab-${tab}`} className="pack-tabpanel">

        {tab === 'stickers' && (
          stickers === null ? <p className="pack-hint">Loading…</p>
          : stickers.length === 0 ? <p className="pack-hint">You have no stickers yet. Draw some under Customize → Stickers.</p>
          : (
            <>
              <p className="pack-hint">Pick the stickers to send. They get a copy; your own stay as they are.</p>
              <div className="pack-pick-grid">
                {stickers.map(s => (
                  <button key={s.id} type="button" className={`pack-pick${picked.has(s.id) ? ' is-on' : ''}`}
                    aria-pressed={picked.has(s.id)} onClick={() => toggle(s.id)} title={s.name}>
                    <StickerThumb grid={s.grid} name={s.name} scale={2} />
                  </button>
                ))}
              </div>
              <label className="pack-field">Pack name
                <input value={name} maxLength={40} onChange={e => setName(e.target.value)} placeholder="e.g. Cat faces" />
              </label>
            </>
          )
        )}

        {tab === 'symbols' && (
          fonts === null ? <p className="pack-hint">Loading…</p>
          : fonts.length === 0 ? <p className="pack-hint">You have no pixel fonts yet. Draw characters in a grid&apos;s “Custom characters” and save them as a font.</p>
          : (
            <div className="pack-font-list">
              {fonts.map(f => (
                <button key={f.id} type="button" className={`pack-font${fontId === f.id ? ' is-on' : ''}`}
                  aria-pressed={fontId === f.id} onClick={() => setFontId(f.id)}>
                  <span className="pack-font-name">{f.name}</span>
                  <PackPreview kind="symbols" body={f.glyphs} max={8} />
                </button>
              ))}
            </div>
          )
        )}
        </div>

        {error && <p className="pack-error" role="alert">{error}</p>}
        <div className="pack-dialog-actions">
          <button type="button" className="pack-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="pack-btn pack-btn--primary" onClick={share} disabled={!ready || busy}>
            {busy ? 'Sharing…' : 'Share'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
