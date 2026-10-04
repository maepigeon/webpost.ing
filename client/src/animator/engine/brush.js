import { clampRect, unionRect, makeCanvas } from './bitmap.js';

/**
 * Painting. The maths (spacing, pressure, smoothing, flood fill) is plain and
 * tested; Stroke is the part that draws on a canvas.
 *
 * A stroke is drawn into a separate buffer at full strength and joined to the
 * cel when the pen lifts, so a stroke has one even opacity however slowly it
 * was drawn and however much it overlaps itself. Until it lifts, the cel is
 * untouched (which is also how the undo patch gets its "before").
 */

export const TOOLS = ['brush', 'pixel', 'eraser'];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;

/** Distance between stamps for a brush of this diameter. */
export const SPACING_RATIO = 0.12;
export function spacingFor(diameter, ratio = SPACING_RATIO) {
  return Math.max(0.75, diameter * ratio);
}

/**
 * Pressure to size multiplier. A mouse (or a pen reporting nothing) has no
 * pressure, so it draws at full size; a pen goes from `min` to 1.
 */
export function pressureScale(pressure, { pen = false, min = 0.2 } = {}) {
  if (!pen) return 1;
  return lerp(min, 1, clamp(pressure, 0, 1));
}

/** Pressure to a stamp's opacity (0.15..1 for a pen, 1 otherwise). */
export function pressureOpacity(pressure, { pen = false } = {}) {
  if (!pen) return 1;
  return lerp(0.15, 1, clamp(pressure, 0, 1));
}

/**
 * Stamps overlap about 1/ratio times, so an opacity meant for the whole
 * stroke is split across the stamps: n stamps of `a` give 1-(1-a)^n.
 */
export function stampAlpha(opacity, ratio = SPACING_RATIO) {
  const a = clamp(opacity, 0, 1);
  if (a >= 1) return 1;
  return 1 - Math.pow(1 - a, ratio);
}

/** The pressure to use for a pointer event: a real reading for a pen, else 0.5. */
export function readPressure(e) {
  const pen = e.pointerType === 'pen';
  const p = Number.isFinite(e.pressure) && e.pressure > 0 ? e.pressure : 0.5;
  return { pressure: pen ? p : 0.5, pen };
}

/**
 * Place stamps along one straight segment. `state.carry` is how far into the
 * next gap the previous segment ended, so spacing stays even across segments.
 * Pressure is interpolated along the way. Returns the stamps appended to `out`.
 */
export function walkSegment(state, a, b, spacingOf, out = []) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) {
    if (!state.started) { state.started = true; out.push({ x: a.x, y: a.y, p: a.p }); state.carry = spacingOf(a.p); }
    return out;
  }
  let pos = state.started ? state.carry : 0;
  state.started = true;
  while (pos <= dist) {
    const t = pos / dist;
    const p = lerp(a.p, b.p, t);
    out.push({ x: a.x + dx * t, y: a.y + dy * t, p });
    pos += spacingOf(p);
  }
  state.carry = pos - dist;
  return out;
}

/**
 * Turns raw pointer samples into stamps: the samples are eased a little
 * (`smoothing` 0 = exact, up to 0.9 = steady), joined by curves through the
 * midpoints between samples so fast strokes are not polygons, and stamped at
 * even spacing. add() returns the new stamps; end() the last ones.
 */
export class StrokeBuilder {
  constructor({ spacingOf = (p) => spacingFor(10 * p), smoothing = 0.35 } = {}) {
    this.spacingOf = spacingOf;
    this.smoothing = clamp(smoothing, 0, 0.9);
    this.walk = { started: false, carry: 0 };
    this.eased = null;     // eased sample
    this.mid = null;       // where the last curve ended
    this.ctrl = null;      // last sample, the next curve's control point
    this.raw = null;
  }

  add(x, y, p = 0.5) {
    const out = [];
    this.raw = { x, y, p };
    if (!this.eased) {
      this.eased = { x, y, p };
      this.mid = { x, y, p };
      this.ctrl = { x, y, p };
      return walkSegment(this.walk, this.mid, this.mid, this.spacingOf, out);
    }
    const k = 1 - this.smoothing;
    const e = this.eased;
    e.x += (x - e.x) * k; e.y += (y - e.y) * k; e.p += (p - e.p) * k;
    const next = { x: e.x, y: e.y, p: e.p };
    const end = { x: (this.ctrl.x + next.x) / 2, y: (this.ctrl.y + next.y) / 2, p: (this.ctrl.p + next.p) / 2 };
    this.curve(this.mid, this.ctrl, end, out);
    this.mid = end;
    this.ctrl = next;
    return out;
  }

