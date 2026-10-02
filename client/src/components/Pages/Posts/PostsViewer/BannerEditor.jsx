import { useState } from 'react';
import TileGrid from '../PostRenderer/RichTextPost/TileGrid/TileGrid.jsx';
import { normaliseGrid, pixelLayer } from '../PostRenderer/RichTextPost/TileGrid/tileGrid.js';
import { SET_PROFILE_BANNER } from '../BasicTextPostServerApi.js';
import { errorMessage } from '../../../../utils/errorMessage.js';
import { BANNER_COLS } from './bannerGrid.js';

/** The page's text colour, a hex value, for drawing on the transparent banner. */
function pageInk() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--th-ink').trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : '#111111';
}

/**
 * Editing the banner's own rows, right on the profile: the grid editor under
 * the site's four rows, with Save and Cancel. Shown only to the owner.
 *
 * Starts from their saved rows, or from empty transparent ones; Save keeps
 * the draft, Remove takes the rows away, Cancel leaves everything as it was.
 */
export default function BannerEditor({ username, saved, onSaved, onClose }) {
  const [draft, setDraft] = useState(() => saved || normaliseGrid({
    v: 3, cols: BANNER_COLS, rows: 4, layers: [pixelLayer('Background'), pixelLayer('Text')],
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (grid) => {
    setBusy(true);
    setError('');
    try {
      const result = await SET_PROFILE_BANNER(username, grid);
      onSaved(grid ? result.grid : null);
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Could not save the banner.'));
      setBusy(false);
    }
  };

  return (
    <div className="banner-editor">
      <TileGrid data={draft} onChange={setDraft} editable startEditing lockCols
        maxCols={BANNER_COLS} maxRows={12} initialColour={pageInk()} />
      <div className="banner-editor-actions">
        <button type="button" className="edit-bio-btn" disabled={busy} onClick={() => save(draft)}>
          {busy ? 'Saving…' : 'Save banner'}
        </button>
        <button type="button" className="edit-bio-btn" disabled={busy} onClick={onClose}>Cancel</button>
        {saved && (
          <button type="button" className="edit-bio-btn" disabled={busy} onClick={() => save(null)}>Remove my rows</button>
        )}
        {error && <span className="profile-inline-error" role="alert">{error}</span>}
      </div>
    </div>
  );
}
