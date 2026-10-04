import { describe, it, expect } from 'vitest';
import { ssoLoginMessage, ssoProvidersOf, ssoSettingsMessage } from '../components/Pages/Auth/Login/ssoOutcome.js';

describe('ssoProvidersOf', () => {
  it('is empty until the server lists providers', () => {
    expect(ssoProvidersOf(null)).toEqual([]);
    expect(ssoProvidersOf({})).toEqual([]);
    expect(ssoProvidersOf({ ssoProviders: 'google' })).toEqual([]);
    expect(ssoProvidersOf({ inviteRequired: true, turnstileSiteKey: null, mailEnabled: false })).toEqual([]);
  });

  it('keeps well-formed entries in the server\'s order and drops the rest', () => {
    expect(ssoProvidersOf({ ssoProviders: [
      { id: 'google', name: 'Google' },
      { id: '../evil', name: 'Evil' },
      { id: 'microsoft', name: ' Microsoft ' },
      { id: 'apple' },
      null,
      { id: 'GOOGLE', name: 'Shouty' },
    ] })).toEqual([{ id: 'google', name: 'Google' }, { id: 'microsoft', name: 'Microsoft' }]);
  });
});

describe('what ?sso= means', () => {
  it('has a plain line for every reason nobody was signed in, and none for ok or nonsense', () => {
    for (const code of ['failed', 'cancelled', 'exists', 'refused', 'busy']) {
      expect(ssoLoginMessage(code)).toMatch(/\.$/);
    }
    expect(ssoLoginMessage('exists')).toBe(
      'An account with this email exists. Sign in with your password, then link this provider in Settings.');
    expect(ssoLoginMessage('ok')).toBe('');
    expect(ssoLoginMessage(null)).toBe('');
    expect(ssoLoginMessage('toString')).toBe('');
    expect(ssoLoginMessage('<script>')).toBe('');
  });

  it('tells Settings whether the news is good', () => {
    expect(ssoSettingsMessage('linked')).toEqual({ text: 'Linked. You can now sign in with it.', error: false });
    expect(ssoSettingsMessage('taken').error).toBe(true);
    expect(ssoSettingsMessage('other').error).toBe(true);
    expect(ssoSettingsMessage('reauth').error).toBe(false);
    expect(ssoSettingsMessage(null)).toBeNull();
    expect(ssoSettingsMessage('constructor')).toBeNull();
  });
});
