// Pure logic for the admin Settings tab (sign-up rules). No React in here, so
// every branch can be unit tested.

// What the server assumes when a setting has never been saved.
export const SETTING_DEFAULTS = {
  max_daily_registrations: '5',
  invite_required: 'true',
  require_verified_email: 'false',
};

export const DAILY_LIMIT_MIN = -1;
export const DAILY_LIMIT_MAX = 10000;
export const DAILY_LIMIT_MESSAGE = 'Use a whole number from -1 to 10000.';

/** The server's settings with any missing key filled from its default. */
export function withDefaults(raw) {
  const out = { ...SETTING_DEFAULTS };
  for (const key of Object.keys(SETTING_DEFAULTS)) {
    const v = raw ? raw[key] : undefined;
    if (v !== undefined && v !== null && v !== '') out[key] = String(v);
  }
  return out;
}

/** A switch setting as a boolean. */
export function isOn(settings, key) {
  return withDefaults(settings)[key] === 'true';
}

/**
 * Checks the text typed into the daily-limit box.
 * Returns {valid, value, message}; value is a number only when valid.
 */
export function parseDailyLimit(text) {
  const t = typeof text === 'string' ? text.trim() : text == null ? '' : String(text).trim();
  if (!/^-?\d+$/.test(t)) return { valid: false, value: null, message: DAILY_LIMIT_MESSAGE };
  const n = Number(t);
  if (!Number.isSafeInteger(n) || n < DAILY_LIMIT_MIN || n > DAILY_LIMIT_MAX) {
    return { valid: false, value: null, message: DAILY_LIMIT_MESSAGE };
  }
  // -0 would print as "0" anyway, but keep the value a plain 0.
  return { valid: true, value: n === 0 ? 0 : n, message: '' };
}

/** True when the Save button for the daily limit should be enabled. */
export function canSaveDailyLimit(text, savedValue) {
  const p = parseDailyLimit(text);
  return p.valid && p.value !== Number(savedValue);
}

/**
 * Plain-sentence warnings for the two switches. Each is a string or null.
 *
 * signupConfig is the public {inviteRequired, turnstileSiteKey, mailEnabled};
 * when it could not be loaded (null) we cannot judge, so no warning is shown.
 */
export function settingWarnings({ settings, signupConfig } = {}) {
  const none = { invite: null, verifiedEmail: null };
  if (!signupConfig) return none;
  const s = withDefaults(settings);
  const mailEnabled = signupConfig.mailEnabled === true;
  const botCheck = signupConfig.turnstileSiteKey != null && signupConfig.turnstileSiteKey !== '';
  const emailCheck = s.require_verified_email === 'true' && mailEnabled;

  return {
    invite: s.invite_required === 'false' && !botCheck && !emailCheck
      ? 'Anyone can create an account with no bot check and no email check. Turn on one of the checks first.'
      : null,
    // The server ignores the rule while mail is off.
    verifiedEmail: s.require_verified_email === 'true' && !mailEnabled
      ? 'Email sending is not switched on yet, so this does nothing for now.'
      : null,
  };
}
