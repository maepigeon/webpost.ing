/** Plain-words labels for the security log. */
const LABELS = {
  sign_in: 'Signed in',
  sign_in_failed: 'Wrong password tried',
  sign_out: 'Signed out',
  password_changed: 'Password changed',
  password_reset: 'Password reset by email',
  email_changed: 'Email address changed',
  sessions_ended: 'Signed out everywhere else',
  account_deleted: 'Account deleted',
};

export function eventLabel(kind) {
  return LABELS[kind] || 'Account activity';
}

/** "203.0.113.0" or "2001:db8:1::/48" shown as a rough place; empty when unknown. */
export function roughPlace(ipPrefix) {
  return ipPrefix ? `network ${ipPrefix}` : '';
}

export function devicesText(count) {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 1;
  return `You are signed in on ${n} ${n === 1 ? 'device' : 'devices'}.`;
}

/** The delete button is enabled only once the username is typed exactly. */
export function canDelete(typedName, username, password) {
  return !!username && typedName.trim() === username && password.length > 0;
}

export function whenText(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const mins = Math.floor((now - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)} h ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
