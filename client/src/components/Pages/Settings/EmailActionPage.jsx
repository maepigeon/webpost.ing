import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { VERIFY_EMAIL, UNSUBSCRIBE_EMAIL, RESET_PASSWORD } from '../Posts/BasicTextPostServerApi.js';
import { usePageTitle } from '../../../utils/usePageTitle.js';
import './SettingsPage.css';
import { errorMessage } from '../../../utils/errorMessage.js';

/**
 * The landing page for links sent by email: confirm an address, unsubscribe, or
 * set a new password.
 *
 * All three are deliberately usable while logged out — the whole point of an
 * emailed link is that it works from an inbox, on a device that may never have
 * signed in. The token in the URL is the credential.
 *
 * @param {'verify'|'unsubscribe'|'reset'} mode
 */
export default function EmailActionPage({ mode }) {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const category = params.get('category') || 'all';

  const titles = {
    verify: 'Confirm your email',
    unsubscribe: 'Unsubscribe',
    reset: 'Choose a new password',
  };
  usePageTitle(titles[mode]);

  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(mode !== 'reset');

  // Password reset needs input, so it waits; the other two act immediately.
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (mode === 'reset') return;
    if (!token) {
      setMessage('This link is missing its token. Try opening it from the email again.');
      setFailed(true);
      setBusy(false);
      return;
    }
    const action = mode === 'verify'
      ? VERIFY_EMAIL(token)
      : UNSUBSCRIBE_EMAIL(token, category);

    action
      .then(result => { setMessage(result.message); setFailed(false); })
      .catch(err => {
        setMessage(errorMessage(err, 'That link could not be used.'));
        setFailed(true);
      })
      .finally(() => setBusy(false));
  }, [mode, token, category]);

  const submitReset = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setMessage('Those passwords do not match.');
      setFailed(true);
      return;
    }
    setBusy(true);
    setMessage('');
    setFailed(false);
    try {
      const result = await RESET_PASSWORD(token, password);
      setMessage(result.message);
      setDone(true);
    } catch (err) {
      setMessage(errorMessage(err, 'Could not change your password.'));
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-card">
        <h1 className="settings-title">{titles[mode]}</h1>

        {mode === 'reset' && !done ? (
          <form onSubmit={submitReset}>
            <p className="settings-section-hint">
              Choose a new password. Every device signed in to this account will be
              signed out.
            </p>
            <div className="settings-email-form" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <input
                type="password"
                className="settings-input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="New password (at least 8 characters)"
                autoComplete="new-password"
                minLength={8}
                required
              />
              <input
                type="password"
                className="settings-input"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                autoComplete="new-password"
                required
              />
              <button type="submit" className="settings-btn settings-btn--primary" disabled={busy}>
                {busy ? 'Changing…' : 'Change password'}
              </button>
            </div>
          </form>
        ) : busy ? (
          <p className="settings-loading">Working…</p>
        ) : null}

        {message && (
          <p className={failed ? 'settings-error' : 'settings-status'} role="status">{message}</p>
        )}

        {!busy && (
          <p style={{ marginTop: 20 }}>
            <Link className="settings-link-btn" style={{ marginLeft: 0 }} to={done || mode === 'reset' ? '/routes/Login' : '/'}>
              {done || mode === 'reset' ? 'Go to sign in' : 'Back to webpost.ing'}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
