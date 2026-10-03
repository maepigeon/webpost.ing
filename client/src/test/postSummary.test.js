import { describe, it, expect } from 'vitest';
import { cleanSummary, SUMMARY_MAX } from '../utils/postSummary.js';

describe('cleanSummary', () => {
  it('turns newlines into spaces and trims', () => {
    expect(cleanSummary('  one\ntwo \r\n three ')).toBe('one two three');
  });
  it('treats nothing as empty', () => {
    expect(cleanSummary(null)).toBe('');
    expect(cleanSummary(' \n ')).toBe('');
  });
  it('caps the length', () => {
    expect(cleanSummary('x'.repeat(400))).toHaveLength(SUMMARY_MAX);
  });
});
