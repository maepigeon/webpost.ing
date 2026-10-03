import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  GET_SETTINGS, UPDATE_EMAIL_PREFERENCES, UPDATE_EMAIL_ADDRESS, RESEND_VERIFICATION,
  UPDATE_SITE_BACKGROUND, UPDATE_CODE_DISPLAY,
} from '../Posts/BasicTextPostServerApi.js';
import { WallpaperSwatch } from '../../TileArt/WallpaperEditor.jsx';
import {
  CODE_FONTS, MIN_CODE_SIZE, MAX_CODE_SIZE, DEFAULT_CODE_SIZE, applyCodeDisplay,
} from '../../../utils/codeDisplay.js';
import { usePageTitle } from '../../../utils/usePageTitle.js';
import { Steps } from '../../PageTheme/ThemeEditor.jsx';

/** Code text sizes offered as buttons (it used to be a slider). */
const CODE_SIZE_STEPS = [11, 12, 13, 14, 16, 18, 20].filter(n => n >= MIN_CODE_SIZE && n <= MAX_CODE_SIZE);
import './SettingsPage.css';
import { errorMessage } from '../../../utils/errorMessage.js';

/**
 * Account settings: the email address and what it is used for, the site
 * background you see, and how code blocks look to you. How your profile looks
 * to others is on CustomizePage.
 *
 * Email is optional both for the user and for the deployment. When the server
 * reports mailEnabled: false the page says so rather than offering a
 * verification that could never arrive, and the notification toggles are
 * disabled so nobody sets a preference that will not be honoured.
 */

const CATEGORIES = [
  { key: 'onDirectMessage', label: 'Messages',
    hint: 'Someone sends you a message.' },
  { key: 'onNewFollower', label: 'New followers',
    hint: 'Someone follows you.' },
  { key: 'onFollowedPost', label: 'New posts',
    hint: 'Someone you follow posts something.' },
  { key: 'onPostPublished', label: 'Your posts',
    hint: 'A note to you each time you publish.' },
];


/**
 * One background option, previewed at the size it will be seen rather than
 * described in words — a wallpaper is not something a label can convey.
 */
function BackgroundChoice({ label, value, current, onChoose }) {
  const selected = (current || null) === (value || null);

  return (
    <button
      type="button"
      className={`settings-bg-choice${selected ? ' settings-bg-choice--selected' : ''}`}
      onClick={() => onChoose(value)}
      aria-pressed={selected}
    >
      <WallpaperSwatch value={value} className="settings-bg-swatch" />
      <span className="settings-bg-name">{label}</span>
    </button>
  );
}

const OPEN_KEY = 'settingsOpen';

/**
 * One section of Settings, folded under its title. Whether each is open is
 * remembered in this browser; all start folded.
 */
/** An "i" button that shows notes about a section, folded away until asked for. */
function Info({ children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="settings-info">
      <button type="button" className={`settings-info-btn${open ? ' is-on' : ''}`} aria-expanded={open}
        aria-label={open ? 'Hide notes' : 'About this'} title={open ? 'Hide notes' : 'About this'}
        onClick={() => setOpen(o => !o)}>i</button>
      {open && <div className="settings-info-body">{children}</div>}
    </div>
  );
}

