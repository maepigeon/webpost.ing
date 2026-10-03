import { describe, it, expect } from 'vitest';
import { fetchLatestBuild } from '../utils/build.js';

// The repository is private: the browser asks this site's own server, never GitHub.
const server = (data) => ({ calls: [], get(url, opts) { this.calls.push({ url, opts }); return data instanceof Error ? Promise.reject(data) : Promise.resolve({ data }); } });

describe('asking the server about the live build', () => {
  it('sends the build commit to the site\'s own admin endpoint, with the session cookies', async () => {
    const http = server({ available: true, repo: 'a/b', behind: 3, latest: { sha: 'bbbb', message: 'Newest', date: '' } });
    const r = await fetchLatestBuild('aaaa', http);
    expect(r.behind).toBe(3);
    expect(http.calls[0].url).toMatch(/\/api\/admin\/build\/latest$/);
    expect(http.calls[0].url).not.toMatch(/github/);
    expect(http.calls[0].opts).toMatchObject({ params: { commit: 'aaaa' }, withCredentials: true });
  });

  it('passes an empty commit when the build has none', async () => {
    const http = server({ available: false });
    await fetchLatestBuild('', http);
    expect(http.calls[0].opts.params).toEqual({ commit: '' });
  });

  it('hands back "not available" as it is, for the box to say the check is off', async () => {
    expect(await fetchLatestBuild('aaaa', server({ available: false }))).toEqual({ available: false });
  });

  it('fails when the server cannot be reached', async () => {
    await expect(fetchLatestBuild('aaaa', server(new Error('down')))).rejects.toThrow();
  });
});

import { symbolForKey, keyForSymbol, SYMBOL_CHARS } from '../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/bitmapFonts.js';

describe('typing in the Symbols font', () => {
  it('turns each printable key into a symbol, and back', () => {
    expect(symbolForKey('!')).toBe(SYMBOL_CHARS[0]);
    expect(symbolForKey('a')).toBe(SYMBOL_CHARS['a'.charCodeAt(0) - 33]);
    expect(keyForSymbol(symbolForKey('a'))).toBe('a');
    expect(new Set(Array.from({ length: 94 }, (_, i) => symbolForKey(String.fromCharCode(33 + i)))).size).toBe(94);
  });

  it('leaves spaces, symbols themselves and other characters alone', () => {
    expect(symbolForKey(' ')).toBe(' ');
    expect(symbolForKey('★')).toBe('★');
    expect(symbolForKey('é')).toBe('é');
  });
});
