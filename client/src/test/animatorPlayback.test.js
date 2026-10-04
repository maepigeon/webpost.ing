import { describe, it, expect } from 'vitest';
import { createPlayback, frameAtTime, frameDurationMs, totalDurationMs } from '../animator/engine/playback.js';

/** A fake clock whose rAF fires every 16 ms of fake time. */
function clock() {
  let t = 0;
  let id = 0;
  const queue = new Map();
  return {
    now: () => t,
    raf: (fn) => { queue.set(++id, fn); return id; },
    caf: (h) => { queue.delete(h); },
    advance(ms) {
      const end = t + ms;
      while (t < end) {
        t = Math.min(end, t + 16);
        const run = [...queue.entries()];
        queue.clear();
        run.forEach(([, fn]) => fn(t));
      }
    },
  };
}

const frames = (...holds) => holds.map((hold, i) => ({ id: `f${i}`, hold }));

describe('timing helpers', () => {
  it('honours hold in durations', () => {
    expect(frameDurationMs({ hold: 2 }, 10)).toBe(200);
    expect(totalDurationMs(frames(1, 2, 1), 10)).toBe(400);
  });
  it('finds the frame at a time, looping or not', () => {
    const f = frames(1, 2, 1);                 // 100, 200, 100 ms at 10 fps
    expect(frameAtTime(f, 10, 0)).toBe(0);
    expect(frameAtTime(f, 10, 99)).toBe(0);
    expect(frameAtTime(f, 10, 100)).toBe(1);
    expect(frameAtTime(f, 10, 299)).toBe(1);
    expect(frameAtTime(f, 10, 300)).toBe(2);
    expect(frameAtTime(f, 10, 400)).toBe(0);    // looped
    expect(frameAtTime(f, 10, 400, false)).toBe(2);
  });
});

describe('player', () => {
  const setup = (f, fps = 10) => {
    const c = clock();
    const shown = [];
    let stopped = 0;
    const p = createPlayback({ getFrames: () => f, getFps: () => fps, onFrame: i => shown.push(i), onStop: () => { stopped++; }, raf: c.raf, caf: c.caf, now: c.now });
    return { c, p, shown, stops: () => stopped };
  };

  it('steps at the frame rate', () => {
    const { c, p, shown } = setup(frames(1, 1, 1, 1));
    p.play(0);
    c.advance(1000);
    // 10 frames in a second over 4 frames: 0->1,2,3,0,1,2,3,0,1,2
    expect(shown.length).toBeGreaterThanOrEqual(9);
    expect(shown.length).toBeLessThanOrEqual(10);
    expect(shown.slice(0, 5)).toEqual([1, 2, 3, 0, 1]);
  });

  it('keeps a held frame for longer', () => {
    const { c, p, shown } = setup(frames(1, 3, 1));
    p.play(0);
    c.advance(150);
    expect(shown).toEqual([1]);                 // at 100 ms
    c.advance(200);                             // 350 ms: still inside frame 1 (100..400)
    expect(shown).toEqual([1]);
    c.advance(100);                             // 450 ms
    expect(shown).toEqual([1, 2]);
  });

  it('stops at the end when not looping', () => {
    const { c, p, shown, stops } = setup(frames(1, 1));
    p.setLoop(false);
    p.play(0);
    c.advance(1000);
    expect(shown).toEqual([1]);
    expect(stops()).toBe(1);
    expect(p.isPlaying()).toBe(false);
  });

  it('pauses and reports it', () => {
    const { c, p, shown, stops } = setup(frames(1, 1, 1));
    p.play(0);
    c.advance(100);
    p.pause();
    const n = shown.length;
    c.advance(500);
    expect(shown.length).toBe(n);
    expect(stops()).toBe(1);
  });

  it('follows fps changes while playing', () => {
    const f = frames(1, 1, 1, 1);
    let fps = 10;
    const c = clock();
    const shown = [];
    const p = createPlayback({ getFrames: () => f, getFps: () => fps, onFrame: i => shown.push(i), raf: c.raf, caf: c.caf, now: c.now });
    p.play(0);
    c.advance(200);
    const slow = shown.length;
    fps = 40;
    c.advance(200);
    expect(shown.length - slow).toBeGreaterThan(slow);
  });

  it('does not skip ahead after a long pause between ticks', () => {
    let pending = null;
    const shown = [];
    const p = createPlayback({
      getFrames: () => frames(1, 1, 1, 1, 1, 1, 1, 1, 1, 1), getFps: () => 10, onFrame: i => shown.push(i),
      raf: (fn) => { pending = fn; return 1; }, caf: () => { pending = null; }, now: () => 0,
    });
    p.play(0);
    pending(10000);                              // a hidden tab wakes 10 s later
    expect(shown[shown.length - 1]).toBeLessThanOrEqual(3);   // at most 250 ms of catching up
  });
});
