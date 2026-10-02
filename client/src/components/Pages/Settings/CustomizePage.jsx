import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  GET_USER_BACKGROUND, UPDATE_USER_BACKGROUND,
  GET_PROFILE_HEADER, UPLOAD_PROFILE_HEADER, UPDATE_PROFILE_HEADER,
} from '../Posts/BasicTextPostServerApi.js';
import WallpaperEditor from '../../TileArt/WallpaperEditor.jsx';
import { serialiseWallpaper } from '../../TileArt/wallpaper.js';
import { IMAGES_BASE_URL } from '../../../config.js';
import { describeUploadError } from '../../../utils/responsiveImage.js';
import { usePageTitle } from '../../../utils/usePageTitle.js';
import { errorMessage } from '../../../utils/errorMessage.js';
import ThemeEditor from '../../PageTheme/ThemeEditor.jsx';
import PixelFontsSection from './PixelFontsSection.jsx';
import StickersSection from '../../TileArt/StickersSection.jsx';
import './SettingsPage.css';

/**
 * Customize your profile: its header image, wallpaper, page theme and pixel
 * fonts. Reached from the button on your own profile.
 *
 * These used to sit in Settings among email and notification preferences;
 * they are about how your page looks to visitors, not about your account, so
 * they have a page of their own next to the thing they change.
 */
export default function CustomizePage() {
  usePageTitle('Customize your profile');
  const navigate = useNavigate();
  const username = localStorage.getItem('userName');

  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const [profileWallpaper, setProfileWallpaper] = useState('');
  const [wallpaperDraft, setWallpaperDraft] = useState('');
  const [header, setHeader] = useState({ headerPath: null, headerInk: 'auto' });
  const [headerBusy, setHeaderBusy] = useState(false);
  const headerFileRef = useRef(null);


  useEffect(() => {
    if (!username) { navigate('/routes/Login'); return; }
    GET_USER_BACKGROUND(username).then(p => setProfileWallpaper(p || '')).catch(() => {});
    GET_PROFILE_HEADER(username)
      .then(d => setHeader({ headerPath: d.headerPath || null, headerInk: d.headerInk || 'auto' }))
      .catch(() => {});
  }, [username, navigate]);

  // Edited freely, saved on request: a wallpaper carries its pixels, so
  // saving on every stroke would upload the whole tile each time.
  useEffect(() => { setWallpaperDraft(profileWallpaper); }, [profileWallpaper]);

  const saveWallpaper = async (pattern) => {
    const previous = profileWallpaper;
    setProfileWallpaper(pattern);
    setError('');
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

  if (!username) return null;

  return (
    <div className="settings-page">
      <div className="settings-card">
        <div className="settings-title-row">
          <h1 className="settings-title">Customize your profile</h1>
          <Link className="settings-link" to={`/${username}`}>← Back to your profile</Link>
        </div>
        <p className="settings-section-hint">
          How your profile looks to everyone who visits it. Your bio, links and
          avatar are edited on the profile itself, where you can see them in place.
          Account settings (email, notifications, the site background you see) are
          in <Link className="settings-link" to="/settings">Settings</Link>.
        </p>

        {(status || error) && (
          <p className={error ? 'settings-error' : 'settings-status'} role="status">{error || status}</p>
        )}

        {/* ── Card background image ────────────────────────────────────────── */}
        <section className="settings-section">
          <h2 className="settings-section-title">Card background image</h2>
          <p className="settings-section-hint">
            A photo behind your bio, links and buttons, under the banner.
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
        </section>

        {/* ── Wallpaper ────────────────────────────────────────────────────── */}
        <section className="settings-section">
          <h2 className="settings-section-title">Wallpaper</h2>
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

        {/* ── Page theme ───────────────────────────────────────────────────── */}
        <section className="settings-section">
          <h2 className="settings-section-title">Page theme</h2>
          <p className="settings-section-hint">
            How your profile looks to everyone who visits. Start from a theme,
            change anything about it, and save it as your own. Each post keeps a
            theme of its own: a new post starts with this one, and you can change
            it from the post editor&rsquo;s Page menu. Changing this one doesn&rsquo;t
            restyle posts you&rsquo;ve already written.
          </p>
          <ThemeEditor username={username} />
        </section>

        <PixelFontsSection username={username} />
        <StickersSection username={username} />
      </div>
    </div>
  );
}
