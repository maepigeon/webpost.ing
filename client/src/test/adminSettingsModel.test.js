import { describe, it, expect } from 'vitest';
import {
  withDefaults, isOn, parseDailyLimit, canSaveDailyLimit, settingWarnings, DAILY_LIMIT_MESSAGE,
} from '../components/Pages/Auth/AdminPanel/settingsModel.js';

describe('withDefaults / isOn', () => {
  it('fills every missing key with the server default', () => {
    expect(withDefaults({})).toEqual({
      max_daily_registrations: '5', invite_required: 'true', require_verified_email: 'false',
    });
    expect(withDefaults(null).invite_required).toBe('true');
  });
  it('keeps saved values as strings', () => {
    const s = withDefaults({ max_daily_registrations: 12, invite_required: 'false' });
    expect(s.max_daily_registrations).toBe('12');
    expect(s.invite_required).toBe('false');
  });
  it('reads switches as booleans, using defaults', () => {
    expect(isOn({}, 'invite_required')).toBe(true);
    expect(isOn({}, 'require_verified_email')).toBe(false);
    expect(isOn({ require_verified_email: 'true' }, 'require_verified_email')).toBe(true);
  });
});

describe('parseDailyLimit', () => {
  it('accepts whole numbers from -1 to 10000', () => {
    for (const [text, value] of [['-1', -1], ['0', 0], ['5', 5], [' 42 ', 42], ['10000', 10000], ['007', 7]]) {
      expect(parseDailyLimit(text)).toEqual({ valid: true, value, message: '' });
    }
  });
  it('rejects anything else with the same short message', () => {
    for (const text of ['', '  ', '-2', '10001', '1.5', '1e3', 'abc', '--1', '+5', '5 6', '99999999999999999999']) {
      const r = parseDailyLimit(text);
      expect(r.valid, text).toBe(false);
      expect(r.value).toBeNull();
      expect(r.message).toBe(DAILY_LIMIT_MESSAGE);
    }
    expect(parseDailyLimit(undefined).valid).toBe(false);
    expect(parseDailyLimit(null).valid).toBe(false);
  });
  it('accepts a number as well as text', () => {
    expect(parseDailyLimit(8).valid).toBe(true);
  });
});

describe('canSaveDailyLimit', () => {
  it('needs a valid value that differs from the saved one', () => {
    expect(canSaveDailyLimit('5', '5')).toBe(false);
    expect(canSaveDailyLimit('05', '5')).toBe(false);
    expect(canSaveDailyLimit('6', '5')).toBe(true);
    expect(canSaveDailyLimit('-1', '5')).toBe(true);
    expect(canSaveDailyLimit('x', '5')).toBe(false);
    expect(canSaveDailyLimit('20000', '5')).toBe(false);
  });
});

describe('settingWarnings', () => {
  const none = { invite: null, verifiedEmail: null };
  const cfg = (o = {}) => ({ inviteRequired: true, turnstileSiteKey: null, mailEnabled: false, ...o });

  it('says nothing when the signup config could not be loaded', () => {
    expect(settingWarnings({ settings: { invite_required: 'false' }, signupConfig: null })).toEqual(none);
    expect(settingWarnings({})).toEqual(none);
  });

  it('no invite warning while invite codes are needed', () => {
    expect(settingWarnings({ settings: { invite_required: 'true' }, signupConfig: cfg() }).invite).toBeNull();
  });

  it('warns when invites are off with no bot check and no working email check', () => {
    const w = settingWarnings({ settings: { invite_required: 'false' }, signupConfig: cfg() });
    expect(w.invite).toBe('Anyone can create an account with no bot check and no email check. Turn on one of the checks first.');
    expect(w.verifiedEmail).toBeNull();
  });

  it('warns when the email rule is on but mail is off (the rule does nothing)', () => {
    const w = settingWarnings({
      settings: { invite_required: 'false', require_verified_email: 'true' },
      signupConfig: cfg({ mailEnabled: false }),
    });
    expect(w.invite).toMatch(/^Anyone can create an account/);
    expect(w.verifiedEmail).toBe('Email sending is not switched on yet, so this does nothing for now.');
  });

  it('no invite warning when a bot check is on', () => {
    const w = settingWarnings({ settings: { invite_required: 'false' }, signupConfig: cfg({ turnstileSiteKey: 'abc' }) });
    expect(w.invite).toBeNull();
  });

  it('no invite warning when the email rule is on and mail works', () => {
    const w = settingWarnings({
      settings: { invite_required: 'false', require_verified_email: 'true' },
      signupConfig: cfg({ mailEnabled: true }),
    });
    expect(w).toEqual(none);
  });

  it('mail on but the email rule off still counts as no email check', () => {
    const w = settingWarnings({
      settings: { invite_required: 'false', require_verified_email: 'false' },
      signupConfig: cfg({ mailEnabled: true }),
    });
    expect(w.invite).toMatch(/^Anyone can create an account/);
  });

  it('no email warning when the rule is off, whatever mail says', () => {
    expect(settingWarnings({ settings: { require_verified_email: 'false' }, signupConfig: cfg() }).verifiedEmail).toBeNull();
  });

  it('treats missing settings as their defaults (invite on, email rule off)', () => {
    expect(settingWarnings({ settings: {}, signupConfig: cfg() })).toEqual(none);
  });
});
