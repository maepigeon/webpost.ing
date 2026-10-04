// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { clearLocalSession } from './session.js';

afterEach(() => vi.unstubAllGlobals());

describe('clearLocalSession', () => {
  it('clears the stored sign-in and tells the page the session ended', () => {
    const store = { userName: 'vt5', isAdmin: 'true' };
    vi.stubGlobal('localStorage', { removeItem: k => { delete store[k]; } });
    const heard = vi.fn();
    window.addEventListener('wp:session-cleared', heard);
    clearLocalSession();
    window.removeEventListener('wp:session-cleared', heard);
    expect(store).toEqual({});
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
