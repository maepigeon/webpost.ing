import { useEffect, useState } from 'react';
import { GET_MY_SESSIONS, GET_SECURITY_EVENTS, END_OTHER_SESSIONS } from '../Posts/BasicTextPostServerApi.js';
import { errorMessage } from '../../../utils/errorMessage.js';
import { devicesText, eventLabel, roughPlace, whenText } from './securityEvents.js';
import './SecuritySection.css';

/** Where you are signed in, what happened lately, and a way to cut others off. */
export default function SecuritySection() {
  const [count, setCount] = useState(null);
  const [events, setEvents] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    GET_MY_SESSIONS().then(d => setCount(d.count)).catch(() => setCount(null));
    GET_SECURITY_EVENTS().then(d => setEvents(d.events || [])).catch(() => setEvents([]));
  };
  useEffect(load, []);

  const endOthers = async () => {
    setBusy(true); setError(''); setNote('');
    try {
      const r = await END_OTHER_SESSIONS();
      setNote(r.ended ? `Signed out of ${r.ended} other ${r.ended === 1 ? 'device' : 'devices'}.` : 'There were no other devices.');
      load();
    } catch (err) {
      setError(errorMessage(err, 'Could not sign the other devices out.'));
    }
    setBusy(false);
  };

  const openPassword = () => {
    const el = document.getElementById('settings-password');
    if (el) { el.open = true; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  };

  return (
    <div className="security-section">
      {count != null && <p className="security-devices">{devicesText(count)}</p>}
      <button type="button" className="settings-btn" onClick={endOthers} disabled={busy || count === 1}>
        {busy ? 'Signing out…' : 'Sign out everywhere else'}
      </button>
      {note && <p className="settings-section-hint" role="status">{note}</p>}
      {error && <p className="settings-error" role="alert">{error}</p>}

      <h3 className="security-heading">Recent activity</h3>
      {events == null && <p className="settings-section-hint">Loading…</p>}
      {events && events.length === 0 && <p className="settings-section-hint">Nothing recorded yet.</p>}
      {events && events.length > 0 && (
        <ul className="security-list">
          {events.map((e, i) => (
            <li key={i}>
              <span className="security-what">{eventLabel(e.kind)}</span>
              <span className="security-meta">
                {[whenText(e.createdAt), e.device, roughPlace(e.ipPrefix)].filter(Boolean).join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="settings-section-hint">
        See something you didn&rsquo;t do? <button type="button" className="security-link" onClick={openPassword}>Change your password</button>;
        that signs out every device.
      </p>
    </div>
  );
}
