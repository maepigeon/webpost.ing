// A tiny draft store over localStorage. Drafts live on the device only, so
// autosaving costs the server nothing. Keys are "draft:{kind}:{id}" and each
// value is { v: 1, savedAt, data }. Nothing here ever throws: private mode,
// a full disk or a corrupted value just means "no draft".

const PREFIX = 'draft:';
export const MAX_DRAFT_BYTES = 2 * 1024 * 1024;     // one draft
export const MAX_TOTAL_BYTES = 8 * 1024 * 1024;     // all drafts together

const storage = () => { try { return window.localStorage; } catch { return null; } };

function readEntry(ls, fullKey) {
  try {
    const raw = ls.getItem(fullKey);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || obj.v !== 1 || typeof obj.savedAt !== 'number' || !('data' in obj)) return null;
    return { obj, size: raw.length };
  } catch {
    return null;
  }
}

/** Every stored draft, oldest first: [{ key, savedAt, size }]. */
export function listDrafts() {
  const ls = storage();
  if (!ls) return [];
  const out = [];
  try {
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      const e = readEntry(ls, k);
      if (e) out.push({ key: k.slice(PREFIX.length), savedAt: e.obj.savedAt, size: e.size });
    }
  } catch { /* unreadable */ }
  return out.sort((a, b) => a.savedAt - b.savedAt);
}

/**
 * Keeps a draft. `key` is "{kind}:{id}". `json` may be the already serialised
 * data (saves stringifying a big post twice). Returns { ok, savedAt } or
 * { ok: false, reason: 'unavailable' | 'too-large' | 'full' }.
 */
export function saveDraft(key, data, json) {
  const ls = storage();
  if (!ls) return { ok: false, reason: 'unavailable' };
  try {
    const savedAt = Date.now();
    const body = json ?? JSON.stringify(data);
    if (body === undefined) return { ok: false, reason: 'unavailable' };
    const value = `{"v":1,"savedAt":${savedAt},"data":${body}}`;
    if (value.length > MAX_DRAFT_BYTES) return { ok: false, reason: 'too-large' };
    const full = PREFIX + key;
    // Make room: the oldest other drafts go first.
    const others = listDrafts().filter(d => d.key !== key);
    let total = others.reduce((n, d) => n + d.size, 0) + value.length;
    while (total > MAX_TOTAL_BYTES && others.length) {
      const old = others.shift();
      try { ls.removeItem(PREFIX + old.key); } catch { /* ignore */ }
      total -= old.size;
    }
    try {
      ls.setItem(full, value);
    } catch {
      // Quota: drop the remaining old drafts and try once more.
      for (const old of others) { try { ls.removeItem(PREFIX + old.key); } catch { /* ignore */ } }
      ls.setItem(full, value);
    }
    return { ok: true, savedAt };
  } catch {
    return { ok: false, reason: 'full' };
  }
}

/** The draft as { savedAt, data }, or null when there is none or it is unreadable. */
export function loadDraft(key) {
  const ls = storage();
  if (!ls) return null;
  const e = readEntry(ls, PREFIX + key);
  return e ? { savedAt: e.obj.savedAt, data: e.obj.data } : null;
}

export function clearDraft(key) {
  const ls = storage();
  if (!ls) return;
  try { ls.removeItem(PREFIX + key); } catch { /* ignore */ }
}
