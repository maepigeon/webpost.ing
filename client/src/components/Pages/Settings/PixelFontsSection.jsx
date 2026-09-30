import { useEffect, useState } from 'react';
import { GET_PIXEL_FONTS, DELETE_PIXEL_FONT } from '../Posts/BasicTextPostServerApi.js';
import { useDialog } from '../../Dialog/Dialog.jsx';

/**
 * The user's pixel font libraries. They are made and updated in a grid's
 * character designer ("Custom characters"); here they can be seen and removed.
 */
export default function PixelFontsSection({ username }) {
  const [fonts, setFonts] = useState(null);
  const [error, setError] = useState('');
  const { confirm } = useDialog();

  const load = () => GET_PIXEL_FONTS(username).then(setFonts).catch(() => setFonts([]));
  useEffect(() => { load(); }, [username]);   // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async (font) => {
    if (!(await confirm(`Delete the pixel font “${font.name}”? Grids that use it keep their copies.`))) return;
    try { await DELETE_PIXEL_FONT(username, font.id); load(); }
    catch { setError('Could not delete that font.'); }
  };

  return (
    <section className="settings-section">
      <h2 className="settings-section-title">Pixel fonts</h2>
      <p className="settings-section-hint">
        Your own characters, drawn in a grid&apos;s “Custom characters” designer and saved as a
        font to reuse in any grid. A grid keeps a copy of what it uses, so deleting a
        font here never changes a post.
      </p>
      {fonts === null ? null : fonts.length === 0 ? (
        <p className="settings-section-hint">No pixel fonts yet.</p>
      ) : (
        <ul className="settings-font-list">
          {fonts.map(f => (
            <li key={f.id}>
              <span className="settings-font-name">{f.name}</span>
              <span className="settings-font-glyphs">{Object.keys(f.glyphs || {}).join(' ')}</span>
              <button type="button" className="settings-link-btn" onClick={() => remove(f)}>Delete</button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="settings-notice" role="alert">{error}</p>}
    </section>
  );
}
