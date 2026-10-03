// "Add to home screen" support. Chromium fires beforeinstallprompt once; we
// keep it so a button anywhere can trigger the install later.
let deferred = null;
let installed = false;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // suppress the browser's own mini-bar; we show our button
    deferred = e;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    emit();
  });
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const canInstall = () => deferred !== null;

export function isStandalone() {
  if (installed) return true;
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  return Boolean(mq || window.navigator.standalone); // standalone is iOS-only
}

export function isIos() {
  const ua = navigator.userAgent || '';
  // iPadOS 13+ reports itself as a Mac; touch points give it away.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

// The saved event can only be used once; returns true if the user accepted.
export async function promptInstall() {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  emit();
  e.prompt();
  const { outcome } = await e.userChoice;
  return outcome === 'accepted';
}
