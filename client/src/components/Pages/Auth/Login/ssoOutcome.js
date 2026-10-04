// Single sign-on, the parts with no screen: which providers the server says
// are on, and what the short word in ?sso= means when the browser comes back
// from one. The server only ever puts a fixed word there, never anything
// personal.

/** The providers from /api/signup/config, as [{ id, name }]; anything malformed is dropped. */
export function ssoProvidersOf(config) {
  const list = config && Array.isArray(config.ssoProviders) ? config.ssoProviders : [];
  return list
    .filter(p => p && typeof p.id === 'string' && /^[a-z]{2,16}$/.test(p.id) && typeof p.name === 'string' && p.name.trim())
    .map(p => ({ id: p.id, name: p.name.trim().slice(0, 24) }));
}

const ON_SIGN_IN = {
  failed: 'That sign-in did not finish. Try again.',
  cancelled: 'Sign-in was cancelled.',
  exists: 'An account with this email exists. Sign in with your password, then link this provider in Settings.',
  refused: 'That account cannot sign in.',
  busy: 'Too many sign-ins from this network. Try again in a few minutes.',
};

/** The line to show on the sign-in page; empty for "ok" (handled by signing in) and for anything unknown. */
export function ssoLoginMessage(code) {
  return (typeof code === 'string' && Object.hasOwn(ON_SIGN_IN, code)) ? ON_SIGN_IN[code] : '';
}

const IN_SETTINGS = {
  linked: { text: 'Linked. You can now sign in with it.', error: false },
  reauth: { text: 'Signed in again. You have 5 minutes to make your change.', error: false },
  taken: { text: 'That account is already linked to another member here.', error: true },
  have_one: { text: 'You already have an account of that kind linked. Unlink it first.', error: true },
  other: { text: 'That was a different account, so nothing changed.', error: true },
  failed: { text: 'That did not finish. Try again.', error: true },
  cancelled: { text: 'Cancelled. Nothing changed.', error: false },
};

/** { text, error } for Settings > Sign-in methods, or null when there is nothing to say. */
export function ssoSettingsMessage(code) {
  return (typeof code === 'string' && Object.hasOwn(IN_SETTINGS, code)) ? IN_SETTINGS[code] : null;
}
