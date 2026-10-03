/**
 * Rules for a button block's fields. These mirror PostContentValidator.java
 * (cleanButtonNode), so the editor refuses what the server would refuse.
 */

export const BUTTON_LABEL_MAX = 60;
export const BUTTON_ACTIONS = ['link', 'post', 'audio'];
export const BUTTON_STYLES = ['solid', 'outline', 'pixel'];
export const BUTTON_ALIGNS = ['left', 'center', 'right'];

const MAX_URL = 8000;
const UPLOAD = /^\/uploads\/[A-Za-z0-9._/-]{1,200}$/;

/** A path on this site: one leading slash, not "//" or "/\" (those leave the site), no spaces. */
export function isSitePath(s) {
  if (typeof s !== 'string' || s.length < 2 || s.length > MAX_URL || s[0] !== '/') return false;
  if (s[1] === '/' || s[1] === '\\') return false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x20 || c === 0x7f) return false;
  }
  return true;
}

export function isWebUrl(s) {
  if (typeof s !== 'string' || s.length > MAX_URL || !/^https?:\/\/\S+$/i.test(s)) return false;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) <= 0x20 || s.charCodeAt(i) === 0x7f) return false;
  return true;
}

export function isUploadPath(s) {
  return typeof s === 'string' && UPLOAD.test(s) && !s.includes('..') && !s.includes('//');
}

/** '' when the target is fine for the action, otherwise a short plain message. */
export function validateTarget(action, target) {
  const t = typeof target === 'string' ? target.trim() : '';
  switch (action) {
    case 'link':
      return isWebUrl(t) || isSitePath(t) ? '' : 'Use a web address starting with http:// or https://, or a path like /name/post.';
    case 'post':
      return isSitePath(t) ? '' : 'Choose one of your posts, or type a path like /name/post.';
    case 'audio':
      return isUploadPath(t) ? '' : 'Upload an audio file for this button to play.';
    default:
      return 'Choose what the button does.';
  }
}

/** Fills in defaults and drops anything unknown; the target is kept as given (see validateTarget). */
export function normaliseButton(data = {}) {
  const pick = (v, set, fallback) => (set.includes(v) ? v : fallback);
  const label = typeof data.label === 'string'
    ? data.label.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, BUTTON_LABEL_MAX) : '';
  return {
    label,
    action: pick(data.action, BUTTON_ACTIONS, 'link'),
    target: typeof data.target === 'string' ? data.target : '',
    style: pick(data.style, BUTTON_STYLES, 'solid'),
    align: pick(data.align, BUTTON_ALIGNS, 'left'),
  };
}
