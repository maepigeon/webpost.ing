import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CHANGE_MY_PASSWORD } from '../Posts/BasicTextPostServerApi.js';
import { PasswordRequirements } from '../Auth/Registration/Registration.jsx';
import { errorMessage } from '../../../utils/errorMessage.js';
import '../Auth/Login/Login.css';

/**
 * Change your own password: the current one, then the new one twice. On
 * success every session is ended, so you are sent to sign in with the new one.
 */
export default function ChangePassword({ username }) {
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const mismatch = again !== '' && again !== next;
  const ready = current && next && again && !mismatch;

  const submit = async (e) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try {
      await CHANGE_MY_PASSWORD(username, current, next);
      // Signed out everywhere, here included: forget who was signed in.
      localStorage.removeItem('userName');
      navigate('/routes/Login', { state: { notice: 'Password changed. Sign in with your new password.' } });
    } catch (err) {
      setError(errorMessage(err, 'Could not change your password.'));
      setBusy(false);
    }
  };

  return (
    <form className="settings-password-form" onSubmit={submit}>
      <label className="settings-field">
        <span>Current password</span>
        <input type="password" className="settings-input" value={current} autoComplete="current-password"
          onChange={e => setCurrent(e.target.value)} maxLength={128} />
      </label>
      <label className="settings-field">
        <span>New password</span>
        <input type="password" className="settings-input" value={next} autoComplete="new-password"
          onChange={e => setNext(e.target.value)} maxLength={128} />
      </label>
      {next && <PasswordRequirements password={next} />}
      <label className="settings-field">
        <span>New password again</span>
        <input type="password" className="settings-input" value={again} autoComplete="new-password"
          onChange={e => setAgain(e.target.value)} maxLength={128} aria-invalid={mismatch || undefined} />
      </label>
      {mismatch && <p className="settings-error" role="alert">The two new passwords don&rsquo;t match.</p>}
      {error && <p className="settings-error" role="alert">{error}</p>}
      <p className="settings-section-hint">Changing it signs you out everywhere, including here.</p>
      <button type="submit" className="settings-btn settings-btn--primary" disabled={!ready || busy}
        title={ready ? undefined : 'Fill in all three'}>
        {busy ? 'Changing…' : 'Change password'}
      </button>
    </form>
  );
}
