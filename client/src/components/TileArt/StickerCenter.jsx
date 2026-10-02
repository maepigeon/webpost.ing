import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { GET_STICKERS, CREATE_STICKER, GET_PIXEL_FONTS } from '../Pages/Posts/BasicTextPostServerApi.js';
import { STICKERS } from './stickers.js';
import { StickerThumb, PackPreview } from './PackThumbs.jsx';
import { errorMessage } from '../../utils/errorMessage.js';
import { usePageTitle } from '../../utils/usePageTitle.js';
import './Packs.css';

/**
 * Every sticker and symbols pack you can use, in one place: the built-in
 * stickers, your own, and your pixel fonts. As a page it lets you copy a
 * built-in into your collection; given `onPick` it is a chooser, and picking
 * a sticker hands its grid back.
 */
export function StickerCenter({ onPick, showSymbols = !onPick }) {
  const me = localStorage.getItem('userName');
  const [tab, setTab] = useState('stickers');
  const [mine, setMine] = useState(null);
  const [fonts, setFonts] = useState(null);
  const [note, setNote] = useState('');

  const loadMine = () => {
    if (!me) { setMine([]); return; }
    GET_STICKERS(me).then(s => setMine(Array.isArray(s) ? s : [])).catch(() => setMine([]));
  };
  useEffect(() => {
    loadMine();
    if (me) GET_PIXEL_FONTS(me).then(f => setFonts(Array.isArray(f) ? f : [])).catch(() => setFonts([]));
    else setFonts([]);
  }, [me]);   // eslint-disable-line react-hooks/exhaustive-deps

  const addBuiltIn = async (s) => {
    try {
      await CREATE_STICKER(me, s.label, s.make());
      setNote(`Added “${s.label}” to your stickers.`);
      loadMine();
    } catch (err) { setNote(errorMessage(err, 'Could not add that sticker.')); }
  };

  const tile = (key, grid, name, action) => (
    <li key={key} className="center-item">
      {onPick ? (
        <button type="button" className="pack-pick" onClick={() => onPick(grid)} title={`Use “${name}”`}>
          <StickerThumb grid={grid} name={name} />
        </button>
      ) : <span className="center-item-art"><StickerThumb grid={grid} name={name} /></span>}
      <span className="center-item-name">{name}</span>
      {action}
    </li>
  );

  return (
    <div className="sticker-center">
      {showSymbols && (
        <div className="pack-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'stickers'}
            className={tab === 'stickers' ? 'is-on' : ''} onClick={() => setTab('stickers')}>Stickers</button>
          <button type="button" role="tab" aria-selected={tab === 'symbols'}
            className={tab === 'symbols' ? 'is-on' : ''} onClick={() => setTab('symbols')}>Symbols</button>
        </div>
      )}

      {tab === 'stickers' && (
        <>
          <h2 className="center-heading">Yours</h2>
          {mine === null ? <p className="pack-hint">Loading…</p>
            : mine.length === 0 ? (
              <p className="pack-hint">
                {me ? <>None yet. Draw one under <Link className="settings-link" to="/customize">Customize → Stickers</Link>, add a built-in below, or save a pack someone sends you.</>
                  : 'Sign in to keep stickers of your own.'}
              </p>
            ) : <ul className="center-grid">{mine.map(s => tile(s.id, s.grid, s.name, null))}</ul>}

          <h2 className="center-heading">Built in</h2>
          <ul className="center-grid">
            {Object.entries(STICKERS).map(([k, s]) => tile(k, s.make(), s.label,
              !onPick && me ? <button type="button" className="pack-btn" onClick={() => addBuiltIn(s)}>Add to mine</button> : null))}
          </ul>
        </>
      )}

      {tab === 'symbols' && (
        fonts === null ? <p className="pack-hint">Loading…</p>
          : fonts.length === 0 ? (
            <p className="pack-hint">No symbols packs yet. Draw characters in a grid&apos;s “Custom characters” and save them as a font, or save a pack someone sends you.</p>
          ) : (
            <ul className="center-fonts">
              {fonts.map(f => (
                <li key={f.id}>
                  <span className="pack-font-name">{f.name}</span>
                  <PackPreview kind="symbols" body={f.glyphs} max={40} />
                </li>
              ))}
            </ul>
          )
      )}

      {!onPick && (
        <p className="pack-hint">To send a pack to someone, open a conversation in <Link className="settings-link" to="/messages">Messages</Link> and press Pack.</p>
      )}
      {note && <p className="settings-notice" role="status">{note}</p>}
    </div>
  );
}

export default function StickerCenterPage() {
  usePageTitle('Sticker center');
  return (
    <div className="settings-page">
      <div className="settings-card">
        <h1 className="settings-title">Sticker center</h1>
        <p className="settings-section-hint">Your stickers and symbols packs, and the ones built in.</p>
        <StickerCenter />
      </div>
    </div>
  );
}
