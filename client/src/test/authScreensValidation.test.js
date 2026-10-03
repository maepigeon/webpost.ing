import { describe, it, expect } from 'vitest';
import {
  validateUsername, validateEmail, validateNewPassword, validateConfirm,
  validateInviteCode, validateRegistration, mapRegisterError,
} from '../components/Pages/Auth/Registration/registrationValidation.js';
import {
  checkPassword, passwordMeetsRules, passwordRuleItems, utf8Length,
} from '../components/Pages/Auth/Registration/passwordRules.js';

const GOOD_PW = 'Correct-Horse-9battery';

describe('field validators', () => {
  it('username: 3-32 characters of letters, numbers, _ and -', () => {
    expect(validateUsername('')).toMatch(/Choose/);
    expect(validateUsername('ab')).toMatch(/3 to 32/);
    expect(validateUsername('a'.repeat(33))).toMatch(/3 to 32/);
    expect(validateUsername('bad name')).toMatch(/Letters, numbers/);
    expect(validateUsername('bad.name')).toMatch(/Letters, numbers/);
    expect(validateUsername('good_name-1')).toBe('');
    expect(validateUsername('  padded  ')).toBe('');
  });

  it('email: needs the usual shape', () => {
    expect(validateEmail('')).toMatch(/Enter your email/);
    expect(validateEmail('nope')).toMatch(/valid/);
    expect(validateEmail('a@b')).toMatch(/valid/);
    expect(validateEmail('a b@c.de')).toMatch(/valid/);
    expect(validateEmail('a@b.co')).toBe('');
  });

  it('password and confirm', () => {
    expect(validateNewPassword('')).toMatch(/Choose/);
    expect(validateNewPassword('short1A!')).toMatch(/rules/);
    expect(validateNewPassword(GOOD_PW)).toBe('');
    expect(validateConfirm(GOOD_PW, '')).toMatch(/again/);
    expect(validateConfirm(GOOD_PW, GOOD_PW + 'x')).toMatch(/do not match/);
    expect(validateConfirm(GOOD_PW, GOOD_PW)).toBe('');
  });

  it('invite code is only required when asked for', () => {
    expect(validateInviteCode('', true)).toMatch(/invite code/);
    expect(validateInviteCode('   ', true)).toMatch(/invite code/);
    expect(validateInviteCode('', false)).toBe('');
    expect(validateInviteCode('abc', true)).toBe('');
  });
});

describe('validateRegistration', () => {
  const ok = { inviteCode: 'x', username: 'mae', email: 'm@e.io', password: GOOD_PW, confirm: GOOD_PW };
  it('is empty when everything is fine', () => {
    expect(validateRegistration(ok, { inviteRequired: true })).toEqual({});
  });
  it('names every failing field', () => {
    const errs = validateRegistration(
      { inviteCode: '', username: 'a', email: 'x', password: 'abc', confirm: 'abd' },
      { inviteRequired: true });
    expect(Object.keys(errs).sort()).toEqual(['confirm', 'email', 'invite', 'password', 'username']);
  });
  it('ignores the invite code when it is not required', () => {
    expect(validateRegistration({ ...ok, inviteCode: '' }, { inviteRequired: false })).toEqual({});
  });
});

describe('mapRegisterError', () => {
  it.each([
    ['Username already taken.', 'username'],
    ['Username must be 3–32 characters.', 'username'],
    ['Username may only contain letters, numbers, underscores, and hyphens.', 'username'],
    ['That username is reserved. Please choose another.', 'username'],
    ['Invalid email address.', 'email'],
    ['Email required.', 'email'],
    ['Invite code required.', 'invite'],
    ['Invalid invite code.', 'invite'],
    ['Invite code has already been used.', 'invite'],
    ['Password must be at least 12 characters.', 'password'],
    ['Password required.', 'password'],
  ])('%s goes on %s', (text, field) => {
    expect(mapRegisterError(text)).toEqual({ field, message: text });
  });

  it('leaves everything else for the line above the button', () => {
    expect(mapRegisterError('Too many sign-ups. Try again later.').field).toBeNull();
    expect(mapRegisterError('Registration failed. Please try again.').field).toBeNull();
    expect(mapRegisterError('').field).toBeNull();
  });
});

describe('password rules', () => {
  it('counts bytes, not characters, for the 72-byte limit', () => {
    expect(utf8Length('abc')).toBe(3);
    expect(utf8Length('é')).toBe(2);
    const longAscii = 'aA1!'.repeat(18);           // 72 bytes
    expect(checkPassword(longAscii).maxBytes).toBe(true);
    expect(checkPassword(longAscii + 'a').maxBytes).toBe(false);
    // 40 two-byte letters: 40 characters, 80 bytes.
    const wide = 'é'.repeat(40) + 'A1!';
    expect(wide.length).toBeLessThan(72);
    expect(checkPassword(wide).maxBytes).toBe(false);
    expect(passwordMeetsRules(wide)).toBe(false);
  });

  it('enforces the 128 character cap', () => {
    expect(checkPassword('a'.repeat(129)).maxLength).toBe(false);
  });

  it('lists the five rules, and a limit line only once it is broken', () => {
    expect(passwordRuleItems('').map(i => i.label)).toEqual([
      'At least 12 characters', 'One uppercase letter', 'One lowercase letter',
      'One number', 'One special character',
    ]);
    expect(passwordRuleItems(GOOD_PW).every(i => i.ok)).toBe(true);
    const over = passwordRuleItems('aA1!'.repeat(19));
    expect(over.at(-1)).toEqual({
      ok: false, over: true, label: 'At most 72 bytes (long non-English text counts more)',
    });
    expect(passwordRuleItems('aA1!'.repeat(40)).map(i => i.label))
      .toContain('At most 128 characters');
  });
});
