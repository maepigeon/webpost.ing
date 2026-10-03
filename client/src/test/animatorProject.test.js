import { describe, it, expect } from 'vitest';
import { rawBitmap } from '../animator/engine/bitmap.js';
import {
  addFrame, addLayer, celKey, createProject, deleteFrame, deleteLayer, duplicateFrame, ensureCel, fromMeta, getCel, moveFrame,
  moveLayer, projectBytes, renameLayer, resizeProject, setFps, setHold, setLayerOpacity, setLayerVisible, sizeWarning, toMeta,
} from '../animator/engine/project.js';
import { createHistory, patchEntry, stateEntry } from '../animator/engine/history.js';
import { createSession } from '../animator/engine/session.js';

const make = (w, h) => rawBitmap(w, h);
const small = () => createProject({ width: 4, height: 4, fps: 12 });

describe('project operations', () => {
  it('starts with one frame and one layer', () => {
    const p = small();
    expect(p.frames).toHaveLength(1);
    expect(p.layers).toHaveLength(1);
    expect(p.cels.size).toBe(0);
  });

  it('adds, moves and holds frames without changing the original', () => {
    const p = small();
    const { project: a, frameId } = addFrame(p);
    expect(p.frames).toHaveLength(1);
    expect(a.frames.map(f => f.id)).toEqual(['f1', frameId]);
    const b = moveFrame(a, 1, 0);
    expect(b.frames[0].id).toBe(frameId);
    expect(setHold(b, frameId, 3).frames[0].hold).toBe(3);
    expect(setHold(b, frameId, 500).frames[0].hold).toBe(99);
    expect(setHold(b, frameId, 1)).toBe(b);       // no change returns the same object
  });

  it('duplicates a frame with its own copy of every cel', () => {
    let p = small();
    const cel = ensureCel(p, 'f1', 'l1', make);
    cel.data[0] = 200;
    const r = duplicateFrame(p, 'f1');
    p = r.project;
    expect(p.frames).toHaveLength(2);
    const copy = getCel(p, r.frameId, 'l1');
    expect(copy).not.toBe(cel);
    expect(copy.data[0]).toBe(200);
    copy.data[0] = 1;
    expect(cel.data[0]).toBe(200);
  });

  it('deleting the only frame clears it instead', () => {
    const p = small();
    ensureCel(p, 'f1', 'l1', make);
    const q = deleteFrame(p, 'f1');
    expect(q.frames).toHaveLength(1);
    expect(q.cels.size).toBe(0);
    const { project: two, frameId } = addFrame(q);
    ensureCel(two, frameId, 'l1', make);
    expect(deleteFrame(two, frameId).frames).toHaveLength(1);
    expect(deleteFrame(two, frameId).cels.size).toBe(0);
  });

  it('adds, orders, renames and deletes layers', () => {
    let p = small();
    const r = addLayer(p, { name: 'Ink' });
    p = r.project;
    expect(p.layers.map(l => l.name)).toEqual(['Layer 1', 'Ink']);
    p = moveLayer(p, r.layerId, 0);
    expect(p.layers[0].name).toBe('Ink');
    p = renameLayer(p, r.layerId, '  Colour  ');
    expect(p.layers[0].name).toBe('Colour');
    expect(renameLayer(p, r.layerId, '   ')).toBe(p);
    p = setLayerVisible(p, r.layerId, false);
    expect(p.layers[0].visible).toBe(false);
    p = setLayerOpacity(p, r.layerId, 3);
    expect(p.layers[0].opacity).toBe(1);
    ensureCel(p, 'f1', r.layerId, make);
    p = deleteLayer(p, r.layerId);
    expect(p.layers).toHaveLength(1);
    expect(p.cels.size).toBe(0);
  });

  it('clamps fps and canvas size', () => {
    const p = small();
    expect(setFps(p, 0).fps).toBe(1);
    expect(setFps(p, 999).fps).toBe(60);
    expect(createProject({ width: 99999, height: -4 }).width).toBe(4096);
    expect(createProject({ width: 99999, height: -4 }).height).toBe(1);
  });

  it('resizes the canvas, keeping art centred', () => {
    const p = small();
    const cel = ensureCel(p, 'f1', 'l1', make);
    cel.data.set([9, 9, 9, 255], 0);                   // top-left pixel
    const q = resizeProject(p, 8, 8);
    expect(q.width).toBe(8);
    const moved = getCel(q, 'f1', 'l1');
    const at = (2 * 8 + 2) * 4;                        // offset (2, 2) when centred
    expect(Array.from(moved.data.slice(at, at + 4))).toEqual([9, 9, 9, 255]);
    expect(resizeProject(p, 4, 4)).toBe(p);
  });

  it('round-trips through metadata and refuses bad or newer data', () => {
    const p = small();
    const meta = toMeta(addFrame(p).project);
    const back = fromMeta(JSON.parse(JSON.stringify(meta)));
    expect(back.frames).toHaveLength(2);
    expect(back.cels.size).toBe(0);
    expect(fromMeta({ ...meta, v: 2 })).toBeNull();
    expect(fromMeta({ ...meta, frames: [] })).toBeNull();
    expect(fromMeta(null)).toBeNull();
  });

  it('warns about big canvases only above 2048', () => {
    expect(sizeWarning(2048, 2048)).toBeNull();
    expect(sizeWarning(4096, 1000)).toMatch(/Large canvas/);
  });
});