function Section({ id, title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(() => {
    try { const kept = JSON.parse(localStorage.getItem(OPEN_KEY)) || {}; return id in kept ? kept[id] : defaultOpen; }
    catch { return defaultOpen; }
  });
  const toggle = (e) => {
    const next = e.currentTarget.open;
    setOpen(next);
    try {
      const kept = JSON.parse(localStorage.getItem(OPEN_KEY)) || {};
      localStorage.setItem(OPEN_KEY, JSON.stringify({ ...kept, [id]: next }));
    } catch { /* not kept */ }
  };
  return (
    <details className="settings-section" open={open} onToggle={toggle}>
      <summary className="settings-section-title">{title}</summary>
      <div className="settings-section-body">{children}</div>
    </details>
  );
}

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
      .then(data => { setSettings(data); setEmailInput(data.email || data.pendingEmail || ''); })
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
      setSettings(s => ({
        ...s,
        email: result.email || null,
        pendingEmail: result.pendingEmail || null,
        emailVerified: !!result.emailVerified,
      }));
      setStatus(result.message);
    } catch (err) {
      setError(errorMessage(err, 'Could not save that address.'));
    } finally {
      setSaving(false);
    }
  };

  /**
   * Saves the site-wide background and tells the layer to repaint immediately,
   * rather than waiting for a reload.
   */
  const chooseBackground = async (value) => {
    setStatus('');
    setError('');
    const previous = settings.siteBackground;
    setSettings(s => ({ ...s, siteBackground: value }));
    window.dispatchEvent(new CustomEvent('site-background-changed', { detail: value }));
    try {
      const result = await UPDATE_SITE_BACKGROUND(username, value);
      setStatus(result.message);
    } catch (err) {
      setSettings(s => ({ ...s, siteBackground: previous }));
      window.dispatchEvent(new CustomEvent('site-background-changed', { detail: previous }));
      setError(errorMessage(err, 'Could not save that background.'));
    }
  };

  /**
   * Saves how this reader sees code blocks and applies it at once, so the
   * sample below the controls reflects the change as it is made.
   */
  const changeCodeDisplay = async (patch) => {
    const previous = { codeFont: settings.codeFont, codeFontSize: settings.codeFontSize };
    const next = { ...previous, ...patch };
    setSettings(s => ({ ...s, ...next }));
    applyCodeDisplay(next);
    try {
      await UPDATE_CODE_DISPLAY(username, patch);
    } catch {
      setSettings(s => ({ ...s, ...previous }));
      applyCodeDisplay(previous);
      setError('Could not save that.');
    }
  };

  const resend = async () => {
    setStatus('');
    setError('');
    try {
      const result = await RESEND_VERIFICATION(username);
      setStatus(result.message);
    } catch (err) {
      setError(errorMessage(err, 'Could not send that email.'));
    }
  };

  if (loading) return <div className="settings-page"><p className="settings-loading">Loading…</p></div>;
  if (!settings) return <div className="settings-page"><p className="settings-error">{error}</p></div>;

  const { email, emailVerified, mailEnabled, preferences } = settings;

  // The preset library is stored as a JSON object of name -> wallpaper string.
  let savedPresets = [];
  try {
    savedPresets = Object.entries(JSON.parse(settings.presets || '{}'));
  } catch {
    savedPresets = [];   // a malformed library should not break the page
  }
  // Changed relative to whichever address is in play — the confirmed one, or
  // one already waiting to be confirmed.
  const addressChanged = emailInput.trim() !== (email || settings.pendingEmail || '');

  return (
    <div className="settings-page">
      <div className="settings-card">
        <h1 className="settings-title">Settings</h1>


        {/* ── Email: the address, and what to send to it ──────────────────── */}
        <Section id="email" title="Email">
          <Info>
            {!mailEnabled && <p>Email isn&rsquo;t set up on this site yet, so nothing is sent. Your choices here are kept for when it is.</p>}
            <p>
              Your address is optional. It&rsquo;s used for the emails you choose below and to help you
              reset your password, and nobody else sees it. It&rsquo;s added once you click the link
              we send to it. At most 3 emails a day; any more come together in one.
            </p>
          </Info>

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
                    disabled={saving || !addressChanged} title={addressChanged ? undefined : 'No changes yet'}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </form>

          {/* Confirmed and pending are different states with different text.
              A tick can only ever appear beside an address whose owner has
              clicked the link — an unconfirmed address is not on the account
              at all until then. */}
          {emailVerified && email && (
            <p className="settings-verify-state settings-verify-state--ok">
              ✓ <strong>{email}</strong> is confirmed.
            </p>
          )}

          {settings.pendingEmail && (
            <p className="settings-verify-state settings-verify-state--pending">
              Check your inbox: we sent a link to <strong>{settings.pendingEmail}</strong>.
              Click it to add the address.
              {mailEnabled && (
                <button type="button" className="settings-link-btn" onClick={resend}>
                  Resend
                </button>
              )}
            </p>
          )}

          {!emailVerified && !settings.pendingEmail && (
            <p className="settings-section-hint">No email address on your account.</p>
          )}

          <h3 className="settings-subtitle">What to email you</h3>
          {mailEnabled && !emailVerified && (
            <p className="settings-section-hint">Confirm your address to get these.</p>
          )}

          <label className="settings-toggle settings-toggle--master">
            <input
              type="checkbox"
              checked={!!preferences.enabled}
              onChange={e => togglePreference('enabled', e.target.checked)}
            />
            <span className="settings-toggle-body">
              <span className="settings-toggle-label">Email me</span>
              <span className="settings-toggle-hint">Turn off to stop all emails at once.</span>
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
        </Section>

        {/* ── Site background ─────────────────────────────────────────────── */}
        <Section id="background" title="Site background">
          <p className="settings-section-hint">
            The background you see around the site: home, search, messages and settings.
            Only you see it. Profiles and posts keep their own.
          </p>

          <div className="settings-bg-grid">
            <BackgroundChoice
              label="None"
              value={null}
              current={settings.siteBackground}
              onChoose={chooseBackground}
            />
            {settings.profileBackground && (
              <BackgroundChoice
                label="My profile wallpaper"
                value={settings.profileBackground}
                current={settings.siteBackground}
                onChoose={chooseBackground}
              />
            )}
            {savedPresets.map(([name, stored]) => (
              <BackgroundChoice
                key={name}
                label={name}
                value={stored}
                current={settings.siteBackground}
                onChoose={chooseBackground}
              />
            ))}
          </div>

          {savedPresets.length === 0 && !settings.profileBackground && (
            <p className="settings-section-hint">
              Make a wallpaper on <Link className="settings-link" to="/customize">Customize your profile</Link> and
              it shows up here too.
            </p>
          )}
        </Section>

        {/* ── Code blocks ─────────────────────────────────────────────────── */}
        <Section id="code" title="Code blocks">
          <p className="settings-section-hint">
            How code looks in posts you read. Only you see this.
          </p>

          <div className="settings-code-controls">
            <label className="settings-code-field">
              <span className="settings-code-label">Font</span>
              <select
                className="settings-select"
                value={settings.codeFont || 'default'}
                onChange={e => changeCodeDisplay({ codeFont: e.target.value })}
              >
                {Object.entries(CODE_FONTS).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </label>

            <div className="settings-code-field">
              <span className="settings-code-label">Size</span>
              {/* Buttons, not a slider. */}
              <Steps label="Code size" value={settings.codeFontSize || DEFAULT_CODE_SIZE}
                options={CODE_SIZE_STEPS} format={v => `${v}px`}
                onChange={v => changeCodeDisplay({ codeFontSize: v })} />
            </div>
          </div>

          {/* A live sample, because a font name and a pixel count do not tell
              anyone what the result will look like. */}
          <pre className="settings-code-sample" aria-label="Preview"><code>{
`function greet(name) {
  // Your code will look like this
  return \`Hello, \${name}\`;
}`
          }</code></pre>
        </Section>

        {status && <p className="settings-status" role="status">{status}</p>}
        {error && <p className="settings-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
