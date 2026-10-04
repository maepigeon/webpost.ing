import { describe, it, expect } from 'vitest';
import { exportPlan, extensionForMime, fileSafe, pickRecorderMime, planEnds } from '../animator/engine/exporter.js';

const frames = (...holds) => holds.map((hold, i) => ({ id: `f${i}`, hold }));

describe('export duration', () => {
  it('gives each frame its hold time', () => {
    const plan = exportPlan(frames(1, 2, 1), 10);
    expect(plan.items).toEqual([
      { index: 0, durationMs: 100 }, { index: 1, durationMs: 200 }, { index: 2, durationMs: 100 },
    ]);
    expect(plan.totalMs).toBe(400);
  });

  it('rounds the ends once so odd frame rates do not drift', () => {
    const ends = planEnds(frames(1, 1, 1, 1, 1, 1), 24);   // 41.666 ms each
    expect(ends[5]).toBe(250);
    expect(ends).toEqual([...ends].sort((a, b) => a - b));
  });

  it('a one-frame film lasts one frame', () => {
    expect(exportPlan(frames(1), 12).totalMs).toBe(83);
  });
});

describe('export helpers', () => {
  it('picks the first supported recorder type', () => {
    const MR = { isTypeSupported: (t) => t === 'video/webm' || t === 'video/mp4' };
    expect(pickRecorderMime(MR)).toBe('video/webm');
    expect(pickRecorderMime({ isTypeSupported: () => false })).toBeNull();
    expect(pickRecorderMime(null)).toBeNull();
  });
  it('chooses the file extension from the type', () => {
    expect(extensionForMime('video/mp4')).toBe('mp4');
    expect(extensionForMime('video/webm')).toBe('webm');
  });
  it('makes safe file names', () => {
    expect(fileSafe('My walk / cycle!')).toBe('My-walk-cycle');
    expect(fileSafe('   ')).toBe('animation');
  });
});
