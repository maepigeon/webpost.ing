import { makeCanvas } from './bitmap.js';
import { celKey } from './project.js';

/**
 * Drawing a frame: layers bottom to top with opacity, onion skin, a checkerboard
 * behind transparency, and the view (zoom and pan) maths.
 *
 * View: { zoom, x, y }. A document point (dx, dy) sits at screen (x + dx*zoom, y + dy*zoom)
 * in CSS pixels; the stage canvas is scaled by devicePixelRatio on top of that.
 */
export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 32;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const clampZoom = (z) => clamp(z, ZOOM_MIN, ZOOM_MAX);

/** Zoom by `factor` keeping the document point under (ax, ay) where it is. */
export function zoomAbout(view, factor, ax, ay) {
  const zoom = clampZoom(view.zoom * factor);
  const k = zoom / view.zoom;
  return { zoom, x: ax - (ax - view.x) * k, y: ay - (ay - view.y) * k };
}

export const panBy = (view, dx, dy) => ({ ...view, x: view.x + dx, y: view.y + dy });
export const screenToDoc = (view, sx, sy) => ({ x: (sx - view.x) / view.zoom, y: (sy - view.y) / view.zoom });
export const docToScreen = (view, dx, dy) => ({ x: view.x + dx * view.zoom, y: view.y + dy * view.zoom });

/** A view that shows the whole document centred, with a margin (never zoomed past 1:1... unless small). */
export function fitView(stageW, stageH, docW, docH, margin = 24) {
  const zoom = clampZoom(Math.min((stageW - margin * 2) / docW, (stageH - margin * 2) / docH));
  return { zoom, x: (stageW - docW * zoom) / 2, y: (stageH - docH * zoom) / 2 };
}

/**
 * Which frames to show as onion skin: up to `count` before and after the
 * current one, fading with distance. Returns [{ index, dir: -1|1, alpha }].
 */
export function onionPlan(frameCount, current, count, maxAlpha = 0.45) {
  const out = [];
  const n = clamp(Math.round(count), 0, 3);
  for (let i = 1; i <= n; i++) {
    const alpha = maxAlpha / i;
    if (current - i >= 0) out.push({ index: current - i, dir: -1, alpha });
    if (current + i < frameCount) out.push({ index: current + i, dir: 1, alpha });
  }
  return out;
}

/** A string that changes when anything that affects how a frame looks changes (for thumbnail and onion caches). */
export function frameSignature(project, frame) {
  return project.layers.map(l => {
    const c = project.cels.get(celKey(frame.id, l.id));
    return `${l.id}${l.visible ? '' : 'h'}${l.opacity}:${c ? c.rev : 0}`;
  }).join('|') + `@${project.width}x${project.height}`;
}

const scratch = new Map();
function scratchCanvas(name, w, h) {
  let c = scratch.get(name);
  if (!c || c.width !== w || c.height !== h) { c = makeCanvas(w, h); scratch.set(name, c); }
  return c;
}

/**
 * Draw one frame's layers onto a 2D context in document coordinates (0,0 to width,height).
 * `overlay` = { frameId, layerId, buffer, opacity, erase } shows a stroke in progress on its layer.
 */
