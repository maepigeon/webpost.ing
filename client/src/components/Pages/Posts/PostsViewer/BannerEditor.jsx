import { useRef, useState } from 'react';
import TileGrid from '../PostRenderer/RichTextPost/TileGrid/TileGrid.jsx';
import { normaliseGrid, pixelLayer } from '../PostRenderer/RichTextPost/TileGrid/tileGrid.js';
import { SET_PROFILE_BANNER } from '../BasicTextPostServerApi.js';
import { errorMessage } from '../../../../utils/errorMessage.js';
import { BANNER_COLS } from './bannerGrid.js';
import { useUnsavedGuard } from '../../../../utils/useUnsavedGuard.js';
import { useDialog } from '../../../Dialog/Dialog.jsx';
import { loadDraft } from '../../../../utils/autosave.js';
import { useAutosave } from '../../../../utils/useAutosave.js';

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
  const start = () => saved || normaliseGrid({
    v: 3, cols: BANNER_COLS, rows: 4, layers: [pixelLayer('Background'), pixelLayer('Text')],
  });
  // Unsaved work from an earlier visit comes back by itself, with a way out.
  const draftKey = `banner:${username}`;
  const [init] = useState(() => {
    const kept = loadDraft(draftKey);
    if (kept?.data && typeof kept.data === 'object') {
      try { return { grid: normaliseGrid(kept.data), restored: true }; } catch { /* use the saved rows */ }
    }
    return { grid: start(), restored: false };
  });
  const [draft, setDraft] = useState(init.grid);
  const [restored, setRestored] = useState(init.restored);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Unsaved once the draft differs from what it started as; leaving the page,
  // or Cancel, then asks first.
  const first = useRef(null);
  if (first.current === null) first.current = JSON.stringify(start());
  const [savedNow, setSavedNow] = useState(false);
  const dirty = !savedNow && JSON.stringify(draft) !== first.current;
  useUnsavedGuard(dirty, 'your banner');
  const auto = useAutosave(draftKey, draft, { enabled: !savedNow });
  const undoRestore = () => {
    auto.clear();
    setDraft(start());
    setRestored(false);
  };
  const { confirm } = useDialog();
  const cancel = async () => {
    if (dirty && !(await confirm("You haven't saved your banner. Discard the changes?", 'Unsaved changes', 'Discard'))) return;
    auto.clear();
    onClose();
  };

  const save = async (grid) => {
    setBusy(true);
    setError('');
    try {
      const result = await SET_PROFILE_BANNER(username, grid);
      setSavedNow(true);
      auto.clear();
      onSaved(grid ? result.grid : null);
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Could not save the banner.'));
      setBusy(false);
    }
  };

  return (
    <div className="banner-editor">
      {restored && (
        <p className="banner-editor-unsaved" role="status">
          Restored your unsaved changes{' '}
          <button type="button" className="edit-bio-btn" onClick={undoRestore}>Undo</button>
        </p>
      )}
      <TileGrid data={draft} onChange={setDraft} editable startEditing lockCols
        maxCols={BANNER_COLS} maxRows={12} initialColour={pageInk()} />
      <div className="banner-editor-actions">
        <button type="button" className="edit-bio-btn" disabled={busy} onClick={() => save(draft)}>
          {busy ? 'Saving…' : 'Save banner'}
        </button>
        {dirty && !busy && <span className="banner-editor-unsaved" role="status">Not saved yet</span>}
        <button type="button" className="edit-bio-btn" disabled={busy} onClick={cancel}>Cancel</button>
        {saved && (
          <button type="button" className="edit-bio-btn" disabled={busy} onClick={() => save(null)}>Remove my rows</button>
        )}
        {error && <span className="profile-inline-error" role="alert">{error}</span>}
      </div>
    </div>
  );
}
