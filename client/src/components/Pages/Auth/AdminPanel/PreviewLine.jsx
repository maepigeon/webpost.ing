import { useState, useEffect } from 'react';
import axios from 'axios';
import { BASE_URL } from '../../../../config.js';
import { errorMessage } from '../../../../utils/errorMessage.js';
import { previewsLeft, previewLineText } from './previewLine.js';

// The two admin calls for the background card-preview fill (PreviewAdminController).
const STATUS_URL = '/api/admin/previews';
const RUN_URL = '/api/admin/previews/run';

/**
 * One quiet line on the Stats tab: how many posts still wait for a card
 * preview, with a "Run now" button while any do. Nothing is drawn until the
 * server has answered, and a failed status call draws nothing at all.
 */
export default function PreviewLine({ flash }) {
  const [status, setStatus] = useState(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let live = true;
    axios.get(BASE_URL + STATUS_URL, { withCredentials: true })
      .then(r => { if (live) setStatus(r.data); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const run = async () => {
    setRunning(true);
    try {
      const r = await axios.post(BASE_URL + RUN_URL, null, { withCredentials: true });
      setStatus(r.data);
    } catch (e) {
      flash?.(errorMessage(e, 'Could not run the card previews.'));
    } finally {
      setRunning(false);
    }
  };

  const text = previewLineText(status);
  if (!text) return null;
  return (
    <div className="admin-preview-line" role="status">
      <span>{text}</span>
      {previewsLeft(status) > 0 && (
        <button type="button" className="admin-btn" onClick={run} disabled={running}>
          {running ? 'Running…' : 'Run now'}
        </button>
      )}
    </div>
  );
}
