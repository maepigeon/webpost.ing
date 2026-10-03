import { describe, it, expect } from 'vitest';
import { compareWithMain } from '../utils/build.js';

const github = (routes) => async (url) => {
  const hit = Object.entries(routes).find(([path]) => url.endsWith(path));
  return hit ? { ok: true, json: async () => hit[1] } : { ok: false, status: 404 };
};
const head = { sha: 'bbbb', commit: { message: 'Newest\n\nbody', committer: { date: '2026-10-03T00:00:00Z' } } };

describe('comparing the live build with main', () => {
  it('is up to date when the build is main', async () => {
    expect((await compareWithMain('bbbb', github({ '/commits/main': head }))).behind).toBe(0);
  });

  it('counts how far behind an older build is, and names the latest', async () => {
    const r = await compareWithMain('aaaa', github({ '/commits/main': head, '/compare/aaaa...main': { ahead_by: 3 } }));
    expect(r.behind).toBe(3);
    expect(r.latest).toEqual({ sha: 'bbbb', message: 'Newest', date: '2026-10-03T00:00:00Z' });
  });

  it('cannot compare a build GitHub does not know, or one with no commit', async () => {
    expect((await compareWithMain('zzzz', github({ '/commits/main': head }))).behind).toBeNull();
    expect((await compareWithMain('', github({ '/commits/main': head }))).behind).toBeNull();
  });

  it('fails when GitHub cannot be reached', async () => {
    await expect(compareWithMain('aaaa', github({}))).rejects.toThrow();
  });
});
