/**
 * Bitmaps for cels. A bitmap is one layer of one frame: RGBA pixels.
 *
 * Two kinds share one interface, so the document model, history and fill can
 * be tested without a canvas:
 *   rawBitmap     plain Uint8ClampedArray (tests, and anywhere there is no DOM)
 *   canvasBitmap  an HTMLCanvasElement (the app: brush strokes draw on its 2D context)
 *
 * Interface: width, height, rev (bumped on every change), bytes,
 *   readRect(x,y,w,h) -> Uint8ClampedArray copy      writeRect(x,y,w,h,data)
 *   clone()  resized(w,h,offsetX,offsetY)  clear()
 *   drawFrom(src, rect, {opacity, erase})   (composite part of another bitmap on this one)
 */

/** Clip a rectangle to 0..w, 0..h with whole numbers; null when nothing is left. */
export function clampRect(r, w, h) {
  const x0 = Math.max(0, Math.floor(r.x));
  const y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(w, Math.ceil(r.x + r.w));
  const y1 = Math.min(h, Math.ceil(r.y + r.h));
  if (!(x1 > x0 && y1 > y0)) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function unionRect(a, b) {
  if (!a) return b;
  if (!b) return a;
  const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x + a.w, b.x + b.w), y1 = Math.max(a.y + a.h, b.y + b.h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export const rectBytes = (r) => r.w * r.h * 4;

export class RawBitmap {
  constructor(width, height, data) {
    this.kind = 'raw';
    this.width = width;
    this.height = height;
    this.data = data || new Uint8ClampedArray(width * height * 4);
    this.rev = 0;
  }

  get bytes() { return this.width * this.height * 4; }

  readRect(x, y, w, h) {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let row = 0; row < h; row++) {
      const from = ((y + row) * this.width + x) * 4;
      out.set(this.data.subarray(from, from + w * 4), row * w * 4);
    }
    return out;
  }

  writeRect(x, y, w, h, src) {
    for (let row = 0; row < h; row++) {
      this.data.set(src.subarray(row * w * 4, (row + 1) * w * 4), ((y + row) * this.width + x) * 4);
    }
    this.rev++;
  }

  clone() { return new RawBitmap(this.width, this.height, new Uint8ClampedArray(this.data)); }

  resized(w, h, ox = 0, oy = 0) {
    const out = new RawBitmap(w, h);
    for (let y = 0; y < this.height; y++) {
      const ty = y + oy;
      if (ty < 0 || ty >= h) continue;
      for (let x = 0; x < this.width; x++) {
        const tx = x + ox;
        if (tx < 0 || tx >= w) continue;
        const a = (y * this.width + x) * 4, b = (ty * w + tx) * 4;
        out.data[b] = this.data[a]; out.data[b + 1] = this.data[a + 1];
        out.data[b + 2] = this.data[a + 2]; out.data[b + 3] = this.data[a + 3];
      }
    }
    return out;
  }

  clear() { this.data.fill(0); this.rev++; }

  /** Composite a rectangle of another raw bitmap on this one (source-over, or erasing). */
  drawFrom(src, rect, { opacity = 1, erase = false } = {}) {
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        const i = (y * this.width + x) * 4;
        const sa = (src.data[i + 3] / 255) * opacity;
        if (sa <= 0) continue;
        const da = this.data[i + 3] / 255;
        if (erase) { this.data[i + 3] = Math.round(da * (1 - sa) * 255); continue; }
        const oa = sa + da * (1 - sa);
        for (let c = 0; c < 3; c++) {
          this.data[i + c] = Math.round((src.data[i + c] * sa + this.data[i + c] * da * (1 - sa)) / oa);
        }
        this.data[i + 3] = Math.round(oa * 255);
      }
    }
    this.rev++;
  }
}

export const rawBitmap = (w, h, data) => new RawBitmap(w, h, data);

export class CanvasBitmap {
  constructor(width, height, canvas) {
    this.kind = 'canvas';
    this.width = width;
    this.height = height;
    this.canvas = canvas || makeCanvas(width, height);
    this.ctx = this.canvas.getContext('2d');
    this.rev = 0;
  }

  get bytes() { return this.width * this.height * 4; }

  readRect(x, y, w, h) { return this.ctx.getImageData(x, y, w, h).data; }

  writeRect(x, y, w, h, data) {
    this.ctx.putImageData(new ImageData(new Uint8ClampedArray(data), w, h), x, y);
    this.rev++;
  }

  clone() {
    const out = new CanvasBitmap(this.width, this.height);
    out.ctx.drawImage(this.canvas, 0, 0);
    return out;
  }

  resized(w, h, ox = 0, oy = 0) {
    const out = new CanvasBitmap(w, h);
    out.ctx.drawImage(this.canvas, ox, oy);
    return out;
  }

  clear() { this.ctx.clearRect(0, 0, this.width, this.height); this.rev++; }

  drawFrom(src, rect, { opacity = 1, erase = false } = {}) {
    const c = this.ctx;
    c.save();
    c.globalAlpha = opacity;
    c.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    c.drawImage(src.canvas, rect.x, rect.y, rect.w, rect.h, rect.x, rect.y, rect.w, rect.h);
    c.restore();
    this.rev++;
  }

  toBlob(type = 'image/png') {
    return new Promise((resolve) => this.canvas.toBlob(resolve, type));
  }
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export const canvasBitmap = (w, h) => new CanvasBitmap(w, h);

/** Decode a PNG blob into a canvas bitmap of the stated size. */
export async function canvasBitmapFromBlob(blob, w, h) {
  const bmp = await createImageBitmap(blob);
  const out = new CanvasBitmap(w, h);
  out.ctx.drawImage(bmp, 0, 0);
  if (bmp.close) bmp.close();
  return out;
}

export function hexToRgba(hex, alpha = 1) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  const n = m ? parseInt(m[1], 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, Math.round(Math.max(0, Math.min(1, alpha)) * 255)];
}

export function rgbaToHex(r, g, b) {
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}
