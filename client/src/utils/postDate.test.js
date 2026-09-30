import { describe, it, expect } from 'vitest';
import { postDateline } from './postDate.js';

describe('postDateline', () => {
  it('writes the day out in full, with no raw timestamp', () => {
    const { text, iso } = postDateline('2026-06-13T12:03:07.812+00:00');
    expect(text).toMatch(/2026/);
    expect(text).not.toMatch(/T\d\d:/);
    expect(iso).toBe('2026-06-13T12:03:07.812Z');
  });
  it('is empty for an unsaved or unreadable date', () => {
    expect(postDateline('').text).toBe('');
    expect(postDateline('not a date').text).toBe('');
  });
});
