import { celKey, fromMeta, toMeta } from './project.js';

/**
 * Saving projects on the device (IndexedDB): one record of project metadata
 * and one PNG blob per cel. Nothing here throws to the caller; every call
 * returns { ok: true, ... } or { ok: false, error }.
 *
 * The database is reached through a small adapter so tests can pass a fake:
 *   { get(store, key), put(store, key, value), del(store, key), keys(store), all(store) }  (all async)
 * and pixels go in and out through `encode(bitmap) -> Blob` and `decode(blob, w, h) -> bitmap`.
 */
export const DB_NAME = 'webposting-animator';
const PROJECTS = 'projects';
const CELS = 'cels';

const fail = (e) => ({ ok: false, error: (e && e.message) || String(e || 'Unknown error') });

/** The real adapter over indexedDB. */
export function idbAdapter(name = DB_NAME, factory = typeof indexedDB !== 'undefined' ? indexedDB : null) {
  let opening = null;
  const open = () => {
    if (!factory) return Promise.reject(new Error('This browser cannot save projects on the device.'));
    if (!opening) {
      opening = new Promise((resolve, reject) => {
        const req = factory.open(name, 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore(PROJECTS);
          req.result.createObjectStore(CELS);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => { opening = null; reject(req.error || new Error('Could not open the saved projects.')); };
      });
    }
    return opening;
  };
  const run = async (store, mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error || new Error('Saving failed.'));
      tx.onabort = () => reject(tx.error || new Error('Saving was stopped (the device may be out of space).'));
    });
  };
  return {
    get: (store, key) => run(store, 'readonly', s => s.get(key)),
    put: (store, key, value) => run(store, 'readwrite', s => s.put(value, key)),
    del: (store, key) => run(store, 'readwrite', s => s.delete(key)),
    keys: (store) => run(store, 'readonly', s => s.getAllKeys()),
    all: (store) => run(store, 'readonly', s => s.getAll()),
  };
}

/** An in-memory adapter: the fallback when there is no IndexedDB, and what tests use. */
export function memoryAdapter() {
  const stores = { [PROJECTS]: new Map(), [CELS]: new Map() };
  return {
    get: async (s, k) => stores[s].get(k),
    put: async (s, k, v) => { stores[s].set(k, v); },
    del: async (s, k) => { stores[s].delete(k); },
    keys: async (s) => [...stores[s].keys()],
    all: async (s) => [...stores[s].values()],
  };
}

