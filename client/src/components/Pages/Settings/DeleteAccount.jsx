import { useState } from 'react';
import { DELETE_MY_ACCOUNT } from '../Posts/BasicTextPostServerApi.js';
import { clearLocalSession } from '../../../utils/session.js';
import { errorMessage } from '../../../utils/errorMessage.js';
import { canDelete } from './securityEvents.js';
import './SecuritySection.css';

/** Leave for good: password again, and the username typed to be sure. */
export default function DeleteAccount({ username }) {
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ready = canDelete(typed, username, password);

  const submit = async (e) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setError('');
    try {
      await DELETE_MY_ACCOUNT(password);
      clearLocalSession();
      window.location.href = '/'; // a full load: nothing signed-in stays on screen
    } catch (err) {
      setError(errorMessage(err, 'Could not delete the account.'));
      setBusy(false);
    }
  };

  return (
    <form className="settings-password-form" onSubmit={submit}>
      <p className="settings-section-hint">
        This removes your account, your posts, comments and messages, and every file you uploaded.
        It cannot be undone. If you want a copy first, use &ldquo;Export data&rdquo; on your profile.
      </p>
      <label className="settings-field">
        <span>Your password</span>
        <input type="password" className="settings-input" value={password} autoComplete="current-password"
          onChange={e => setPassword(e.target.value)} maxLength={128} />
      </label>
      <label className="settings-field">
        <span>Type your username ({username}) to confirm</span>
        <input type="text" className="settings-input" value={typed} autoComplete="off" autoCapitalize="none"
          onChange={e => setTyped(e.target.value)} maxLength={64} />
      </label>
      {error && <p className="settings-error" role="alert">{error}</p>}
      <button type="submit" className="settings-btn security-danger" disabled={!ready || busy}>
        {busy ? 'Deleting…' : 'Delete my account'}
      </button>
    </form>
  );
}
