import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FORGOT_PASSWORD } from '../Posts/BasicTextPostServerApi.js';
import { usePageTitle } from '../../../utils/usePageTitle.js';
import './SettingsPage.css';

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
      setMessage(err?.response?.data?.message || 'Something went wrong. Try again shortly.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-card">
        <h1 className="settings-title">Reset your password</h1>
        <p className="settings-section-hint">
          Enter the email address on your account and we will send you a link to choose
          a new password. The link is good for one hour.
        </p>

        <form className="settings-email-form" onSubmit={submit}>
          <input
            type="email"
            className="settings-input"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
          <button type="submit" className="settings-btn settings-btn--primary" disabled={busy}>
            {busy ? 'Sending…' : 'Send link'}
          </button>
        </form>

        {message && <p className="settings-status" role="status">{message}</p>}

        <p style={{ marginTop: 20 }}>
          <Link className="settings-link-btn" style={{ marginLeft: 0 }} to="/routes/Login">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