describe('history', () => {
  const rect = { x: 1, y: 1, w: 2, h: 1 };

  it('undoes and redoes a patch on the right cel', () => {
    const p = small();
    const cel = ensureCel(p, 'f1', 'l1', make);
    const before = cel.readRect(1, 1, 2, 1);
    cel.writeRect(1, 1, 2, 1, new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]));
    const after = cel.readRect(1, 1, 2, 1);
    const h = createHistory();
    h.push(patchEntry('f1', 'l1', rect, before, after));
    expect(h.canUndo()).toBe(true);
    const u = h.undo(p, make);
    expect(u.touched).toEqual({ frameId: 'f1', layerId: 'l1' });
    expect(Array.from(cel.readRect(1, 1, 2, 1))).toEqual(Array.from(before));
    h.redo(p, make);
    expect(Array.from(cel.readRect(1, 1, 2, 1))).toEqual(Array.from(after));
  });

  it('undoes structure by returning the earlier project', () => {
    const p = small();
    const q = addFrame(p).project;
    const h = createHistory();
    h.push(stateEntry(p, q));
    expect(h.undo(q, make).project).toBe(p);
    expect(h.redo(p, make).project).toBe(q);
  });

  it('drops redo entries on a new edit', () => {
    const p = small();
    const q = addFrame(p).project;
    const h = createHistory();
    h.push(stateEntry(p, q));
    h.undo(q, make);
    expect(h.canRedo()).toBe(true);
    h.push(stateEntry(p, setFps(p, 24)));
    expect(h.canRedo()).toBe(false);
  });

  it('drops the oldest entries past the memory cap', () => {
    const h = createHistory({ limitBytes: 1000 });
    const big = new Uint8ClampedArray(300);
    for (let i = 0; i < 10; i++) h.push(patchEntry('f1', 'l1', rect, big, big));
    expect(h.bytes).toBeLessThanOrEqual(1000);
    expect(h.size).toBeLessThan(10);
    expect(h.size).toBeGreaterThan(0);
  });

  it('merges a run of coalesced edits into one step', () => {
    const p = small();
    const h = createHistory();
    h.push(stateEntry(p, setFps(p, 13), 'fps@0'));
    h.push(stateEntry(setFps(p, 13), setFps(p, 14), 'fps@0'));
    expect(h.size).toBe(1);
    expect(h.undo(setFps(p, 14), make).project.fps).toBe(12);
  });
});

describe('session', () => {
  const session = () => createSession({ makeBitmap: make, project: small() });

  it('edits are undoable and keep the selection valid', () => {
    const s = session();
    s.addFrame();
    expect(s.getState().project.frames).toHaveLength(2);
    expect(s.getState().frameIndex).toBe(1);
    s.undo();
    expect(s.getState().project.frames).toHaveLength(1);
    expect(s.getState().frameIndex).toBe(0);
    expect(s.getState().canRedo).toBe(true);
    s.redo();
    expect(s.getState().project.frames).toHaveLength(2);
  });

  it('flood fill is one undo step', () => {
    const s = session();
    expect(s.fill(1, 1, [255, 0, 0, 255])).toBe(true);
    const cel = getCel(s.getState().project, 'f1', 'l1');
    expect(Array.from(cel.readRect(3, 3, 1, 1))).toEqual([255, 0, 0, 255]);
    s.undo();
    expect(Array.from(cel.readRect(3, 3, 1, 1))).toEqual([0, 0, 0, 0]);
    s.redo();
    expect(Array.from(cel.readRect(0, 0, 1, 1))).toEqual([255, 0, 0, 255]);
  });

  it('will not draw on a hidden layer', () => {
    const s = session();
    s.setLayerVisible('l1', false);
    expect(s.canDraw()).toBe(false);
    expect(s.fill(0, 0, [1, 1, 1, 255])).toBe(false);
  });

  it('undoing a frame duplicate and redoing it brings back the copy', () => {
    const s = session();
    s.fill(0, 0, [0, 255, 0, 255]);
    s.duplicateFrame();
    const dup = s.getState().project.frames[1].id;
    expect(getCel(s.getState().project, dup, 'l1')).toBeTruthy();
    s.undo();
    expect(s.getState().project.frames).toHaveLength(1);
    s.redo();
    expect(Array.from(getCel(s.getState().project, dup, 'l1').readRect(0, 0, 1, 1))).toEqual([0, 255, 0, 255]);
  });

  it('tracks unsaved changes', () => {
    const s = session();
    expect(s.isDirty).toBe(false);
    s.setFps(24);
    expect(s.isDirty).toBe(true);
    s.markSaved();
    expect(s.isDirty).toBe(false);
  });

  it('reports memory of drawn cels', () => {
    const s = session();
    s.fill(0, 0, [1, 2, 3, 255]);
    expect(projectBytes(s.getState().project)).toBe(4 * 4 * 4);
    expect(celKey('f1', 'l1')).toBe('f1:l1');
  });
});
