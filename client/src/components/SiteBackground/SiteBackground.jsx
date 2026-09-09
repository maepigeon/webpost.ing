import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { GET_SETTINGS } from '../Pages/Posts/BasicTextPostServerApi.js';
import { patternToStyle } from '../PatternPicker/patterns.js';
import { RESERVED_USERNAMES } from '../../utils/reservedUsernames.js';
import { applyCodeDisplay } from '../../utils/codeDisplay.js';
import './SiteBackground.css';

/**
 * True for routes that display somebody's own wallpaper.
 *
 * Profiles and posts live at the top level (`/mae`, `/mae/42-slug`), so "not one
 * of the application's own routes" is what identifies them — the same reserved
 * list the router and registration use.
 */
export function ownsItsOwnBackground(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return false;                 // home
  if (segments[0] === 'users') return true;                // legacy profile/post
  return !RESERVED_USERNAMES.has(segments[0].toLowerCase());
}

/**
 * The signed-in user's own background, shown across the site.
 *
 * Deliberately **not** applied on profiles or posts: those show the wallpaper
 * their author chose, and overriding it with a reader's preference would mean
 * nobody ever sees anyone else's. Everywhere else — home, search, inbox,
 * messages, settings, admin — is chrome rather than someone's page, so it is
 * the reader's to decorate.
 *
 * Rendered as its own fixed layer rather than by writing to document.body.
 * Profile and post pages set body styles directly, and on a route change the
 * child's effect runs before this parent's, so the two would race over the same
 * properties. A separate element cannot conflict.
 */
export default function SiteBackground() {
  const location = useLocation();
  const [background, setBackground] = useState(null);

  const username = localStorage.getItem('userName');

  useEffect(() => {
    if (!username) { setBackground(null); return; }
    let cancelled = false;
    GET_SETTINGS(username)
      .then(data => {
        if (cancelled) return;
        setBackground(data.siteBackground || null);
        // Code display is a reading preference too, and it has to be applied
        // wherever a post is read rather than only on the settings page.
        applyCodeDisplay(data);
      })
      // A background is decoration; failing to load one is not worth reporting.
      .catch(() => {});
    return () => { cancelled = true; };
  }, [username]);

  // Settings dispatches this after a save, so the change is immediate rather
  // than waiting for a reload.
  useEffect(() => {
    const onChange = (e) => setBackground(e.detail || null);
    window.addEventListener('site-background-changed', onChange);
    return () => window.removeEventListener('site-background-changed', onChange);
  }, []);

  const active = background && !ownsItsOwnBackground(location.pathname);
  const style = active ? patternToStyle(background) : {};

  // No global ink flip here.
  //
  // An earlier version measured the background's luminance and switched every
  // colour token to a light palette. That only works if the whole app reads
  // from those tokens, and only five of thirty-five stylesheets do — so a dark
  // background flipped a handful of components to light text while the rest
  // kept their hard-coded dark text, on a dark page. It made things
  // dramatically worse, not better.
  //
  // The right guarantee is narrower and does not depend on adoption: a
  // background sits *behind* content, and content carries its own readable
  // surface. See .site-background-scrim for the one case that does not.

  if (!active) return null;
  return (
    <div
      className="site-background"
      aria-hidden="true"
      style={{
        backgroundColor: style._bgColor || undefined,
        backgroundImage: style.backgroundImage,
        backgroundSize: style.backgroundSize,
        backgroundPosition: style.backgroundPosition,
      }}
    />
  );
}