export function drawFrameLayers(ctx, project, frame, overlay = null) {
  for (const layer of project.layers) {
    if (!layer.visible || layer.opacity <= 0) continue;
    const cel = project.cels.get(celKey(frame.id, layer.id));
    const live = overlay && overlay.frameId === frame.id && overlay.layerId === layer.id;
    if (!cel && !live) continue;
    ctx.globalAlpha = layer.opacity;
    if (live) {
      const s = scratchCanvas('layer', project.width, project.height);
      const g = s.getContext('2d');
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      g.clearRect(0, 0, s.width, s.height);
      if (cel) g.drawImage(cel.canvas, 0, 0);
      g.globalAlpha = overlay.opacity;
      g.globalCompositeOperation = overlay.erase ? 'destination-out' : 'source-over';
      g.drawImage(overlay.buffer.canvas, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      ctx.drawImage(s, 0, 0);
    } else {
      ctx.drawImage(cel.canvas, 0, 0);
    }
  }
  ctx.globalAlpha = 1;
}

/** Render a frame scaled into a whole canvas (thumbnails, export, PNG). `background` is a colour or null for transparent. */
export function renderFrameTo(canvas, project, frameIndex, { background = null } = {}) {
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  const frame = project.frames[frameIndex];
  if (!frame) return;
  ctx.setTransform(canvas.width / project.width, 0, 0, canvas.height / project.height, 0, 0);
  ctx.imageSmoothingEnabled = canvas.width < project.width;   // smooth when shrinking (thumbnails)
  ctx.imageSmoothingQuality = 'high';
  drawFrameLayers(ctx, project, frame);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

const onionCache = new Map();
function onionImage(project, frameIndex, dir) {
  const frame = project.frames[frameIndex];
  const key = `${frame.id}|${dir}|${frameSignature(project, frame)}`;
  let c = onionCache.get(key);
  if (c) return c;
  c = makeCanvas(project.width, project.height);
  const g = c.getContext('2d');
  drawFrameLayers(g, project, frame);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = dir < 0 ? '#e0483c' : '#2f8fe0';   // before is red, after is blue
  g.globalAlpha = 0.8;
  g.fillRect(0, 0, c.width, c.height);
  if (onionCache.size >= 8) onionCache.delete(onionCache.keys().next().value);
  onionCache.set(key, c);
  return c;
}

let checkerTile = null;
function checkerPattern(ctx) {
  if (!checkerTile) {
    checkerTile = makeCanvas(32, 32);
    const g = checkerTile.getContext('2d');
    g.fillStyle = '#c9c9c9'; g.fillRect(0, 0, 32, 32);
    g.fillStyle = '#e6e6e6'; g.fillRect(0, 0, 16, 16); g.fillRect(16, 16, 16, 16);
  }
  return ctx.createPattern(checkerTile, 'repeat');
}

/**
 * Draw the stage: dark surround, the document on a checkerboard, onion skin,
 * the frame. `size` is the stage in CSS pixels; the canvas is sized to
 * size * dpr by the caller.
 * opts: { onion: 0..3, overlay, dpr, showOnion }
 */
export function renderStage(canvas, project, frameIndex, view, { onion = 0, overlay = null, dpr = 1 } = {}) {
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#141414';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const frame = project.frames[frameIndex];
  if (!frame) return;
  const sx = view.x * dpr, sy = view.y * dpr;
  const w = project.width * view.zoom * dpr, h = project.height * view.zoom * dpr;

  // Page and checkerboard (the pattern stays screen-sized so it does not blur when zoomed).
  ctx.save();
  ctx.beginPath();
  ctx.rect(sx, sy, w, h);
  ctx.clip();
  ctx.fillStyle = checkerPattern(ctx);
  ctx.setTransform(dpr * 0.5, 0, 0, dpr * 0.5, 0, 0);
  ctx.fillRect(0, 0, canvas.width / (dpr * 0.5), canvas.height / (dpr * 0.5));
  ctx.restore();

  ctx.save();
  ctx.setTransform(view.zoom * dpr, 0, 0, view.zoom * dpr, sx, sy);
  ctx.imageSmoothingEnabled = view.zoom < 2;   // crisp pixels when zoomed in
  ctx.beginPath();
  ctx.rect(0, 0, project.width, project.height);
  ctx.clip();
  for (const o of onionPlan(project.frames.length, frameIndex, onion)) {
    ctx.globalAlpha = o.alpha;
    ctx.drawImage(onionImage(project, o.index, o.dir), 0, 0);
  }
  ctx.globalAlpha = 1;
  drawFrameLayers(ctx, project, frame, overlay);
  ctx.restore();

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(sx) - 0.5, Math.round(sy) - 0.5, Math.round(w) + 1, Math.round(h) + 1);
}

/** Read the colour of a composited frame at a document point, as { hex-ready r,g,b,a } or null. */
export function sampleFrame(project, frameIndex, x, y) {
  const frame = project.frames[frameIndex];
  const px = Math.floor(x), py = Math.floor(y);
  if (!frame || px < 0 || py < 0 || px >= project.width || py >= project.height) return null;
  const c = scratchCanvas('sample', 1, 1);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.setTransform(1, 0, 0, 1, -px, -py);
  g.clearRect(px, py, 1, 1);
  drawFrameLayers(g, project, frame);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const d = g.getImageData(0, 0, 1, 1).data;
  return d[3] === 0 ? null : { r: d[0], g: d[1], b: d[2], a: d[3] };
}
