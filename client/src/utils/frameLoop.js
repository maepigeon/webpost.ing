/**
 * An animation loop that runs only while there is something to animate and
 * someone to see it. A bare requestAnimationFrame loop runs for as long as its
 * page is open; this one sleeps
 *  - once `step` says the picture has settled, until wake() is called again;
 *  - while the tab is hidden, or `element` is scrolled off screen (it carries
 *    on from where it was when seen again);
 *  - for good while the visitor asks for reduced motion: wake() then answers
 *    false, and `onStill` is called if the setting is turned on part-way, so
 *    the caller can put itself at rest.
 */

export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/**
 * @param {() => boolean} step  draws one frame; true while more frames are needed
 * @param {{ element?: Element|null, onStill?: () => void }} [options]
 * @returns {{ wake: () => boolean, stop: () => void }}
 */
export function createFrameLoop(step, { element = null, onStill } = {}) {
  let frame = 0;          // the requested frame, if one is waiting
  let wanted = false;     // there is movement still to draw
  let onScreen = true;
  let stopped = false;
  const calm = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(REDUCED_MOTION) : null;

  const mayRun = () => wanted && !stopped && onScreen && !calm?.matches && document.visibilityState !== 'hidden';
  const run = () => {
    frame = 0;
    if (!mayRun()) return;
    wanted = step() === true;
    schedule();
  };
  function schedule() { if (!frame && mayRun()) frame = requestAnimationFrame(run); }
  const pause = () => { if (frame) cancelAnimationFrame(frame); frame = 0; };

  const onVisibility = () => { if (document.visibilityState === 'hidden') pause(); else schedule(); };
  const onCalm = () => {
    if (!calm.matches) return;
    pause();
    wanted = false;
    onStill?.();
  };
  document.addEventListener('visibilitychange', onVisibility);
  calm?.addEventListener?.('change', onCalm);

  let observer = null;
  if (element && typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver((entries) => {
      onScreen = entries[entries.length - 1].isIntersecting;
      if (onScreen) schedule(); else pause();
    });
    observer.observe(element);
  }

  return {
    /** Something moved: draw frames until `step` settles. False when nothing will be drawn (reduced motion, or stopped). */
    wake() {
      if (stopped || calm?.matches) return false;
      wanted = true;
      schedule();
      return true;
    },
    /** For unmounting: no frame runs after this. */
    stop() {
      stopped = true;
      pause();
      document.removeEventListener('visibilitychange', onVisibility);
      calm?.removeEventListener?.('change', onCalm);
      observer?.disconnect();
    },
  };
}

/** Whether every value in every field is within `eps` of zero: nothing left to animate. */
export function atRest(fields, eps) {
  for (const field of fields) {
    for (let i = 0; i < field.length; i++) {
      if (field[i] > eps || field[i] < -eps) return false;
    }
  }
  return true;
}
