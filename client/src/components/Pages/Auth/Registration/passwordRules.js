// The password rules, shared by the sign-up form, the reset form and the
// settings page. The server enforces the same limits (bcrypt only reads the
// first 72 bytes, so longer passwords would silently lose their tail).
export const MIN_PASSWORD_CHARS = 12;
export const MAX_PASSWORD_CHARS = 128;
export const MAX_PASSWORD_BYTES = 72;

export function utf8Length(text) {
  return new TextEncoder().encode(text).length;
}

export function checkPassword(pw) {
  return {
    length:    pw.length >= MIN_PASSWORD_CHARS,
    upper:     /[A-Z]/.test(pw),
    lower:     /[a-z]/.test(pw),
    digit:     /[0-9]/.test(pw),
    special:   /[^A-Za-z0-9]/.test(pw),
    maxLength: pw.length <= MAX_PASSWORD_CHARS,
    maxBytes:  utf8Length(pw) <= MAX_PASSWORD_BYTES,
  };
}

export function passwordMeetsRules(pw) {
  return Object.values(checkPassword(pw)).every(Boolean);
}

/**
 * The list shown under a new password: the five rules always, plus a limit
 * line only once that limit is broken (keeps the list short).
 * Each item: { label, ok, over } where `over` marks a limit line.
 */
export function passwordRuleItems(pw) {
  const c = checkPassword(pw);
  const items = [
    { ok: c.length,  label: 'At least 12 characters' },
    { ok: c.upper,   label: 'One uppercase letter' },
    { ok: c.lower,   label: 'One lowercase letter' },
    { ok: c.digit,   label: 'One number' },
    { ok: c.special, label: 'One special character' },
  ];
  if (!c.maxLength) items.push({ ok: false, over: true, label: 'At most 128 characters' });
  if (!c.maxBytes)  items.push({ ok: false, over: true, label: 'At most 72 bytes (long non-English text counts more)' });
  return items;
}
