import { describe, it, expect } from 'vitest';
import { errorMessage } from './errorMessage.js';

const failed = (data) => ({ response: { data } });

describe('errorMessage', () => {
  it('uses a plain text answer', () => {
    expect(errorMessage(failed('User not found.'), 'x')).toBe('User not found.');
  });
  it('reads {message} and {error}', () => {
    expect(errorMessage(failed({ message: 'Too large.' }), 'x')).toBe('Too large.');
    expect(errorMessage(failed({ error: 'Username required.' }), 'x')).toBe('Username required.');
  });
  it('never returns an object', () => {
    expect(errorMessage(failed({ timestamp: 1, status: 500, error: 'Internal Server Error', path: '/api' }), 'Try again.'))
      .toBe('Try again.');
    expect(errorMessage(failed({ code: 3 }), 'Try again.')).toBe('Try again.');
  });
  it('falls back without a response or with an HTML page', () => {
    expect(errorMessage(new Error('Network Error'), 'Offline.')).toBe('Offline.');
    expect(errorMessage(failed('<html><body>502</body></html>'), 'Down.')).toBe('Down.');
    expect(errorMessage(failed(''), 'Empty.')).toBe('Empty.');
  });
});
