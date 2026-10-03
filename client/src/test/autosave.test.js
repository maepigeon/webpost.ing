import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { saveDraft, loadDraft, clearDraft, listDrafts, MAX_DRAFT_BYTES } from '../utils/autosave.js';
import { useAutosave, useTextDraft } from '../utils/useAutosave.js';

// A small in-memory Storage, so the tests do not depend on the environment's.
class MemStorage {
  constructor() { this.m = new Map(); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
const mem = new MemStorage();
Object.defineProperty(window, 'localStorage', { configurable: true, value: mem });
beforeEach(() => { mem.clear(); });

describe('draft store', () => {
  it('saves, loads, lists and clears', () => {
    expect(saveDraft('post:1', { a: 1 }).ok).toBe(true);
    expect(loadDraft('post:1').data).toEqual({ a: 1 });
    expect(localStorage.getItem('draft:post:1')).toContain('"v":1');
    expect(listDrafts().map(d => d.key)).toEqual(['post:1']);
    clearDraft('post:1');
    expect(loadDraft('post:1')).toBeNull();
  });

  it('ignores corrupted JSON and foreign shapes', () => {
    localStorage.setItem('draft:post:2', '{nope');
    localStorage.setItem('draft:post:3', JSON.stringify({ hello: 1 }));
    expect(loadDraft('post:2')).toBeNull();
    expect(loadDraft('post:3')).toBeNull();
    expect(listDrafts()).toEqual([]);
  });

  it('refuses one oversized draft', () => {
    const r = saveDraft('post:big', 'x'.repeat(MAX_DRAFT_BYTES));
    expect(r).toEqual({ ok: false, reason: 'too-large' });
    expect(loadDraft('post:big')).toBeNull();
  });

  it('evicts the oldest drafts over the total budget', () => {
    vi.useFakeTimers();
    const chunk = 'y'.repeat(1.9 * 1024 * 1024);
    for (let i = 0; i < 5; i++) { vi.setSystemTime(1000 + i); saveDraft(`post:${i}`, chunk); }
    vi.useRealTimers();
    const keys = listDrafts().map(d => d.key);
    expect(keys).toContain('post:4');
    expect(keys).not.toContain('post:0');
    expect(listDrafts().reduce((n, d) => n + d.size, 0)).toBeLessThanOrEqual(8 * 1024 * 1024);
  });

  it('never throws when storage fails', () => {
    const spy = vi.spyOn(mem, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(saveDraft('post:1', { a: 1 }).ok).toBe(false);
    spy.mockRestore();
  });
});

describe('useAutosave', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('debounces writes and skips when unchanged', () => {
    const set = vi.spyOn(mem, 'setItem');
    const { rerender } = renderHook(({ d }) => useAutosave('banner:me', d), { initialProps: { d: { n: 0 } } });
    expect(set).not.toHaveBeenCalled();
    rerender({ d: { n: 1 } });
    rerender({ d: { n: 2 } });
    act(() => { vi.advanceTimersByTime(1400); });
    expect(set).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(200); });
    expect(set).toHaveBeenCalledTimes(1);
    expect(loadDraft('banner:me').data).toEqual({ n: 2 });
    rerender({ d: { n: 2 } });   // equal content, new object
    act(() => { vi.advanceTimersByTime(5000); });
    expect(set).toHaveBeenCalledTimes(1);
    set.mockRestore();
  });

  it('writes at once when the tab is hidden', () => {
    const { rerender } = renderHook(({ d }) => useAutosave('theme:me', d), { initialProps: { d: 'a' } });
    rerender({ d: 'b' });
    expect(loadDraft('theme:me')).toBeNull();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(loadDraft('theme:me').data).toBe('b');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  });

  it('serialises lazily only after touch, and flush reports safety', () => {
    const fn = vi.fn(() => ({ big: 1 }));
    const { result } = renderHook(() => useAutosave('post:new', fn));
    expect(fn).not.toHaveBeenCalled();
    act(() => { result.current.touch(); });
    act(() => { vi.advanceTimersByTime(1600); });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(loadDraft('post:new').data).toEqual({ big: 1 });
    act(() => { result.current.clear(); });
    expect(loadDraft('post:new')).toBeNull();
    expect(result.current.flush()).toBe(true);
  });

  it('removes the draft when the data becomes empty', () => {
    const { rerender } = renderHook(({ d }) => useAutosave('comment:7', d), { initialProps: { d: null } });
    rerender({ d: 'hello' });
    act(() => { vi.advanceTimersByTime(1600); });
    expect(loadDraft('comment:7').data).toBe('hello');
    rerender({ d: null });
    act(() => { vi.advanceTimersByTime(1600); });
    expect(loadDraft('comment:7')).toBeNull();
  });

  it('does not write while disabled', () => {
    const { rerender } = renderHook(({ d }) => useAutosave('theme:x', d, { enabled: false }), { initialProps: { d: 1 } });
    rerender({ d: 2 });
    act(() => { vi.advanceTimersByTime(3000); });
    expect(loadDraft('theme:x')).toBeNull();
  });
});

describe('useTextDraft', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('keeps text per conversation, restores it, and clears on send', () => {
    const { result, rerender } = renderHook(({ k }) => useTextDraft(k), { initialProps: { k: 'message:c1' } });
    act(() => { result.current[1]('hello'); });
    rerender({ k: 'message:c2' });                       // switching writes c1 first
    expect(loadDraft('message:c1').data).toBe('hello');
    expect(result.current[0]).toBe('');
    rerender({ k: 'message:c1' });
    expect(result.current[0]).toBe('hello');
    act(() => { result.current[2]('message:c1'); });
    expect(result.current[0]).toBe('');
    expect(loadDraft('message:c1')).toBeNull();
  });
});
