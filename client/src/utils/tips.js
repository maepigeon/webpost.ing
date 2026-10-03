/**
 * Hover labels for anything with a data-tip.
 *
 * One label for the whole page, placed above the control (below when there is
 * no room) and kept inside the window, so a label near an edge is never cut
 * off. Shown on hover and keyboard focus; on touch, on press, for a moment.
 */
let tip = null;
let shownFor = null;
let hideTimer = null;

function hide() {
  clearTimeout(hideTimer);
  shownFor = null;
  if (tip) tip.classList.remove('is-shown');
}

function show(el, lingerMs = 0) {
  const text = el.getAttribute('data-tip');
  if (!text) return hide();
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'tip-label';
    tip.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tip);
  }
  clearTimeout(hideTimer);
  shownFor = el;
  tip.textContent = text;
  tip.classList.add('is-shown');
  const r = el.getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  const gap = 6, edge = 4;
  const left = Math.max(edge, Math.min(r.left + r.width / 2 - t.width / 2, window.innerWidth - t.width - edge));
  const above = r.top - t.height - gap;
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(above >= edge ? above : r.bottom + gap)}px`;
  if (lingerMs) hideTimer = setTimeout(hide, lingerMs);
}

const tipped = (node) => (node instanceof Element ? node.closest('[data-tip]') : null);

export function installTips() {
  if (typeof document === 'undefined') return;
  // A touch also fires mouse events a moment later; the press already showed
  // the label, so those are ignored.
  let touchedAt = 0;
  const afterTouch = () => Date.now() - touchedAt < 800;
  document.addEventListener('touchstart', e => {
    touchedAt = Date.now();
    const el = tipped(e.target);
    if (el) show(el, 1600); else hide();
  }, { passive: true });
  document.addEventListener('mouseover', e => {
    if (afterTouch()) return;
    const el = tipped(e.target);
    if (el !== shownFor) { if (el) show(el); else hide(); }
  });
  document.addEventListener('focusin', e => {
    const el = tipped(e.target);
    if (el && el.matches(':focus-visible')) show(el);
  });
  document.addEventListener('focusout', () => { if (!afterTouch()) hide(); });
  document.addEventListener('mousedown', () => { if (!afterTouch()) hide(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  window.addEventListener('scroll', hide, true);
}
