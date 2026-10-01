/**
 * Top-level paths the application owns, which therefore cannot be usernames.
 *
 * Profiles live at `/{username}`, so a user called "settings" would collide
 * with the settings page. The server refuses to create these names
 * (ReservedUsernames.java); this copy exists so the client can give the same
 * answer without a round trip, and so the router can refuse to treat one as a
 * profile if a legacy account somehow holds one.
 *
 * **Keep the two lists in sync.** Anything added as a top-level route belongs
 * in both.
 */
export const RESERVED_USERNAMES = new Set([
  'users', 'user', 'routes', 'editor', 'inbox', 'messages', 'search',
  'activity', 'settings', 'customize', 'login', 'logout', 'register', 'signup', 'signin',
  'verify-email', 'unsubscribe', 'reset-password', 'forgot-password',
  'admin', 'adminpanel', 'posts', 'post',
  'api', 'uploads', 'static', 'assets', 'public', 'fonts',
  'favicon.ico', 'robots.txt', 'sitemap.xml', 'manifest.json',
  'index', 'index.html', '.well-known',
  'about', 'help', 'support', 'terms', 'privacy', 'contact', 'legal',
  'moderator', 'moderators', 'staff', 'official', 'webpost', 'webposting',
  'system', 'root', 'null', 'undefined', 'me', 'new', 'edit', 'delete', 'create',
]);

export function isReservedUsername(name) {
  return typeof name === 'string' && RESERVED_USERNAMES.has(name.trim().toLowerCase());
}

/** The canonical path to a profile. */
export function profilePath(username) {
  return `/${username}`;
}
