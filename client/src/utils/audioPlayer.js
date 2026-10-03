import { IMAGES_BASE_URL } from '../config.js';

/**
 * App-wide audio controller. One <audio> element lives here, outside React, so
 * a track keeps playing while the reader moves between pages, and starting a
 * track replaces whatever was playing.
 */

const EMPTY = { src: '', title: '', postPath: '', playing: false, currentTime: 0, duration: 0, volume: 1 };
const THROTTLE_MS = 250;

let audio = null;
let state = { ...EMPTY };
let makeAudio = () => new Audio();
const listeners = new Set();
let lastTick = 0;

/** Only same-site uploads are playable; anything else is ignored. */
export function isPlayableSrc(src) {
  return typeof src === 'string' && src.startsWith('/uploads/') && !src.includes('..') && !src.includes('//') && !src.includes('\\');
}

function emit() {
  const snapshot = { ...state };
  listeners.forEach(l => { try { l(snapshot); } catch { /* one bad listener must not stop the rest */ } });
}

function readElement() {
  const a = audio;
  state = {
    ...state,
    playing: !a.paused && !a.ended,
    currentTime: Number.isFinite(a.currentTime) ? a.currentTime : 0,
    duration: Number.isFinite(a.duration) ? a.duration : 0,
    volume: a.muted ? 0 : a.volume,
  };
}

function setMediaSession() {
  const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : null;
  if (!ms) return;
  try {
    if (typeof MediaMetadata !== 'undefined') ms.metadata = new MediaMetadata({ title: state.title || 'Audio' });
    ms.setActionHandler('play', () => { if (audio && audio.paused) toggle(); });
    ms.setActionHandler('pause', () => pause());
  } catch { /* partial Media Session support is fine */ }
}

function clearMediaSession() {
  const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : null;
  if (!ms) return;
  try {
    ms.metadata = null;
    ms.setActionHandler('play', null);
    ms.setActionHandler('pause', null);
  } catch { /* ignore */ }
}

function ensureAudio() {
  if (audio) return audio;
  audio = makeAudio();
  audio.preload = 'metadata';
  const sync = () => { readElement(); emit(); };
  ['play', 'pause', 'ended', 'volumechange', 'loadedmetadata', 'durationchange'].forEach(ev => audio.addEventListener(ev, sync));
  audio.addEventListener('timeupdate', () => {
    // timeupdate can fire far more often than a progress bar needs.
    const now = Date.now();
    if (now - lastTick < THROTTLE_MS) return;
    lastTick = now;
    sync();
  });
  audio.addEventListener('error', () => {
    state = { ...state, playing: false };
    emit();
  });
  return audio;
}

export function play({ src, title = '', postPath = '' } = {}) {
  if (!isPlayableSrc(src)) return;
  const a = ensureAudio();
  if (state.src !== src) {
    state = { ...EMPTY, src, title, postPath, volume: state.volume };
    a.src = IMAGES_BASE_URL + src;
    a.currentTime = 0;
  } else {
    state = { ...state, title: title || state.title, postPath: postPath || state.postPath };
  }
  setMediaSession();
  emit();
  const p = a.play();
  // A refused play (autoplay policy, bad file) must not leave "playing" on.
  if (p && typeof p.catch === 'function') p.catch(() => { readElement(); emit(); });
}

export function toggle() {
  if (!audio || !state.src) return;
  if (audio.paused) {
    const p = audio.play();
    if (p && typeof p.catch === 'function') p.catch(() => { readElement(); emit(); });
  } else {
    audio.pause();
  }
}

export function pause() {
  if (audio && state.src) audio.pause();
}

/** Pause, rewind and forget the track, so the mini player disappears. */
export function stop() {
  if (!audio) return;
  audio.pause();
  audio.removeAttribute('src');
  if (typeof audio.load === 'function') audio.load();
  state = { ...EMPTY, volume: state.volume };
  clearMediaSession();
  emit();
}

export function seek(seconds) {
  if (!audio || !state.src || !Number.isFinite(seconds)) return;
  const max = state.duration || Infinity;
  audio.currentTime = Math.min(Math.max(0, seconds), max);
  readElement();
  emit();
}

export function setVolume(v) {
  if (!Number.isFinite(v)) return;
  const level = Math.min(1, Math.max(0, v));
  const a = ensureAudio();
  a.volume = level;
  // Dragging up from silence should be heard.
  a.muted = level === 0;
  state = { ...state, volume: level };
  emit();
}

export function getState() {
  return { ...state };
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test hook: swap the element factory and reset all module state. */
export function __resetForTests(factory) {
  audio = null;
  state = { ...EMPTY };
  lastTick = 0;
  listeners.clear();
  makeAudio = factory || (() => new Audio());
}

/** 83 seconds reads "1:23"; anything unknown reads "0:00". */
export function formatClock(seconds) {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
