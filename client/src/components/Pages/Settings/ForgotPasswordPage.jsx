import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FORGOT_PASSWORD } from '../Posts/BasicTextPostServerApi.js';
import { usePageTitle } from '../../../utils/usePageTitle.js';
import '../Auth/Login/Login.css';
import { errorMessage } from '../../../utils/errorMessage.js';

/**
 * Requests a password-reset email.
 *
 * The response is identical whether or not the address belongs to an account,
 * so this page cannot be used to find out who is registered. That means the
 * confirmation below is deliberately non-committal — it is not a bug.
 */
export default function ForgotPasswordPage() {
  usePageTitle('Reset your password');

  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const result = await FORGOT_PASSWORD(email.trim());
      setMessage(result.message);
    } catch (err) {
      setMessage(errorMessage(err, 'Something went wrong. Try again shortly.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <span className="login-logo-text">webpost.ing</span>
          <span className="login-subtitle">Reset your password</span>
        </div>

        <p className="login-note">
          Enter the email address on your account and we will send you a link to
          choose a new password. The link is good for one hour.
        </p>

        <form onSubmit={submit} noValidate>
          <div className="login-field">
            <label className="login-label" htmlFor="reset-email">Email</label>
            <input
              className="login-input"
              type="email"
              id="reset-email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              autoFocus
              required
            />
          </div>
          {message && <div className="login-success" role="status">{message}</div>}
          <button type="submit" className="login-submit-btn" disabled={busy}>
            {busy ? 'Sending…' : 'Send link'}
          </button>
        </form>

        <div className="login-have-code">
          <Link to="/routes/Login" className="login-register-link">Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
