import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GET_SETTINGS, UPDATE_EMAIL_PREFERENCES, UPDATE_EMAIL_ADDRESS, RESEND_VERIFICATION,
} from '../Posts/BasicTextPostServerApi.js';
import { usePageTitle } from '../../../utils/usePageTitle.js';
import './SettingsPage.css';

/**
 * Account settings — currently the email address and what it is used for.
 *
 * Email is optional both for the user and for the deployment. When the server
 * reports mailEnabled: false the page says so rather than offering a
 * verification that could never arrive, and the notification toggles are
 * disabled so nobody sets a preference that will not be honoured.
 */

const CATEGORIES = [
  { key: 'onDirectMessage', label: 'Direct messages',
    hint: 'When someone sends you a message.' },
  { key: 'onNewFollower', label: 'New followers',
    hint: 'When someone starts following you.' },
  { key: 'onFollowedPost', label: 'Posts from people you follow',
    hint: 'When someone you follow publishes something.' },
  { key: 'onPostPublished', label: 'Your own publish receipts',
    hint: 'A confirmation to you each time one of your posts goes live.' },
];

export default function SettingsPage() {
  usePageTitle('Settings');
  const navigate = useNavigate();

  const username = localStorage.getItem('userName');
  const [settings, setSettings] = useState(null);
  const [emailInput, setEmailInput] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!username) { navigate('/routes/Login'); return; }
    GET_SETTINGS(username)
      .then(data => { setSettings(data); setEmailInput(data.email || ''); })
      .catch(() => setError('Could not load your settings. Try reloading the page.'))
      .finally(() => setLoading(false));
  }, [username, navigate]);

  const togglePreference = useCallback(async (key, value) => {
    // Optimistic: the toggle should feel immediate, and it is reverted below if
    // the request fails.
    const previous = settings.preferences;
    setSettings(s => ({ ...s, preferences: { ...s.preferences, [key]: value } }));
    setStatus('');
    setError('');
    try {
      const updated = await UPDATE_EMAIL_PREFERENCES(username, { [key]: value });
      setSettings(s => ({ ...s, preferences: updated }));
      setStatus('Saved.');
    } catch {
      setSettings(s => ({ ...s, preferences: previous }));
      setError('Could not save that. Try again.');
    }
  }, [settings, username]);

  const saveEmail = async (e) => {
    e.preventDefault();
    setSaving(true);
    setStatus('');
    setError('');
    try {
      const result = await UPDATE_EMAIL_ADDRESS(username, emailInput.trim());
      setSettings(s => ({ ...s, email: result.email, emailVerified: result.emailVerified }));
      setStatus(result.message);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not save that address.');
    } finally {
      setSaving(false);
    }
  };

  const resend = async () => {
    setStatus('');
    setError('');
    try {
      const result = await RESEND_VERIFICATION(username);
      setStatus(result.message);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not send that email.');
    }
  };

  if (loading) return <div className="settings-page"><p className="settings-loading">Loading…</p></div>;
  if (!settings) return <div className="settings-page"><p className="settings-error">{error}</p></div>;

  const { email, emailVerified, mailEnabled, preferences } = settings;
  const addressChanged = emailInput.trim() !== (email || '');
  const notificationsUsable = mailEnabled && emailVerified;

  return (
    <div className="settings-page">
      <div className="settings-card">
        <h1 className="settings-title">Settings</h1>

        {!mailEnabled && (
          <p className="settings-notice">
            Email is switched off on this server, so nothing will be sent. You can still
            save an address and choose preferences — they take effect if email is turned on.
          </p>
        )}

        {/* ── Email address ───────────────────────────────────────────────── */}
        <section className="settings-section">
          <h2 className="settings-section-title">Email address</h2>
          <p className="settings-section-hint">
            Optional. Used for notifications and to reset your password if you forget it.
            It is never shown to anyone else.
          </p>

          <form className="settings-email-form" onSubmit={saveEmail}>
            <input
              type="email"
              className="settings-input"
              value={emailInput}
              onChange={e => setEmailInput(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              maxLength={255}
            />
            <button type="submit" className="settings-btn settings-btn--primary"
                    disabled={saving || !addressChanged}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </form>

          {email && (
            <p className={`settings-verify-state settings-verify-state--${emailVerified ? 'ok' : 'pending'}`}>
              {emailVerified
                ? <>✓ <strong>{email}</strong> is confirmed.</>
                : <>
                    <strong>{email}</strong> is not confirmed yet.
                    {mailEnabled && (
                      <button type="button" className="settings-link-btn" onClick={resend}>
                        Resend the confirmation email
                      </button>
                    )}
                  </>}
            </p>
          )}
        </section>

        {/* ── Notification preferences ────────────────────────────────────── */}
        <section className="settings-section">
          <h2 className="settings-section-title">Email notifications</h2>

          {!notificationsUsable && (
            <p className="settings-section-hint">
              {mailEnabled
                ? 'Confirm your address above to start receiving these.'
                : 'These are saved, but nothing is sent while email is off.'}
            </p>
          )}

          <label className="settings-toggle settings-toggle--master">
            <input
              type="checkbox"
              checked={!!preferences.enabled}
              onChange={e => togglePreference('enabled', e.target.checked)}
            />
            <span className="settings-toggle-body">
              <span className="settings-toggle-label">Send me email notifications</span>
              <span className="settings-toggle-hint">
                Turning this off silences everything below, whatever they are set to.
              </span>
            </span>
          </label>

          <div className={`settings-toggle-group${preferences.enabled ? '' : ' settings-toggle-group--muted'}`}>
            {CATEGORIES.map(({ key, label, hint }) => (
              <label className="settings-toggle" key={key}>
                <input
                  type="checkbox"
                  checked={!!preferences[key]}
                  disabled={!preferences.enabled}
                  onChange={e => togglePreference(key, e.target.checked)}
                />
                <span className="settings-toggle-body">
                  <span className="settings-toggle-label">{label}</span>
                  <span className="settings-toggle-hint">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        {status && <p className="settings-status" role="status">{status}</p>}
        {error && <p className="settings-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
