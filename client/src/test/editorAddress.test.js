import { describe, it, expect, vi } from 'vitest';
import { showSavedPostAddress } from '../components/Pages/Posts/PostRenderer/RichTextPost/Editor.jsx';

const fakeWindow = () => ({ history: { state: { key: 'k', idx: 3 }, replaceState: vi.fn() } });

describe('showSavedPostAddress', () => {
  it('replaces the address with the new post\'s, keeping the router\'s history state', () => {
    const win = fakeWindow();
    expect(showSavedPostAddress(42, win)).toBe(true);
    expect(win.history.replaceState).toHaveBeenCalledWith({ key: 'k', idx: 3 }, '', '/editor/42');
  });

  it('does nothing without a real id', () => {
    const win = fakeWindow();
    for (const id of [null, undefined, 0, -1, 'abc']) expect(showSavedPostAddress(id, win)).toBe(false);
    expect(win.history.replaceState).not.toHaveBeenCalled();
  });

  it('survives a browser that refuses', () => {
    const win = fakeWindow();
    win.history.replaceState.mockImplementation(() => { throw new Error('blocked'); });
    expect(showSavedPostAddress(7, win)).toBe(false);
  });
});
