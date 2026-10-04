import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createFrameLoop, atRest, REDUCED_MOTION } from '../utils/frameLoop.js';

// A hand-cranked requestAnimationFrame: frames run only when the test says so.
let frames;
let nextId;
const pending = () => frames.size;
const runFrame = () => {
  const due = [...frames.values()];
  frames.clear();
  due.forEach(f => f());
};

let hidden;
let reduced;
let motionListeners;
let observers;

beforeEach(() => {
  frames = new Map();
  nextId = 1;
  hidden = false;
  reduced = false;
  motionListeners = new Set();
  observers = [];
  vi.stubGlobal('requestAnimationFrame', (f) => { const id = nextId++; frames.set(id, f); return id; });
  vi.stubGlobal('cancelAnimationFrame', (id) => { frames.delete(id); });
  vi.stubGlobal('matchMedia', (query) => ({
    get matches() { return query === REDUCED_MOTION && reduced; },
    addEventListener: (_, f) => motionListeners.add(f),
    removeEventListener: (_, f) => motionListeners.delete(f),
  }));
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback) { this.callback = callback; this.observed = []; this.disconnected = false; observers.push(this); }
    observe(el) { this.observed.push(el); }
    disconnect() { this.disconnected = true; }
  });
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => (hidden ? 'hidden' : 'visible'));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const setHidden = (v) => { hidden = v; document.dispatchEvent(new Event('visibilitychange')); };
const setReduced = (v) => { reduced = v; motionListeners.forEach(f => f({ matches: v })); };
const setOnScreen = (v) => observers[0].callback([{ isIntersecting: v }]);

describe('createFrameLoop', () => {
  it('asks for no frame until woken, and stops asking once the step has settled', () => {
    let left = 3;
    const step = vi.fn(() => --left > 0);
    const loop = createFrameLoop(step);
    expect(pending()).toBe(0);

    expect(loop.wake()).toBe(true);
    expect(pending()).toBe(1);
    runFrame(); runFrame(); runFrame();
    expect(step).toHaveBeenCalledTimes(3);
    expect(pending()).toBe(0);          // settled: nothing runs while at rest

    left = 1;
    loop.wake();
    runFrame();
    expect(step).toHaveBeenCalledTimes(4);
    expect(pending()).toBe(0);
    loop.stop();
  });

  it('asks for one frame however often it is woken before that frame', () => {
    const step = vi.fn(() => false);
    const loop = createFrameLoop(step);
    loop.wake(); loop.wake(); loop.wake();
    expect(pending()).toBe(1);
    runFrame();
    expect(step).toHaveBeenCalledTimes(1);
    loop.stop();
  });

  it('pauses while the tab is hidden and carries on when it shows again', () => {
    const step = vi.fn(() => true);
    const loop = createFrameLoop(step);
    loop.wake();
    runFrame();
    expect(pending()).toBe(1);

    setHidden(true);
    expect(pending()).toBe(0);
    loop.wake();                        // movement while hidden waits
    expect(pending()).toBe(0);

    setHidden(false);
    expect(pending()).toBe(1);
    runFrame();
    expect(step).toHaveBeenCalledTimes(2);
    loop.stop();
  });

  it('does not start again on showing the tab when it had already settled', () => {
    const loop = createFrameLoop(() => false);
    loop.wake();
    runFrame();
    setHidden(true);
    setHidden(false);
    expect(pending()).toBe(0);
    loop.stop();
  });

  it('pauses while its element is off screen', () => {
    const el = document.createElement('canvas');
    const step = vi.fn(() => true);
    const loop = createFrameLoop(step, { element: el });
    expect(observers[0].observed).toEqual([el]);
    loop.wake();
    runFrame();

    setOnScreen(false);
    expect(pending()).toBe(0);
    setOnScreen(true);
    expect(pending()).toBe(1);
    runFrame();
    expect(step).toHaveBeenCalledTimes(2);

    loop.stop();
    expect(observers[0].disconnected).toBe(true);
  });

  it('never runs for a visitor who asks for reduced motion', () => {
    reduced = true;
    const step = vi.fn(() => true);
    const loop = createFrameLoop(step);
    expect(loop.wake()).toBe(false);
    expect(pending()).toBe(0);
    expect(step).not.toHaveBeenCalled();
    loop.stop();
  });

  it('stops part-way and says so when reduced motion is turned on, and runs again once it is off', () => {
    const step = vi.fn(() => true);
    const onStill = vi.fn();
    const loop = createFrameLoop(step, { onStill });
    loop.wake();
    runFrame();

    setReduced(true);
    expect(pending()).toBe(0);
    expect(onStill).toHaveBeenCalledTimes(1);

    setReduced(false);
    expect(pending()).toBe(0);          // what was moving was put at rest, not kept waiting
    expect(loop.wake()).toBe(true);
    expect(pending()).toBe(1);
    loop.stop();
  });

  it('runs nothing after stop, and lets go of its listeners', () => {
    const step = vi.fn(() => true);
    const loop = createFrameLoop(step);
    loop.wake();
    loop.stop();
    expect(pending()).toBe(0);
    expect(loop.wake()).toBe(false);
    setHidden(true); setHidden(false);
    expect(pending()).toBe(0);
    expect(motionListeners.size).toBe(0);
    expect(step).not.toHaveBeenCalled();
  });
});

describe('atRest', () => {
  it('is true only when every value in every field is within the threshold', () => {
    const a = new Float32Array([0, 0.00005, -0.00005]);
    const b = new Float32Array(3);
    expect(atRest([a, b], 1e-4)).toBe(true);
    b[2] = -0.001;
    expect(atRest([a, b], 1e-4)).toBe(false);
    b[2] = 0; a[0] = 0.5;
    expect(atRest([a, b], 1e-4)).toBe(false);
  });
});
