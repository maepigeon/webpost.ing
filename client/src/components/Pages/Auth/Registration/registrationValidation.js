import { passwordMeetsRules } from './passwordRules.js';

// Field keys used by the sign-up form: invite, username, email, password, confirm.

export function validateUsername(value) {
  const name = (value || '').trim();
  if (!name) return 'Choose a username.';
  if (name.length < 3 || name.length > 32) return 'Use 3 to 32 characters.';
  if (!/^[A-Za-z0-9_-]+$/.test(name)) return 'Letters, numbers, _ and - only.';
  return '';
}

export function validateEmail(value) {
  const mail = (value || '').trim();
  if (!mail) return 'Enter your email address.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return 'Enter a valid email address.';
  return '';
}

export function validateNewPassword(value) {
  if (!value) return 'Choose a password.';
  if (!passwordMeetsRules(value)) return 'Password does not meet the rules below.';
  return '';
}

export function validateConfirm(password, confirm) {
  if (!confirm) return 'Type the password again.';
  if (password !== confirm) return 'Passwords do not match.';
  return '';
}

export function validateInviteCode(value, required) {
  if (required && !(value || '').trim()) return 'Enter your invite code.';
  return '';
}

/** Returns { field: message } for every field that fails; empty when all pass. */
export function validateRegistration(v, { inviteRequired }) {
  const errors = {};
  const set = (key, msg) => { if (msg) errors[key] = msg; };
  set('invite', validateInviteCode(v.inviteCode, inviteRequired));
  set('username', validateUsername(v.username));
  set('email', validateEmail(v.email));
  set('password', validateNewPassword(v.password));
  set('confirm', validateConfirm(v.password, v.confirm));
  return errors;
}

/** Order the fields appear on screen, for moving focus to the first problem. */
export const FIELD_ORDER = ['invite', 'username', 'email', 'password', 'confirm'];

/**
 * Pins a plain-text /api/register error on the field it names, where obvious.
 * Returns { field, message }; field is null for everything else (rate limits,
 * human check, server trouble), which is shown in one line above the button.
 */
export function mapRegisterError(text) {
  const message = (text || '').trim();
  if (/invite code/i.test(message)) return { field: 'invite', message };
  if (/username/i.test(message))    return { field: 'username', message };
  if (/\bemail\b/i.test(message))   return { field: 'email', message };
  if (/\bpassword\b/i.test(message)) return { field: 'password', message };
  return { field: null, message };
}