export function createStorage({ adapter, encode, decode }) {
  // For each project, the revision of every cel as last written, so a save writes only what changed.
  const written = new Map();
  const seen = (id) => { if (!written.has(id)) written.set(id, new Map()); return written.get(id); };

  return {
    /** Save a project. `thumb` is an optional small Blob for the project list. */
    async save(project, { thumb = null } = {}) {
      try {
        const done = seen(project.id);
        const live = new Set();
        for (const [key, bitmap] of project.cels) {
          const id = `${project.id}/${key}`;
          live.add(id);
          if (done.get(id) === bitmap.rev && done.has(id)) continue;
          const blob = await encode(bitmap);
          if (!blob) throw new Error('Could not turn a drawing into an image to save.');
          await adapter.put(CELS, id, blob);
          done.set(id, bitmap.rev);
        }
        const prefix = `${project.id}/`;
        for (const id of await adapter.keys(CELS)) {
          if (typeof id === 'string' && id.startsWith(prefix) && !live.has(id)) {
            await adapter.del(CELS, id);
            done.delete(id);
          }
        }
        // The metadata goes last, so a crash part-way leaves the previous version listing only what exists.
        const savedAt = Date.now();
        await adapter.put(PROJECTS, project.id, { ...toMeta(project), savedAt, thumb });
        return { ok: true, savedAt };
      } catch (e) {
        return fail(e);
      }
    },

    /** Load a project: { ok, project }. Cels that fail to decode come back transparent. */
    async load(id) {
      try {
        const rec = await adapter.get(PROJECTS, id);
        if (!rec) return { ok: false, error: 'That project is not saved on this device.' };
        const project = fromMeta(rec);
        if (!project) return { ok: false, error: 'That project was made by a newer version and cannot be opened here.' };
        const done = seen(id);
        done.clear();
        for (const f of project.frames) {
          for (const l of project.layers) {
            const key = celKey(f.id, l.id);
            const blob = await adapter.get(CELS, `${id}/${key}`);
            if (!blob) continue;
            try {
              const bitmap = await decode(blob, project.width, project.height);
              project.cels.set(key, bitmap);
              done.set(`${id}/${key}`, bitmap.rev);
            } catch { /* leave it transparent */ }
          }
        }
        return { ok: true, project };
      } catch (e) {
        return fail(e);
      }
    },

    /** Saved projects, newest first: { ok, projects: [{ id, name, width, height, frames, fps, savedAt, thumb }] }. */
    async list() {
      try {
        const recs = (await adapter.all(PROJECTS)) || [];
        const projects = recs
          .filter(r => r && typeof r.id === 'string')
          .map(r => ({
            id: r.id, name: r.name, width: r.width, height: r.height, fps: r.fps,
            frames: Array.isArray(r.frames) ? r.frames.length : 0, savedAt: r.savedAt || 0, thumb: r.thumb || null,
          }))
          .sort((a, b) => b.savedAt - a.savedAt);
        return { ok: true, projects };
      } catch (e) {
        return { ...fail(e), projects: [] };
      }
    },

    async remove(id) {
      try {
        const prefix = `${id}/`;
        for (const k of await adapter.keys(CELS)) {
          if (typeof k === 'string' && k.startsWith(prefix)) await adapter.del(CELS, k);
        }
        await adapter.del(PROJECTS, id);
        written.delete(id);
        return { ok: true };
      } catch (e) {
        return fail(e);
      }
    },
  };
}

/**
 * Autosave: save `delay` ms after the last change, and at once on flush()
 * (the page being hidden). Saves never overlap; a change during a save
 * schedules another. onStatus gets { state: 'dirty'|'saving'|'saved'|'error', at?, error? }.
 */
export function createAutosaver({
  save, delay = 2000, onStatus = () => {},
  setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (h) => clearTimeout(h),
}) {
  let timer = null;
  let running = null;
  let pending = false;
  let disposed = false;

  const run = async () => {
    if (running) { pending = true; return running; }
    pending = false;
    onStatus({ state: 'saving' });
    running = (async () => {
      const r = await save();
      if (r && r.ok === false) onStatus({ state: 'error', error: r.error });
      else onStatus({ state: 'saved', at: (r && r.savedAt) || Date.now() });
    })();
    await running;
    running = null;
    if (pending && !disposed) await run();
  };

  return {
    touch() {
      if (disposed) return;
      onStatus({ state: 'dirty' });
      if (timer !== null) clearTimer(timer);
      timer = setTimer(() => { timer = null; run(); }, delay);
    },
    /** Save now if anything is waiting. */
    async flush() {
      if (timer === null && !running) return;
      if (timer !== null) { clearTimer(timer); timer = null; await run(); } else await running;
    },
    dispose() { disposed = true; if (timer !== null) clearTimer(timer); timer = null; },
  };
}

/** Save at once when the page is hidden or closed (phones kill tabs without warning). */
export function flushOnHide(doc, win, autosaver) {
  const onVis = () => { if (doc.visibilityState === 'hidden') autosaver.flush(); };
  const onHide = () => autosaver.flush();
  doc.addEventListener('visibilitychange', onVis);
  win.addEventListener('pagehide', onHide);
  return () => { doc.removeEventListener('visibilitychange', onVis); win.removeEventListener('pagehide', onHide); };
}
