import { describe, it, expect } from 'vitest';

// A canvas is not available here, so the screens are not drawn; this checks that every module
// resolves its imports (symbol and file names) and that the page exports a component.
describe('animator modules load', () => {
  it('imports the page and every engine module', async () => {
    const page = await import('../animator/AnimatorPage.jsx');
    expect(typeof page.default).toBe('function');
    for (const m of ['bitmap', 'brush', 'compositor', 'exporter', 'history', 'playback', 'project', 'session', 'storage', 'zip']) {
      expect(await import(`../animator/engine/${m}.js`)).toBeTruthy();
    }
  });
});
