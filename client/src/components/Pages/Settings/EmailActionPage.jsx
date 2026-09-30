import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { VERIFY_EMAIL, UNSUBSCRIBE_EMAIL, RESET_PASSWORD } from '../Posts/BasicTextPostServerApi.js';
import { usePageTitle } from '../../../utils/usePageTitle.js';
import '../Auth/Login/Login.css';
import { PasswordRequirements } from '../Auth/Registration/Registration.jsx';
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
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <span className="login-logo-text">webpost.ing</span>
          <span className="login-subtitle">{titles[mode]}</span>
        </div>

        {mode === 'reset' && !done ? (
          <form onSubmit={submitReset} noValidate>
            <p className="login-note">
              Every device signed in to this account will be signed out.
            </p>
            <div className="login-field">
              <label className="login-label" htmlFor="new-password">New password</label>
              <input
                className="login-input"
                type="password"
                id="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              {password && <PasswordRequirements password={password} />}
            </div>
            <div className="login-field">
              <label className="login-label" htmlFor="confirm-password">Confirm new password</label>
              <input
                className="login-input"
                type="password"
                id="confirm-password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            {message && failed && <div className="login-error" role="alert">{message}</div>}
            <button type="submit" className="login-submit-btn" disabled={busy}>
              {busy ? 'Changing…' : 'Change password'}
            </button>
          </form>
        ) : busy ? (
          <p className="login-note">Working…</p>
        ) : message ? (
          <div className={failed ? 'login-error' : 'login-success'} role="status">{message}</div>
        ) : null}

        {!busy && (
          <div className="login-have-code">
            <Link className="login-register-link" to={done || mode === 'reset' ? '/routes/Login' : '/'}>
              {done || mode === 'reset' ? 'Go to sign in' : 'Back to webpost.ing'}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
