import { useEffect, useState } from 'react';
import { REPORT_POST } from '../Pages/Posts/BasicTextPostServerApi.js';
import './ReportDialog.css';

/**
 * Reports a post to the moderators.
 *
 * Reasons are a closed list rather than free text: a fixed set can be sorted,
 * counted and acted on, where a free-text field cannot. The optional details
 * box is there for the context a category cannot carry.
 */

const REASONS = [
  ['spam',           'Spam or advertising'],
  ['harassment',     'Harassment or bullying'],
  ['hate',           'Hate speech'],
  ['violence',       'Violence or threats'],
  ['sexual',         'Sexual content'],
  ['self-harm',      'Self-harm'],
  ['misinformation', 'Misinformation'],
  ['copyright',      'Copyright violation'],
  ['other',          'Something else'],
];

export default function ReportDialog({ postId, postTitle, onClose }) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    if (!reason) return;
    setBusy(true);
    setMessage('');
    setFailed(false);
    try {
      const result = await REPORT_POST(postId, reason, details.trim());
      setMessage(result.message);
      setDone(true);
    } catch (err) {
      setMessage(err?.response?.data?.message || 'Could not send that report.');
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="report-overlay" onMouseDown={onClose}>
      <div className="report-dialog" onMouseDown={e => e.stopPropagation()} role="dialog" aria-label="Report post">
        <p className="report-title">Report this post</p>
        {postTitle && <p className="report-subtitle">“{postTitle}”</p>}

        {done ? (
          <>
            <p className="report-status" role="status">{message}</p>
            <div className="report-actions">
              <button type="button" className="report-btn report-btn--primary" onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <form onSubmit={submit}>
            <fieldset className="report-reasons">
              <legend className="report-legend">What is wrong with it?</legend>
              {REASONS.map(([value, label]) => (
                <label className="report-reason" key={value}>
                  <input type="radio" name="reason" value={value}
                         checked={reason === value}
                         onChange={() => setReason(value)} />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>

            <label className="report-details-label">
              Anything else the moderators should know? <span className="report-optional">Optional</span>
              <textarea
                className="report-details"
                value={details}
                onChange={e => setDetails(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Add context…"
              />
            </label>

            {message && <p className={failed ? 'report-error' : 'report-status'} role="alert">{message}</p>}

            <div className="report-actions">
              <button type="button" className="report-btn report-btn--ghost" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="report-btn report-btn--primary" disabled={busy || !reason}>
                {busy ? 'Sending…' : 'Send report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
