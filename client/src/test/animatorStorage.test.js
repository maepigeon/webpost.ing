import { describe, it, expect, vi } from 'vitest';
import { createAutosaver, createStorage, memoryAdapter } from '../animator/engine/storage.js';
import { rawBitmap } from '../animator/engine/bitmap.js';
import { addFrame, createProject, ensureCel } from '../animator/engine/project.js';
import { buildZip, crc32 } from '../animator/engine/zip.js';

// Fake pixel encoding: the blob is just the raw bytes.
const encode = vi.fn(async (b) => ({ bytes: new Uint8ClampedArray(b.data) }));
const decode = async (blob, w, h) => rawBitmap(w, h, new Uint8ClampedArray(blob.bytes));
const storage = (adapter = memoryAdapter()) => ({ adapter, s: createStorage({ adapter, encode, decode }) });

const drawn = () => {
  let p = createProject({ width: 2, height: 2, name: 'Walk' });
  p = addFrame(p).project;
  ensureCel(p, 'f1', 'l1', (w, h) => rawBitmap(w, h)).data.set([1, 2, 3, 255]);
  return p;
};

describe('storage', () => {
  it('saves and loads a project with its pixels', async () => {
    const { s } = storage();
    const p = drawn();
    expect((await s.save(p)).ok).toBe(true);
    const r = await s.load(p.id);
    expect(r.ok).toBe(true);
    expect(r.project.name).toBe('Walk');
    expect(r.project.frames).toHaveLength(2);
    expect(Array.from(r.project.cels.get('f1:l1').data.slice(0, 4))).toEqual([1, 2, 3, 255]);
  });

  it('writes only cels that changed', async () => {
    const { s } = storage();
    const p = drawn();
    await s.save(p);
    encode.mockClear();
    await s.save(p);
    expect(encode).not.toHaveBeenCalled();
    p.cels.get('f1:l1').writeRect(0, 0, 1, 1, new Uint8ClampedArray([9, 9, 9, 255]));
    await s.save(p);
    expect(encode).toHaveBeenCalledTimes(1);
  });

  it('removes cels that no longer exist', async () => {
    const { s, adapter } = storage();
    const p = drawn();
    await s.save(p);
    expect(await adapter.keys('cels')).toHaveLength(1);
    p.cels.clear();
    await s.save(p);
    expect(await adapter.keys('cels')).toHaveLength(0);
  });

  it('lists newest first and deletes with all its cels', async () => {
    const { s, adapter } = storage();
    const a = drawn();
    const b = createProject({ width: 2, height: 2, name: 'Other' });
    await s.save(a);
    await new Promise(r => setTimeout(r, 5));
    await s.save(b);
    const list = await s.list();
    expect(list.projects.map(p => p.name)).toEqual(['Other', 'Walk']);
    expect(list.projects[1].frames).toBe(2);
    expect((await s.remove(a.id)).ok).toBe(true);
    expect((await s.list()).projects).toHaveLength(1);
    expect(await adapter.keys('cels')).toHaveLength(0);
  });

  it('never throws: failures come back as { ok: false, error }', async () => {
    const broken = { get: async () => { throw new Error('disk gone'); }, put: async () => { throw new Error('quota exceeded'); }, del: async () => {}, keys: async () => [], all: async () => { throw new Error('nope'); } };
    const { s } = storage(broken);
    expect(await s.save(drawn())).toEqual({ ok: false, error: 'quota exceeded' });
    expect((await s.load('x')).ok).toBe(false);
    const l = await s.list();
    expect(l.ok).toBe(false);
    expect(l.projects).toEqual([]);
  });

  it('says so when a project is missing or from a newer version', async () => {
    const { s, adapter } = storage();
    expect((await s.load('nope')).error).toMatch(/not saved/);
    await adapter.put('projects', 'new', { v: 99, id: 'new', frames: [{ id: 'a' }], layers: [{ id: 'b' }] });
    expect((await s.load('new')).error).toMatch(/newer version/);
  });

  it('leaves a cel transparent if it cannot be decoded', async () => {
    const adapter = memoryAdapter();
    const bad = createStorage({ adapter, encode, decode: async () => { throw new Error('corrupt'); } });
    const p = drawn();
    await bad.save(p);
    const r = await bad.load(p.id);
    expect(r.ok).toBe(true);
    expect(r.project.cels.size).toBe(0);
  });
});

describe('autosave', () => {
  const fakeTimers = () => {
    let next = 1;
    const timers = new Map();
    return {
      setTimer: (fn, ms) => { timers.set(next, { fn, ms }); return next++; },
      clearTimer: (h) => timers.delete(h),
      fire() { const all = [...timers.values()]; timers.clear(); all.forEach(t => t.fn()); },
      get pending() { return timers.size; },
      get delays() { return [...timers.values()].map(t => t.ms); },
    };
  };

  it('waits 2 seconds after the last change, restarting on each', async () => {
    const t = fakeTimers();
    const save = vi.fn(async () => ({ ok: true, savedAt: 1 }));
    const a = createAutosaver({ save, ...t });
    a.touch(); a.touch(); a.touch();
    expect(t.pending).toBe(1);
    expect(t.delays).toEqual([2000]);
    expect(save).not.toHaveBeenCalled();
    t.fire();
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('flush saves at once', async () => {
    const t = fakeTimers();
    const save = vi.fn(async () => ({ ok: true }));
    const a = createAutosaver({ save, ...t });
    a.touch();
    await a.flush();
    expect(save).toHaveBeenCalledTimes(1);
    expect(t.pending).toBe(0);
    await a.flush();                             // nothing waiting
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('reports status and errors', async () => {
    const t = fakeTimers();
    const seen = [];
    const a = createAutosaver({ save: async () => ({ ok: false, error: 'full' }), onStatus: s => seen.push(s.state), ...t });
    a.touch();
    await a.flush();
    expect(seen).toEqual(['dirty', 'saving', 'error']);
  });

  it('runs another save if a change arrives during one', async () => {
    const t = fakeTimers();
    let release;
    let calls = 0;
    const save = () => { calls++; return calls === 1 ? new Promise(r => { release = () => r({ ok: true }); }) : Promise.resolve({ ok: true }); };
    const a = createAutosaver({ save, ...t });
    a.touch();
    const first = a.flush();
    await Promise.resolve();
    a.touch();
    t.fire();                                    // second save requested while the first runs
    release();
    await first;
    await new Promise(r => setTimeout(r, 0));
    expect(calls).toBe(2);
  });
});

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('writes a well-formed archive', () => {
    const data = new TextEncoder().encode('hello');
    const zip = buildZip([{ name: 'a.txt', data }, { name: 'dir/b.txt', data }], new Date(2026, 9, 3, 12, 0, 0));
    const v = new DataView(zip.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    const end = zip.length - 22;
    expect(v.getUint32(end, true)).toBe(0x06054b50);
    expect(v.getUint16(end + 10, true)).toBe(2);
    const dirAt = v.getUint32(end + 16, true);
    expect(v.getUint32(dirAt, true)).toBe(0x02014b50);
    expect(v.getUint32(dirAt + 16, true)).toBe(crc32(data));
    expect(new TextDecoder().decode(zip.slice(30, 35))).toBe('a.txt');
  });
});