  /** Finish: run on to the last raw sample (so the stroke ends where the pen did). */
  end() {
    const out = [];
    if (!this.raw || !this.mid) return out;
    const last = this.raw;
    this.curve(this.mid, this.ctrl, { x: last.x, y: last.y, p: last.p }, out);
    return out;
  }

  curve(a, c, b, out) {
    const len = Math.hypot(c.x - a.x, c.y - a.y) + Math.hypot(b.x - c.x, b.y - c.y);
    const steps = Math.max(1, Math.min(64, Math.ceil(len / 3)));
    let prev = a;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, u = 1 - t;
      const pt = {
        x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
        y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
        p: lerp(a.p, b.p, t),
      };
      walkSegment(this.walk, prev, pt, this.spacingOf, out);
      prev = pt;
    }
  }
}

/* ---- the stamp image (round brush) ---- */

const stampCache = new Map();
function roundStamp(diameter, hardness, colour) {
  const d = Math.max(1, Math.round(diameter));
  const key = `${d}|${Math.round(hardness * 20)}|${colour}`;
  let s = stampCache.get(key);
  if (s) return s;
  const size = d + 2;
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const r = d / 2, mid = size / 2;
  const grad = g.createRadialGradient(mid, mid, 0, mid, mid, r);
  const inner = clamp(hardness, 0, 0.99);
  grad.addColorStop(0, colour);
  grad.addColorStop(inner, colour);
  const [rr, gg, bb] = [1, 3, 5].map(i => parseInt(colour.slice(i, i + 2), 16));
  grad.addColorStop(1, `rgba(${rr},${gg},${bb},0)`);
  g.fillStyle = grad;
  g.beginPath();
  g.arc(mid, mid, r, 0, Math.PI * 2);
  g.fill();
  if (stampCache.size > 80) stampCache.delete(stampCache.keys().next().value);
  stampCache.set(key, c);
  return c;
}

/**
 * One stroke on one cel.
 *   tool: { kind: 'brush'|'pixel'|'eraser', size, opacity (0..1), hardness (0..1), colour '#rrggbb',
 *           pressureSize, pressureOpacity, smoothing }
 *   bitmap  the cel (canvas bitmap)    buffer  a canvas bitmap of the same size, empty
 */
export class Stroke {
  constructor({ bitmap, buffer, tool }) {
    this.bitmap = bitmap;
    this.buffer = buffer;
    this.tool = tool;
    this.pixel = tool.kind === 'pixel';
    this.erase = tool.kind === 'eraser';
    this.dirty = null;
    this.pen = false;
    this.builder = new StrokeBuilder({
      spacingOf: (p) => spacingFor(this.diameterAt(p), this.pixel ? 0.5 : SPACING_RATIO),
      smoothing: this.pixel ? 0 : (tool.smoothing ?? 0.35),
    });
  }

  diameterAt(p) {
    const s = this.pixel ? this.tool.size : this.tool.size * (this.tool.pressureSize === false ? 1 : pressureScale(p, { pen: this.pen }));
    return Math.max(1, s);
  }

  /** Feed one pointer sample (document coordinates). */
  add(x, y, pressure = 0.5, pen = false) {
    this.pen = pen;
    this.draw(this.builder.add(x, y, pressure));
  }

  finishInput() { this.draw(this.builder.end()); }

  draw(stamps) {
    if (!stamps.length) return;
    const g = this.buffer.ctx;
    const { tool } = this;
    const colour = this.erase ? '#000000' : tool.colour;
    let box = null;
    for (const s of stamps) {
      const d = this.diameterAt(s.p);
      if (this.pixel) {
        const n = Math.max(1, Math.round(d));
        const x = Math.round(s.x - n / 2), y = Math.round(s.y - n / 2);
        g.fillStyle = colour;
        g.globalAlpha = 1;
        g.fillRect(x, y, n, n);
        box = unionRect(box, { x, y, w: n, h: n });
      } else {
        const img = roundStamp(d, tool.hardness ?? 0.8, colour);
        g.globalAlpha = tool.pressureOpacity === false ? 1 : pressureOpacity(s.p, { pen: this.pen });
        g.drawImage(img, s.x - img.width / 2, s.y - img.height / 2);
        box = unionRect(box, { x: s.x - img.width / 2, y: s.y - img.height / 2, w: img.width, h: img.height });
      }
    }
    g.globalAlpha = 1;
    const clipped = box && clampRect(box, this.buffer.width, this.buffer.height);
    this.dirty = unionRect(this.dirty, clipped);
  }

