import { useCallback, useEffect, useRef, useState } from 'react';
import { saveDraft, loadDraft, clearDraft } from './autosave.js';

/**
 * Keeps `data` as a local draft under `key` ("{kind}:{id}"), a moment after
 * the last change. Writes at once when the tab is hidden or closed, skips
 * writes when nothing changed, and never touches the server.
 *
 * `data` may be a function, called only when a write happens: for big data
 * (a post's editor state) that avoids serialising on every keystroke. Then
 * changes are announced with the returned `touch()`.
 *
 * Data that is null or undefined means "nothing to keep" and removes the draft.
 *
 * Returns { savedAt, restore, clear, touch, flush }. `flush()` writes now and
 * says whether the work is safe on the device (true also when nothing is
 * pending).
 */
export function useAutosave(key, data, { delay = 1500, enabled = true } = {}) {
  const [savedAt, setSavedAt] = useState(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const keyRef = useRef(key);
  keyRef.current = key;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const last = useRef(null);       // what was last written (or the starting point)
  const pending = useRef(false);
  const timer = useRef(null);
  const lazy = typeof data === 'function';

  const write = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
    if (!pending.current) return true;
    pending.current = false;
    if (!enabledRef.current || !keyRef.current) return true;
    const d = typeof dataRef.current === 'function' ? dataRef.current() : dataRef.current;
    // Nothing to keep (empty text, no changes from the saved version): drop any older draft.
    if (d === undefined || d === null) {
      clearDraft(keyRef.current);
      last.current = 'null';
      return true;
    }
    let json;
    try { json = JSON.stringify(d); } catch { pending.current = true; return false; }
    if (json === last.current) return true;
    const r = saveDraft(keyRef.current, d, json);
    if (r.ok) {
      last.current = json;
      setSavedAt(r.savedAt);
      return true;
    }
    pending.current = true;   // still not safe: a later flush tries again
    return false;
  }, []);

  const touch = useCallback(() => {
    if (!enabledRef.current) return;
    pending.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(write, delay);
  }, [write, delay]);

  // Plain data: the first value is the starting point; later differences are changes.
  const serialised = lazy ? null : safeJson(data);
  useEffect(() => {
    if (lazy) return;
    if (last.current === null) { last.current = serialised; return; }
    if (serialised !== last.current) touch();
  }, [serialised, lazy, touch]);

  // Hidden or closing tabs may never get another timer tick.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') write(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', write);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', write);
      write();   // leaving the page inside the app
    };
  }, [write]);

  const restore = useCallback(() => loadDraft(keyRef.current), []);
  const clear = useCallback(() => {
    clearTimeout(timer.current);
    pending.current = false;
    clearDraft(keyRef.current);
    last.current = lazy ? null : safeJson(dataRef.current);
    setSavedAt(null);
  }, [lazy]);

  return { savedAt, restore, clear, touch, flush: write };
}

function safeJson(v) {
  try { return JSON.stringify(v); } catch { return null; }
}

/**
 * Text being typed (a message, a comment), kept per `key` on this device and
 * brought back when the same key is opened again. Returns
 * [text, setText, sent]; call `sent(key)` once the text has gone out.
 * Switching keys writes the old thread's text first, so it never lands in
 * the wrong draft. An empty text removes the draft.
 */
export function useTextDraft(key, delay = 800) {
  const read = k => (k ? (loadDraft(k)?.data ?? '') : '');
  const [text, setTextState] = useState(() => read(key));
  const [shownKey, setShownKey] = useState(key);
  if (key !== shownKey) {            // another conversation: show its draft
    setShownKey(key);
    setTextState(read(key));
  }
  const current = useRef(key);       // callers may hold an older render's `sent`
  current.current = key;
  const pending = useRef(null);      // { key, text } waiting for its write
  const timer = useRef(null);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const p = pending.current;
    pending.current = null;
    if (!p || !p.key) return;
    if (p.text.trim()) saveDraft(p.key, p.text); else clearDraft(p.key);
  }, []);

  const setText = useCallback((v) => {
    setTextState(v);
    pending.current = { key, text: v };
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  }, [key, delay, flush]);

  const sent = useCallback((sentKey) => {
    if (pending.current?.key === sentKey) { clearTimeout(timer.current); pending.current = null; }
    if (sentKey) clearDraft(sentKey);
    if (sentKey === current.current) setTextState('');
  }, []);

  // Leaving the thread, hiding the tab or closing it: write what is pending.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [key, flush]);

  return [text, setText, sent];
}
