/**
 * Playback. Pure timing helpers plus a small player that steps frames with a
 * time accumulator, so a slow tick catches up instead of drifting, and a
 * frame's `hold` (how many frame-times it stays) is honoured.
 */
export const frameDurationMs = (frame, fps) => ((frame.hold || 1) * 1000) / fps;

export function totalDurationMs(frames, fps) {
  return frames.reduce((sum, f) => sum + frameDurationMs(f, fps), 0);
}

/** Which frame is showing `ms` into the animation (looping, or stopping on the last). */
export function frameAtTime(frames, fps, ms, loop = true) {
  const total = totalDurationMs(frames, fps);
  if (!frames.length || total <= 0) return 0;
  let t = loop ? ((ms % total) + total) % total : Math.min(Math.max(ms, 0), total - 1e-6);
  for (let i = 0; i < frames.length; i++) {
    const d = frameDurationMs(frames[i], fps);
    if (t < d) return i;
    t -= d;
  }
  return frames.length - 1;
}

/**
 * createPlayback({ getFrames, getFps, onFrame(index), onStop(), raf, caf, now })
 * raf/caf/now are injectable for tests. Frames and fps are read on every tick,
 * so editing during playback is fine.
 */
export function createPlayback({
  getFrames, getFps, onFrame, onStop = () => {},
  raf = (fn) => requestAnimationFrame(fn),
  caf = (id) => cancelAnimationFrame(id),
  now = () => performance.now(),
}) {
  let handle = null;
  let index = 0;
  let last = 0;
  let acc = 0;
  let loop = true;

  const stop = () => {
    if (handle === null) return;
    caf(handle);
    handle = null;
    onStop();
  };

  const tick = (t) => {
    handle = null;
    const frames = getFrames();
    const fps = getFps();
    if (!frames.length) { onStop(); return; }
    acc += Math.min(Math.max(t - last, 0), 250);   // a long pause (hidden tab) does not skip ahead
    last = t;
    let moved = false;
    let ended = false;
    for (;;) {
      const cur = frames[Math.min(index, frames.length - 1)];
      const d = frameDurationMs(cur, fps);
      if (acc < d) break;
      acc -= d;
      if (index + 1 >= frames.length) {
        if (loop) { index = 0; moved = true; } else { ended = true; acc = 0; break; }
      } else { index++; moved = true; }
    }
    if (moved) onFrame(index);
    if (ended) { onStop(); return; }
    handle = raf(tick);
  };

  return {
    play(from = 0) {
      if (handle !== null) { caf(handle); handle = null; }
      index = Math.max(0, from);
      acc = 0;
      last = now();
      handle = raf(tick);
    },
    pause: stop,
    toggle(from) { if (handle === null) this.play(from); else stop(); },
    isPlaying: () => handle !== null,
    setLoop(v) { loop = Boolean(v); },
    get loop() { return loop; },
  };
}
