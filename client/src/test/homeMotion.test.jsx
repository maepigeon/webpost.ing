import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, act, cleanup, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DialogProvider } from '../components/Dialog/Dialog.jsx';
import WaterTitle from '../components/Pages/Home/WaterTitle.jsx';
import Home from '../components/Pages/Home/Home.jsx';
import { REDUCED_MOTION } from '../utils/frameLoop.js';

// A hand-cranked requestAnimationFrame: frames run only when the test says so.
let frames;
let nextId;
let reduced;
const pending = () => frames.size;
const runFrame = () => { const due = [...frames.values()]; frames.clear(); due.forEach(f => f()); };

// jsdom has no canvas: a stand-in whose pixels are real arrays, so the water's sums run.
const W = 120, H = 48;
const fakeContext = () => {
  const image = (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
  return {
    fillRect: vi.fn(), clearRect: vi.fn(), drawImage: vi.fn(), fillText: vi.fn(), strokeRect: vi.fn(),
    save: vi.fn(), restore: vi.fn(), setTransform: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
    putImageData: vi.fn(),
    createImageData: vi.fn(image),
    getImageData: vi.fn((x, y, w, h) => image(w, h)),
  };
};

beforeEach(() => {
  frames = new Map();
  nextId = 1;
  reduced = false;
  vi.stubGlobal('requestAnimationFrame', (f) => { const id = nextId++; frames.set(id, f); return id; });
  vi.stubGlobal('cancelAnimationFrame', (id) => { frames.delete(id); });
  vi.stubGlobal('matchMedia', (query) => ({
    get matches() { return query === REDUCED_MOTION && reduced; },
    addEventListener: () => {}, removeEventListener: () => {},
  }));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function getContext() {
    this.fake2d ||= { ...fakeContext(), canvas: this };
    return this.fake2d;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: W, height: H });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(W);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(H);
  Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve() } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); delete document.fonts; });

const mountTitle = async () => {
  const { container, unmount } = render(<WaterTitle text="webpost.ing" />);
  await act(async () => {});            // the fonts are ready
  const canvas = container.querySelector('canvas');
  return { canvas, ctx: canvas.fake2d, unmount };
};
/** Runs frames until none is asked for; how many it took. */
const runUntilStill = (limit = 5000) => {
  let n = 0;
  while (pending() && n < limit) { runFrame(); n++; }
  return n;
};

describe('the home page title', () => {
  it('is drawn once at rest, and then asks for no frames at all', async () => {
    const { ctx } = await mountTitle();
    expect(ctx.putImageData).toHaveBeenCalledTimes(1);
    expect(pending()).toBe(0);
  });

  it('ripples when touched, then settles back to the same picture and stops', async () => {
    const { canvas, ctx } = await mountTitle();
    const atRest = ctx.putImageData.mock.calls[0][0];

    fireEvent.mouseDown(canvas, { clientX: 60, clientY: 24 });
    expect(pending()).toBe(1);
    const took = runUntilStill();
    expect(took).toBeGreaterThan(10);     // it did animate
    expect(took).toBeLessThan(5000);      // and it did stop
    expect(pending()).toBe(0);
    expect(ctx.putImageData.mock.calls.at(-1)[0]).toBe(atRest);

    fireEvent.mouseMove(canvas, { clientX: 5, clientY: 5 });   // and wakes again
    expect(pending()).toBe(1);
  });

  it('asks for nothing after it has gone', async () => {
    const { canvas, unmount } = await mountTitle();
    fireEvent.mouseDown(canvas, { clientX: 60, clientY: 24 });
    runFrame();
    unmount();
    expect(pending()).toBe(0);
  });

  it('stays at rest for a visitor who asks for reduced motion, and lets a touch scroll the page', async () => {
    reduced = true;
    const { canvas, ctx } = await mountTitle();
    expect(ctx.putImageData).toHaveBeenCalledTimes(1);
    fireEvent.mouseDown(canvas, { clientX: 60, clientY: 24 });
    fireEvent.mouseMove(canvas, { clientX: 5, clientY: 5 });
    expect(pending()).toBe(0);
    const move = new Event('touchmove', { bubbles: true, cancelable: true });
    move.touches = [{ clientX: 5, clientY: 5 }];
    canvas.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(false);
    expect(pending()).toBe(0);
  });
});

describe('the home page welcome', () => {
  it('holds the grid\'s place until the grid arrives, then shows it', async () => {
    const { container } = render(<MemoryRouter><DialogProvider><Home /></DialogProvider></MemoryRouter>);
    const sub = container.querySelector('.home-hero-sub');
    // The grid editor is fetched apart from the page: first only its placeholder is there.
    expect(sub.querySelector('canvas')).toBeNull();
    expect(sub.children).toHaveLength(1);
    expect(sub.firstElementChild.getAttribute('aria-hidden')).toBe('true');

    const grid = await screen.findByRole('img');
    expect(sub.contains(grid)).toBe(true);
    expect(sub.querySelector('[aria-hidden="true"]:not(.tilegrid *)')).toBeNull();
    expect(sub.textContent).toContain('Mae');
  });
});