  /** What to show on top of the cel while the stroke is in progress. */
  overlay() {
    return { buffer: this.buffer, opacity: this.tool.opacity, erase: this.erase, pixel: this.pixel };
  }

  /** Join the stroke to the cel. Returns { rect, before, after } for history, or null if nothing was drawn. */
  finish() {
    this.finishInput();
    const rect = this.dirty && clampRect(this.dirty, this.bitmap.width, this.bitmap.height);
    if (!rect) { this.cancel(); return null; }
    const before = this.bitmap.readRect(rect.x, rect.y, rect.w, rect.h);
    this.bitmap.drawFrom(this.buffer, rect, { opacity: this.tool.opacity, erase: this.erase });
    const after = this.bitmap.readRect(rect.x, rect.y, rect.w, rect.h);
    this.cancel();
    return { rect, before, after };
  }

  /** Throw the stroke away (the cel was never touched). */
  cancel() {
    if (this.dirty) {
      const { x, y, w, h } = this.dirty;
      this.buffer.ctx.clearRect(x, y, w, h);
    }
    this.dirty = null;
  }
}

/* ---- bucket fill ---- */

/**
 * Find the pixels a fill from (sx, sy) would cover: those connected to the
 * start whose colour is within `tolerance` (0..255, per channel) of it.
 * `data` is the whole cel as RGBA. Returns { rect, mask } or null; nothing is changed.
 * Fully transparent pixels count as one colour whatever their hidden RGB.
 */
export function floodRegion(data, w, h, sx, sy, tolerance = 32) {
  sx = Math.floor(sx); sy = Math.floor(sy);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null;
  const s = (sy * w + sx) * 4;
  const tr = data[s], tg = data[s + 1], tb = data[s + 2], ta = data[s + 3];
  const mask = new Uint8Array(w * h);
  const matches = (x, y) => {
    const p = y * w + x;
    if (mask[p]) return false;
    const i = p * 4;
    const a = data[i + 3];
    if (ta === 0 || a === 0) return ta === a;
    return Math.abs(data[i] - tr) <= tolerance && Math.abs(data[i + 1] - tg) <= tolerance
      && Math.abs(data[i + 2] - tb) <= tolerance && Math.abs(a - ta) <= tolerance;
  };
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  const stack = [sx, sy];
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    if (!matches(x, y)) continue;
    let l = x, r = x;
    while (l > 0 && matches(l - 1, y)) l--;
    while (r < w - 1 && matches(r + 1, y)) r++;
    for (let i = l; i <= r; i++) mask[y * w + i] = 1;
    x0 = Math.min(x0, l); x1 = Math.max(x1, r); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    for (const ny of [y - 1, y + 1]) {
      if (ny < 0 || ny >= h) continue;
      let inSpan = false;
      for (let i = l; i <= r; i++) {
        if (matches(i, ny)) { if (!inSpan) { stack.push(i, ny); inSpan = true; } } else inSpan = false;
      }
    }
  }
  if (x1 < 0) return null;
  return { rect: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, mask };
}

/** Paint a flood region into `data` (whole cel RGBA) with rgba. */
export function paintRegion(data, w, { rect, mask }, rgba) {
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      if (!mask[y * w + x]) continue;
      const i = (y * w + x) * 4;
      data[i] = rgba[0]; data[i + 1] = rgba[1]; data[i + 2] = rgba[2]; data[i + 3] = rgba[3];
    }
  }
}

/**
 * Fill on a bitmap. Returns { rect, before, after } for history (and writes the
 * result), or null when nothing would change.
 */
export function fillBitmap(bitmap, x, y, rgba, tolerance = 32) {
  const { width: w, height: h } = bitmap;
  const data = bitmap.readRect(0, 0, w, h);
  const region = floodRegion(data, w, h, x, y, tolerance);
  if (!region) return null;
  const { rect } = region;
  const extract = (src) => {
    const out = new Uint8ClampedArray(rect.w * rect.h * 4);
    for (let row = 0; row < rect.h; row++) {
      const from = ((rect.y + row) * w + rect.x) * 4;
      out.set(src.subarray(from, from + rect.w * 4), row * rect.w * 4);
    }
    return out;
  };
  const before = extract(data);
  paintRegion(data, w, region, rgba);
  const after = extract(data);
  if (before.every((v, i) => v === after[i])) return null;
  bitmap.writeRect(rect.x, rect.y, rect.w, rect.h, after);
  return { rect, before, after };
}
