import { describe, it, expect } from 'vitest';
import { startBanner, bannerIsDirty } from './bannerDraft.js';

const dirty = (s, over = {}) =>
  bannerIsDirty({ draft: s.grid, baseJson: JSON.stringify(s.base), restored: s.restored, savedNow: false, ...over });

describe('startBanner', () => {
  it('with no saved banner, the draft is the very object it is measured against', () => {
    const s = startBanner(null, null);
    expect(s.grid).toBe(s.base);
    expect(s.restored).toBe(false);
    expect(dirty(s)).toBe(false);
  });

  it('starts clean on a saved banner too', () => {
    const saved = startBanner(null, null).base;
    const s = startBanner(saved, null);
    expect(s.base).toBe(saved);
    expect(dirty(s)).toBe(false);
  });

  it('treats a kept draft as unsaved work', () => {
    const other = startBanner(null, null).base;
    const s = startBanner(null, { data: other });
    expect(s.restored).toBe(true);
    expect(dirty(s)).toBe(true);
    // Even when the kept draft happens to equal the start.
    const same = startBanner(null, null);
    const s2 = startBanner(same.base, { data: same.base });
    expect(dirty(s2)).toBe(true);
  });

  it('ignores a kept draft it cannot read', () => {
    const s = startBanner(null, { data: 'nope' });
    expect(s.restored).toBe(false);
    expect(dirty(s)).toBe(false);
  });
});

describe('bannerIsDirty', () => {
  it('turns true when the draft changes, false again after saving', () => {
    const s = startBanner(null, null);
    const edited = { ...s.grid, rows: s.grid.rows + 1 };
    expect(dirty(s, { draft: edited })).toBe(true);
    expect(dirty(s, { draft: edited, savedNow: true })).toBe(false);
  });
});
