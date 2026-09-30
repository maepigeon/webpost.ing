/**
 * A flash of brightness on every button press — dark, then bright, then back —
 * layered on top of each button's own press and spring effects.
 *
 * One delegated listener rather than a class on every button, so buttons added
 * later get it too. Runs on pointerdown so it lands with the press itself.
 */
const SELECTOR = 'button, .navButton, [role="button"], input[type="submit"], input[type="button"]';

export function installClickFlash() {
  if (typeof window === 'undefined' || window.__clickFlashInstalled) return;
  window.__clickFlashInstalled = true;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest?.(SELECTOR);
    if (!el || el.disabled) return;
    el.classList.remove('click-flash');
    // Restart the animation even on a rapid second press.
    void el.offsetWidth;
    el.classList.add('click-flash');
    el.addEventListener('animationend', function done(ev) {
      if (ev.animationName !== 'click-flash') return;
      el.classList.remove('click-flash');
      el.removeEventListener('animationend', done);
    });
  }, { passive: true });
}
