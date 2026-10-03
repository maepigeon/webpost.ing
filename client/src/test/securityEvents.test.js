import { describe, it, expect } from 'vitest';
import { eventLabel, devicesText, canDelete, whenText, roughPlace } from '../components/Pages/Settings/securityEvents.js';

describe('security events', () => {
  it('names events in plain words', () => {
    expect(eventLabel('sign_in')).toBe('Signed in');
    expect(eventLabel('password_changed')).toBe('Password changed');
    expect(eventLabel('mystery')).toBe('Account activity');
  });
  it('counts devices', () => {
    expect(devicesText(1)).toBe('You are signed in on 1 device.');
    expect(devicesText(3)).toBe('You are signed in on 3 devices.');
    expect(devicesText(undefined)).toBe('You are signed in on 1 device.');
  });
  it('enables delete only for the exact username and a password', () => {
    expect(canDelete('mae', 'mae', 'pw')).toBe(true);
    expect(canDelete(' mae ', 'mae', 'pw')).toBe(true);
    expect(canDelete('Mae', 'mae', 'pw')).toBe(false);
    expect(canDelete('mae', 'mae', '')).toBe(false);
    expect(canDelete('', '', 'pw')).toBe(false);
  });
  it('says when, roughly', () => {
    const now = Date.parse('2026-10-03T12:00:00Z');
    expect(whenText('2026-10-03T11:59:40Z', now)).toBe('just now');
    expect(whenText('2026-10-03T11:30:00Z', now)).toBe('30 min ago');
    expect(whenText('2026-10-03T09:00:00Z', now)).toBe('3 h ago');
    expect(whenText('garbage', now)).toBe('');
  });
  it('shows the shortened address as a network', () => {
    expect(roughPlace('203.0.113.0')).toBe('network 203.0.113.0');
    expect(roughPlace(null)).toBe('');
  });
});
