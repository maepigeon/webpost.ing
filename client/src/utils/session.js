import axios from 'axios';

/**
 * Client-side session state, and detection of a session that has died on the
 * server.
 *
 * Sessions live in memory on the server, so every restart invalidates all of
 * them. Without this the browser keeps showing a signed-in UI against a dead
 * token: every request quietly fails and nothing explains why.
 */

/** Paths that must stay reachable while signed out. */
const PUBLIC_PATHS = [
  '/routes/Login',
  '/routes/NewAccount',
  '/verify-email',
  '/unsubscribe',
  '/reset-password',
  '/forgot-password',
];

/** True while the browser believes it is signed in. */
export function isSignedIn() {
  return !!localStorage.getItem('userName');
}

/** Clears local sign-in state. Does not touch the server. */
export function clearLocalSession() {
  localStorage.removeItem('userName');
  localStorage.removeItem('isAdmin');
}

/**
 * Handles a session the server has rejected: clears local state and sends the
 * user to the login page with a note explaining what happened.
 *
 * Guarded so a burst of parallel 401s produces one redirect rather than a
 * fight between several.
 */
let handling = false;
export function handleExpiredSession() {
  if (handling) return;
  if (!isSignedIn()) return;          // already signed out; nothing to announce
  handling = true;

  clearLocalSession();

  const onPublicPage = PUBLIC_PATHS.some(p => window.location.pathname.startsWith(p));
  if (onPublicPage) { handling = false; return; }

  // A full navigation rather than a router push: the whole component tree holds
  // state derived from being signed in, and unwinding that reliably is harder
  // than starting fresh.
  window.location.href = '/routes/Login?expired=1';
}

/**
 * Installs a global handler for rejected sessions.
 *
 * Only 401 counts. A 403 means "signed in, but not allowed to do this", which
 * must not sign anyone out — and treating every failure as an expiry would
 * bounce people to the login page over an unrelated permissions error.
 */
export function installSessionInterceptor() {
  axios.interceptors.response.use(
    response => response,
    error => {
      if (error?.response?.status === 401) handleExpiredSession();
      return Promise.reject(error);
    },
  );
}
