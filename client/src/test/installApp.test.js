import { describe, it, expect, vi, beforeEach } from 'vitest';
import { canInstall, promptInstall, isStandalone, isIos } from '../utils/installApp.js';

function setMatchMedia(matches) {
  window.matchMedia = vi.fn().mockReturnValue({ matches });
}
function setNav(props) {
  for (const [k, v] of Object.entries(props)) Object.defineProperty(window.navigator, k, { value: v, configurable: true });
}

beforeEach(() => {
  setMatchMedia(false);
  setNav({ standalone: undefined, userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', maxTouchPoints: 0 });
});

describe('isStandalone', () => {
  it('is false in a normal tab', () => expect(isStandalone()).toBe(false));
  it('is true for display-mode standalone', () => { setMatchMedia(true); expect(isStandalone()).toBe(true); });
  it('is true for iOS navigator.standalone', () => { setNav({ standalone: true }); expect(isStandalone()).toBe(true); });
});

describe('isIos', () => {
  it('detects iPhone', () => { setNav({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' }); expect(isIos()).toBe(true); });
  it('detects iPadOS posing as a Mac', () => { setNav({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 }); expect(isIos()).toBe(true); });
  it('is false on a desktop Mac and on Android', () => {
    setNav({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' });
    expect(isIos()).toBe(false);
    setNav({ userAgent: 'Mozilla/5.0 (Linux; Android 14)' });
    expect(isIos()).toBe(false);
  });
});

describe('promptInstall', () => {
  it('uses the stored prompt once', async () => {
    expect(await promptInstall()).toBe(false);
    const ev = new Event('beforeinstallprompt', { cancelable: true });
    ev.prompt = vi.fn();
    ev.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(canInstall()).toBe(true);
    expect(await promptInstall()).toBe(true);
    expect(ev.prompt).toHaveBeenCalledTimes(1);
    expect(canInstall()).toBe(false);
    expect(await promptInstall()).toBe(false);
    expect(ev.prompt).toHaveBeenCalledTimes(1);
  });
});
