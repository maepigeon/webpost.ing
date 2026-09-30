import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  GET_SETTINGS, UPDATE_EMAIL_PREFERENCES, UPDATE_EMAIL_ADDRESS, RESEND_VERIFICATION,
  UPDATE_SITE_BACKGROUND, UPDATE_CODE_DISPLAY,
  GET_USER_BACKGROUND, UPDATE_USER_BACKGROUND,
  GET_PROFILE_HEADER, UPLOAD_PROFILE_HEADER, UPDATE_PROFILE_HEADER,
} from '../Posts/BasicTextPostServerApi.js';
import WallpaperEditor, { WallpaperSwatch } from '../../TileArt/WallpaperEditor.jsx';
import { serialiseWallpaper } from '../../TileArt/wallpaper.js';
import { IMAGES_BASE_URL } from '../../../config.js';
import { describeUploadError } from '../../../utils/responsiveImage.js';
import {
  CODE_FONTS, MIN_CODE_SIZE, MAX_CODE_SIZE, DEFAULT_CODE_SIZE, applyCodeDisplay,
} from '../../../utils/codeDisplay.js';
import { usePageTitle } from '../../../utils/usePageTitle.js';
import ThemeEditor from '../../PageTheme/ThemeEditor.jsx';
import PixelFontsSection from './PixelFontsSection.jsx';
import './SettingsPage.css';
import { errorMessage } from '../../../utils/errorMessage.js';

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

  // Appearance lives here rather than on the profile page: these are settings,
  // and the profile is where the result is seen, not where it is configured.
  const [profileWallpaper, setProfileWallpaper] = useState('');
  const [header, setHeader] = useState({ headerPath: null, headerInk: 'auto' });
  const [headerBusy, setHeaderBusy] = useState(false);
  const headerFileRef = useRef(null);

  useEffect(() => {
    if (!username) { navigate('/routes/Login'); return; }
    GET_SETTINGS(username)
      .then(data => { setSettings(data); setEmailInput(data.email || data.pendingEmail || ''); })
      .catch(() => setError('Could not load your settings. Try reloading the page.'))
      .finally(() => setLoading(false));
    GET_USER_BACKGROUND(username).then(p => setProfileWallpaper(p || '')).catch(() => {});
    GET_PROFILE_HEADER(username)
      .then(d => setHeader({ headerPath: d.headerPath || null, headerInk: d.headerInk || 'auto' }))
      .catch(() => {});
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

  // Edited freely, saved on request: a wallpaper carries its pixels, so
  // saving on every stroke would upload the whole tile each time.
  const [wallpaperDraft, setWallpaperDraft] = useState('');
  useEffect(() => { setWallpaperDraft(profileWallpaper); }, [profileWallpaper]);

  const saveWallpaper = async (pattern) => {
    const previous = profileWallpaper;
    setProfileWallpaper(pattern);
    try {
      await UPDATE_USER_BACKGROUND(username, pattern);
      setStatus('Wallpaper saved.');
    } catch (err) {
      setProfileWallpaper(previous);
      setError(errorMessage(err, 'Could not save that wallpaper.'));
    }
  };

  const uploadHeader = async (file) => {
    if (!file) return;
    setHeaderBusy(true);
    setError('');
    try {
      const result = await UPLOAD_PROFILE_HEADER(username, file);
      setHeader(h => ({ ...h, headerPath: result.headerPath }));
      setStatus(result.message);
    } catch (err) {
      setError(describeUploadError(err));
    } finally {
      setHeaderBusy(false);
    }
  };

  const removeHeader = async () => {
    try {
      await UPDATE_PROFILE_HEADER(username, { remove: true });
      setHeader(h => ({ ...h, headerPath: null }));
      setStatus('Header image removed.');
    } catch { setError('Could not remove the header image.'); }
  };

  const changeHeaderInk = async (choice) => {
    const previous = header.headerInk;
    setHeader(h => ({ ...h, headerInk: choice }));
    try { await UPDATE_PROFILE_HEADER(username, { headerInk: choice }); }
    catch { setHeader(h => ({ ...h, headerInk: previous })); }
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
            Optional. Used for notifications and to reset your password if you
            forget it, and never shown to anyone else. An address is only added
            to your account once you confirm it from that inbox, so nobody can
            sign someone else up. At most 3 emails a day; anything beyond that
            arrives as one digest.
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
              Waiting for you to confirm <strong>{settings.pendingEmail}</strong>.
              It is added to your account once you click the link in that email —
              until then nothing else is sent to it.
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
        </section>

        {/* ── Profile appearance ──────────────────────────────────────────── */}
        <section className="settings-section">
          <h2 className="settings-section-title">Your profile</h2>
          <p className="settings-section-hint">
            How your profile looks to everyone who visits it. Your bio, links and
            avatar are still edited on <Link className="settings-link" to={`/${username}`}>your profile</Link>,
            where you can see them in place.
          </p>

          <h3 className="settings-subheading">Header image</h3>
          <p className="settings-section-hint">
            Sits behind your avatar, name and links, replacing the plain panel.
          </p>

          {header.headerPath && (
            <div
              className="settings-header-preview"
              style={{ backgroundImage: `url(${IMAGES_BASE_URL}${header.headerPath})` }}
            >
              <span className={`settings-header-preview-scrim settings-header-preview-scrim--${header.headerInk}`} />
              <span className={`settings-header-preview-text settings-header-preview-text--${header.headerInk}`}>
                {username}
              </span>
            </div>
          )}

          <div className="settings-header-controls">
            <input
              type="file"
              ref={headerFileRef}
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files[0]; e.target.value = ''; uploadHeader(f); }}
            />
            <button type="button" className="settings-btn settings-btn--primary"
                    disabled={headerBusy} onClick={() => headerFileRef.current?.click()}>
              {headerBusy ? 'Uploading…' : header.headerPath ? 'Change image' : 'Choose an image'}
            </button>
            {header.headerPath && (
              <>
                <button type="button" className="settings-btn settings-btn--ghost" onClick={removeHeader}>
                  Remove
                </button>
                <span className="settings-ink-group" role="group" aria-label="Text colour over the header">
                  <span className="settings-ink-label">Text</span>
                  {[['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => (
                    <button key={v} type="button"
                            className={`settings-ink-btn${header.headerInk === v ? ' settings-ink-btn--active' : ''}`}
                            onClick={() => changeHeaderInk(v)}>{l}</button>
                  ))}
                </span>
              </>
            )}
          </div>

          <h3 className="settings-subheading">Wallpaper</h3>
          <p className="settings-section-hint">
            The background of your profile page, shown to everyone who visits.
          </p>
          <div className="settings-wallpaper-panel">
            <WallpaperEditor value={wallpaperDraft} onChange={w => setWallpaperDraft(serialiseWallpaper(w))} />
            <button type="button" className="settings-btn settings-btn--primary"
              disabled={wallpaperDraft === profileWallpaper} onClick={() => saveWallpaper(wallpaperDraft)}>
              Save wallpaper
            </button>
          </div>
        </section>

        {/* ── Page theme ─────────────────────────────────────────────────── */}
        <section className="settings-section">
          <h2 className="settings-section-title">Page theme</h2>
          <p className="settings-section-hint">
            How your profile and posts look to everyone who visits. Start from a
            theme, change anything about it, and save it as your own. Newspaper
            Life is the site default, and you can always go back to it.
          </p>
          <ThemeEditor username={username} />
        </section>

        <PixelFontsSection username={username} />

        {/* ── Site background ─────────────────────────────────────────────── */}
        <section className="settings-section">
          <h2 className="settings-section-title">Site background</h2>
          <p className="settings-section-hint">
            Shown to you across the site — home, search, your inbox, messages and
            settings. Profiles and posts are left alone: those show the wallpaper
            their author chose, and nobody else sees this.
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
              Make a profile wallpaper above and it will appear here to use as
              your site background too.
            </p>
          )}
        </section>

        {/* ── Code blocks ─────────────────────────────────────────────────── */}
        <section className="settings-section">
          <h2 className="settings-section-title">Code blocks</h2>
          <p className="settings-section-hint">
            How code looks to you in every post you read. This is your setting, not
            the author's — it does not change how anyone else sees their posts.
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

            <label className="settings-code-field">
              <span className="settings-code-label">
                Size <span className="settings-code-size">{settings.codeFontSize || DEFAULT_CODE_SIZE}px</span>
              </span>
              <input
                type="range"
                className="settings-range"
                min={MIN_CODE_SIZE}
                max={MAX_CODE_SIZE}
                step={1}
                value={settings.codeFontSize || DEFAULT_CODE_SIZE}
                onChange={e => changeCodeDisplay({ codeFontSize: Number(e.target.value) })}
              />
            </label>
          </div>

          {/* A live sample, because a font name and a pixel count do not tell
              anyone what the result will look like. */}
          <pre className="settings-code-sample" aria-label="Preview"><code>{
`function greet(name) {
  // Your code will look like this
  return \`Hello, \${name}\`;
}`
          }</code></pre>
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
