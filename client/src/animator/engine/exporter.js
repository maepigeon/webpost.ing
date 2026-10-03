import { makeCanvas } from './bitmap.js';
import { renderFrameTo } from './compositor.js';
import { frameDurationMs } from './playback.js';
import { buildZip } from './zip.js';
import { toMeta } from './project.js';

/**
 * Getting work out of the app.
 *   WebM (or MP4 where the browser's recorder makes it): MediaRecorder on a canvas stream.
 *     The recorder runs in real time, so a 6 second animation takes 6 seconds to export.
 *   PNG of one frame; a zip of the project (json + one PNG per cel), written without a library.
 *   MP4 through WebCodecs: not built yet (see exportMp4WebCodecs).
 */

/** What to draw and for how long: [{ index, durationMs }] and the total. Holds are honoured. */
export function exportPlan(frames, fps) {
  const items = frames.map((f, index) => ({ index, durationMs: Math.round(frameDurationMs(f, fps)) }));
  return { items, totalMs: items.reduce((n, i) => n + i.durationMs, 0) };
}

/** When each item should end, in ms from the start, rounded once overall so rounding does not pile up. */
export function planEnds(frames, fps) {
  let t = 0;
  return frames.map(f => Math.round((t += frameDurationMs(f, fps))));
}

export function fileSafe(name, fallback = 'animation') {
  const s = String(name || '').trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return s || fallback;
}

export function extensionForMime(mime) {
  return /mp4/i.test(mime) ? 'mp4' : 'webm';
}

const RECORDER_TYPES = [
  'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4;codecs=avc1', 'video/mp4',
];

/** The best container/codec this browser's MediaRecorder can write, or null. */
export function pickRecorderMime(MR = typeof MediaRecorder !== 'undefined' ? MediaRecorder : null) {
  if (!MR || typeof MR.isTypeSupported !== 'function') return null;
  return RECORDER_TYPES.find(t => MR.isTypeSupported(t)) || null;
}

export function videoSupport() {
  return {
    recorder: pickRecorderMime(),
    // TODO(mp4): WebCodecs VideoEncoder is detected here but the MP4 muxer is not written; see exportMp4WebCodecs.
    webcodecs: typeof VideoEncoder !== 'undefined',
  };
}

/**
 * TODO: MP4 (H.264) through WebCodecs, the path described in guide/animator-design.md section 1.
 * Plan: VideoEncoder({ codec: 'avc1.42001f' }) fed with VideoFrame(canvas, { timestamp, duration }) for each
 * plan item, a small MP4 muxer (fast-start: moov first) for the chunks, return a Blob of 'video/mp4'.
 * Until then it reports that it is missing, and the recorder path above is used.
 */
export async function exportMp4WebCodecs() {
  return { ok: false, error: 'MP4 export is not built yet. Use the video export, or PNG frames.' };
}

const sleep = (ms) => new Promise(r => setTimeout(r, Math.max(0, ms)));

/**
 * Record the animation. Returns { ok, blob, mime, durationMs } or { ok: false, error }.
 * Transparent areas become white (video has no transparency).
 * opts: { onProgress(0..1), signal (AbortSignal), background, now, wait }
 */
export async function recordVideo(project, { onProgress = () => {}, signal, background = '#ffffff', now = () => performance.now(), wait = sleep } = {}) {
  const mime = pickRecorderMime();
  if (!mime || typeof HTMLCanvasElement === 'undefined' || !HTMLCanvasElement.prototype.captureStream) {
    return { ok: false, error: 'This browser cannot record video from a canvas. Try Chrome, Edge, Firefox or Safari 14.1 or later.' };
  }
  // Video encoders want even sizes.
  const w = project.width + (project.width % 2), h = project.height + (project.height % 2);
  const canvas = makeCanvas(w, h);
  const stream = canvas.captureStream(project.fps);
  const track = stream.getVideoTracks()[0];
  const chunks = [];
  let recorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.min(40e6, Math.max(2e6, w * h * project.fps * 0.15)) });
  } catch (e) {
    return { ok: false, error: `Could not start the recorder: ${e.message}` };
  }
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
  const ends = planEnds(project.frames, project.fps);
  const total = ends[ends.length - 1] || 1;
  const draw = (i) => {
    renderFrameTo(canvas, { ...project, width: w, height: h, cels: project.cels }, i, { background });
    if (track && track.requestFrame) track.requestFrame();
  };
  try {
    draw(0);
    recorder.start();
    const t0 = now();
    for (let i = 0; i < project.frames.length; i++) {
      if (signal && signal.aborted) throw new Error('cancelled');
      draw(i);
      await wait(t0 + ends[i] - now());
      onProgress(ends[i] / total);
    }
    // Hold the last picture briefly so the recorder keeps it.
    await wait(40);
    recorder.stop();
    await stopped;
  } catch (e) {
    try { if (recorder.state !== 'inactive') recorder.stop(); } catch { /* already stopped */ }
    return { ok: false, error: e.message === 'cancelled' ? 'Export cancelled.' : `Export failed: ${e.message}` };
  } finally {
    stream.getTracks().forEach(t => t.stop());
  }
  const blob = new Blob(chunks, { type: mime.split(';')[0] });
  if (!blob.size) return { ok: false, error: 'The recording came out empty.' };
  return { ok: true, blob, mime: blob.type, durationMs: total };
}

/** One frame as a PNG (transparent where nothing is drawn). */
export function exportFramePng(project, frameIndex, { background = null } = {}) {
  const canvas = makeCanvas(project.width, project.height);
  renderFrameTo(canvas, project, frameIndex, { background });
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ? { ok: true, blob } : { ok: false, error: 'Could not make the image.' }), 'image/png');
  });
}

/**
 * The project as a zip: project.json (the metadata, plus which file holds which cel)
 * and one PNG per drawn cel under cels/. Returns { ok, blob }.
 */
export async function exportProjectZip(project) {
  try {
    const files = [];
    const index = {};
    for (const [key, bitmap] of project.cels) {
      const blob = await bitmap.toBlob();
      if (!blob) continue;
      const name = `cels/${key.replace(':', '_')}.png`;
      index[key] = name;
      files.push({ name, data: new Uint8Array(await blob.arrayBuffer()) });
    }
    const manifest = { format: 'webposting-animator', ...toMeta(project), cels: index };
    files.unshift({ name: 'project.json', data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) });
    return { ok: true, blob: new Blob([buildZip(files)], { type: 'application/zip' }) };
  } catch (e) {
    return { ok: false, error: `Could not make the zip: ${e.message}` };
  }
}

/** Offer a blob as a download. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
