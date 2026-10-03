import { useState, useEffect } from 'react';
import { ADMIN_PREVIEW_STATUS, ADMIN_PREVIEW_RUN } from '../../Posts/BasicTextPostServerApi.js';
import { errorMessage } from '../../../../utils/errorMessage.js';
import { previewsLeft, previewLineText } from './previewLine.js';

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
    ADMIN_PREVIEW_STATUS()
      .then(d => { if (live) setStatus(d); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const run = async () => {
    setRunning(true);
    try {
      setStatus(await ADMIN_PREVIEW_RUN());
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
