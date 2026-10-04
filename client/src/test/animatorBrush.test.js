import { describe, it, expect } from 'vitest';
import {
  StrokeBuilder, floodRegion, fillBitmap, pressureOpacity, pressureScale, readPressure, spacingFor, stampAlpha, walkSegment,
} from '../animator/engine/brush.js';
import { rawBitmap, hexToRgba, rgbaToHex, clampRect, unionRect } from '../animator/engine/bitmap.js';
import { fitView, onionPlan, screenToDoc, zoomAbout } from '../animator/engine/compositor.js';

describe('stamp spacing', () => {
  it('spaces stamps evenly along a straight line', () => {
    const state = { started: false, carry: 0 };
    const out = walkSegment(state, { x: 0, y: 0, p: 1 }, { x: 100, y: 0, p: 1 }, () => 10);
    expect(out.map(s => s.x)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });

  it('carries the gap across segments so spacing stays even', () => {
    const state = { started: false, carry: 0 };
    const a = walkSegment(state, { x: 0, y: 0, p: 1 }, { x: 25, y: 0, p: 1 }, () => 10);
    const b = walkSegment(state, { x: 25, y: 0, p: 1 }, { x: 50, y: 0, p: 1 }, () => 10);
    expect([...a, ...b].map(s => s.x)).toEqual([0, 10, 20, 30, 40, 50]);
  });

  it('interpolates pressure between the ends', () => {
    const state = { started: false, carry: 0 };
    const out = walkSegment(state, { x: 0, y: 0, p: 0 }, { x: 10, y: 0, p: 1 }, () => 5);
    expect(out.map(s => s.p)).toEqual([0, 0.5, 1]);
  });

  it('a single tap makes one stamp', () => {
    const b = new StrokeBuilder({ spacingOf: () => 5 });
    expect(b.add(7, 7, 0.5)).toHaveLength(1);
    expect(b.end()).toHaveLength(0);
  });

  it('spacing grows with brush size and has a floor', () => {
    expect(spacingFor(100)).toBeGreaterThan(spacingFor(20));
    expect(spacingFor(1)).toBeGreaterThanOrEqual(0.75);
  });
});

describe('stroke builder', () => {
  it('leaves no gaps larger than the spacing, even for fast samples', () => {
    const b = new StrokeBuilder({ spacingOf: () => 4, smoothing: 0 });
    const stamps = [...b.add(0, 0), ...b.add(200, 0), ...b.add(400, 50), ...b.end()];
    for (let i = 1; i < stamps.length; i++) {
      const d = Math.hypot(stamps[i].x - stamps[i - 1].x, stamps[i].y - stamps[i - 1].y);
      expect(d).toBeLessThanOrEqual(4.01);
    }
  });

  it('ends where the pen ended', () => {
    const b = new StrokeBuilder({ spacingOf: () => 2, smoothing: 0.5 });
    const stamps = [...b.add(0, 0), ...b.add(50, 0), ...b.add(100, 0), ...b.end()];
    expect(stamps[stamps.length - 1].x).toBeGreaterThan(95);
  });

  it('smoothing steadies a jittery line', () => {
    const jitter = (smoothing) => {
      const b = new StrokeBuilder({ spacingOf: () => 2, smoothing });
      const out = [];
      for (let i = 0; i <= 40; i++) out.push(...b.add(i * 5, i % 2 ? 6 : -6));
      return Math.max(...out.filter(s => s.x > 100).map(s => Math.abs(s.y)));   // mid-stroke, after the start has settled
    };
    expect(jitter(0.7)).toBeLessThan(jitter(0));
  });
});

describe('pressure', () => {
  it('a mouse draws at full size and strength', () => {
    expect(pressureScale(0.5, { pen: false })).toBe(1);
    expect(pressureOpacity(0.5, { pen: false })).toBe(1);
  });
  it('a pen grows with pressure', () => {
    expect(pressureScale(0, { pen: true })).toBeLessThan(pressureScale(1, { pen: true }));
    expect(pressureScale(1, { pen: true })).toBe(1);
    expect(pressureOpacity(0, { pen: true })).toBeLessThan(pressureOpacity(1, { pen: true }));
  });
  it('reads 0.5 when a mouse or a pen reports no pressure', () => {
    expect(readPressure({ pointerType: 'mouse', pressure: 0.5 })).toEqual({ pressure: 0.5, pen: false });
    expect(readPressure({ pointerType: 'pen', pressure: 0.8 })).toEqual({ pressure: 0.8, pen: true });
    expect(readPressure({ pointerType: 'pen', pressure: 0 }).pressure).toBe(0.5);
  });
  it('splits stroke opacity over overlapping stamps', () => {
    expect(stampAlpha(1)).toBe(1);
    const a = stampAlpha(0.5);
    expect(a).toBeLessThan(0.5);
    expect(1 - Math.pow(1 - a, 1 / 0.12)).toBeCloseTo(0.5, 5);
  });
});

describe('bucket fill', () => {
  const grid = (rows) => {
    const h = rows.length, w = rows[0].length;
    const b = rawBitmap(w, h);
    rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') b.data.set([0, 0, 0, 255], (y * w + x) * 4); }));
    return b;
  };

  it('fills only the connected empty area', () => {
    const b = grid(['..#..', '..#..', '..#..']);
    const r = fillBitmap(b, 0, 0, [255, 0, 0, 255], 0);
    expect(r.rect).toEqual({ x: 0, y: 0, w: 2, h: 3 });
    expect(Array.from(b.readRect(1, 2, 1, 1))).toEqual([255, 0, 0, 255]);
    expect(Array.from(b.readRect(3, 0, 1, 1))).toEqual([0, 0, 0, 0]);   // other side untouched
    expect(Array.from(b.readRect(2, 0, 1, 1))).toEqual([0, 0, 0, 255]); // the wall
  });

  it('reports nothing when the colour is already there', () => {
    const b = grid(['##', '##']);
    expect(fillBitmap(b, 0, 0, [0, 0, 0, 255], 0)).toBeNull();
  });

  it('tolerance spreads over near colours', () => {
    const b = rawBitmap(3, 1);
    b.data.set([100, 100, 100, 255, 110, 110, 110, 255, 200, 200, 200, 255]);
    expect(floodRegion(b.data, 3, 1, 0, 0, 5).rect.w).toBe(1);
    expect(floodRegion(b.data, 3, 1, 0, 0, 20).rect.w).toBe(2);
  });

  it('ignores a click outside the canvas', () => {
    const b = rawBitmap(2, 2);
    expect(floodRegion(b.data, 2, 2, 5, 0)).toBeNull();
  });
});

describe('rectangles and colours', () => {
  it('clamps and unions', () => {
    expect(clampRect({ x: -3.5, y: 2.2, w: 10, h: 10 }, 5, 5)).toEqual({ x: 0, y: 2, w: 5, h: 3 });
    expect(clampRect({ x: 9, y: 9, w: 2, h: 2 }, 5, 5)).toBeNull();
    expect(unionRect({ x: 0, y: 0, w: 2, h: 2 }, { x: 5, y: 5, w: 1, h: 1 })).toEqual({ x: 0, y: 0, w: 6, h: 6 });
  });
  it('converts hex both ways', () => {
    expect(hexToRgba('#ff8000', 0.5)).toEqual([255, 128, 0, 128]);
    expect(rgbaToHex(255, 128, 0)).toBe('#ff8000');
  });
});

describe('view maths', () => {
  it('zooming about a point keeps that point still', () => {
    const v = { zoom: 1, x: 10, y: 20 };
    const before = screenToDoc(v, 300, 200);
    const z = zoomAbout(v, 2, 300, 200);
    const after = screenToDoc(z, 300, 200);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(z.zoom).toBe(2);
  });
  it('clamps zoom', () => {
    expect(zoomAbout({ zoom: 30, x: 0, y: 0 }, 10, 0, 0).zoom).toBe(32);
  });
  it('fits and centres', () => {
    const v = fitView(1000, 600, 500, 500, 0);
    expect(v.zoom).toBeCloseTo(1.2);
    expect(v.x).toBeCloseTo(200);
  });
  it('onion skin: nearest frames strongest, edges respected', () => {
    const plan = onionPlan(5, 0, 2);
    expect(plan.map(o => o.index)).toEqual([1, 2]);
    expect(plan[0].alpha).toBeGreaterThan(plan[1].alpha);
    expect(onionPlan(5, 2, 1).map(o => [o.index, o.dir])).toEqual([[1, -1], [3, 1]]);
    expect(onionPlan(5, 2, 0)).toEqual([]);
    expect(onionPlan(5, 2, 9)).toHaveLength(4);
  });
});
