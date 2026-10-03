import { createHistory, patchEntry, stateEntry } from './history.js';
import { Stroke, fillBitmap } from './brush.js';
import {
  addFrame, addLayer, deleteFrame, deleteLayer, duplicateFrame, ensureCel, frameIndexOf, layerIndexOf, moveFrame,
  moveLayer, renameLayer, resizeProject, setFps, setHold, setLayerOpacity, setLayerVisible, setName,
} from './project.js';

/**
 * The editing session: the current project, which frame and layer are
 * selected, and the undo history, behind one object the UI subscribes to.
 * Framework-free. `makeBitmap(w, h)` supplies the bitmaps (canvas ones in the app).
 *
 * subscribe(fn) calls fn(kind) with 'content' (the artwork or structure changed:
 * autosave and redraw), 'view' (selection changed: redraw only).
 */
export function createSession({ makeBitmap, project, historyLimit } = {}) {
  let history = createHistory({ limitBytes: historyLimit });
  let state = { project, frameIndex: 0, layerId: project.layers[0].id, version: 0, canUndo: false, canRedo: false };
  let contentRev = 0;
  let savedRev = 0;
  let gesture = 0;
  let buffer = null;
  const listeners = new Set();

  const emit = (kind) => {
    state = { ...state, version: state.version + 1, canUndo: history.canUndo(), canRedo: history.canRedo() };
    listeners.forEach(fn => fn(kind));
  };

  /** Keep the selection valid after the project's shape changed. */
  const fixSelection = (p, frameIndex, layerId) => ({
    frameIndex: Math.max(0, Math.min(p.frames.length - 1, frameIndex)),
    layerId: layerIndexOf(p, layerId) >= 0 ? layerId : p.layers[0].id,
  });

  const setProject = (p, extra = {}) => {
    const sel = fixSelection(p, extra.frameIndex ?? state.frameIndex, extra.layerId ?? state.layerId);
    state = { ...state, project: p, ...sel };
    contentRev++;
    emit('content');
  };

  /** Run a pure project edit as one undo step. */
  const edit = (fn, { coalesce = null, ...extra } = {}) => {
    const before = state.project;
    const after = fn(before);
    if (after === before) return false;
    history.push(stateEntry(before, after, coalesce ? `${coalesce}@${gesture}` : null));
    setProject(after, extra);
    return true;
  };

  const session = {
    getState: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get isDirty() { return contentRev !== savedRev; },
    /** The revision to pass to markSaved: take it before saving, so changes made during the save stay unsaved. */
    get revision() { return contentRev; },
    markSaved(rev = contentRev) { savedRev = rev; },
    /** Ends a run of coalesced edits (call when a slider is let go). */
    endGesture() { gesture++; },
    makeBitmap,

    /** Replace the whole project (open, new). Clears history. */
    load(p) {
      history = createHistory({ limitBytes: historyLimit });
      buffer = null;
      state = { ...state, project: p, frameIndex: 0, layerId: p.layers[0].id };
      contentRev = 0; savedRev = 0;
      emit('content');
    },

    currentFrame: () => state.project.frames[state.frameIndex],
    currentLayer: () => state.project.layers.find(l => l.id === state.layerId),

    setFrame(i) {
      const n = Math.max(0, Math.min(state.project.frames.length - 1, Math.round(i)));
      if (n === state.frameIndex) return;
      state = { ...state, frameIndex: n };
      emit('view');
    },
    stepFrame(d) { session.setFrame(state.frameIndex + d); },
    setLayer(id) {
      if (id === state.layerId || layerIndexOf(state.project, id) < 0) return;
      state = { ...state, layerId: id };
      emit('view');
    },

    /* frames */
    addFrame() {
      let id = null;
      edit((p) => { const r = addFrame(p, state.frameIndex + 1); id = r.frameId; return r.project; }, {});
      if (id) session.setFrame(frameIndexOf(state.project, id));
    },
    duplicateFrame() {
      let id = null;
      edit((p) => { const r = duplicateFrame(p, session.currentFrame().id); id = r.frameId; return r.project; });
      if (id) session.setFrame(frameIndexOf(state.project, id));
    },
    deleteFrame() { edit(p => deleteFrame(p, session.currentFrame().id)); },
    moveFrame(from, to) {
      const id = state.project.frames[from]?.id;
      if (edit(p => moveFrame(p, from, to)) && id) session.setFrame(frameIndexOf(state.project, id));
    },
    setHold(v) { edit(p => setHold(p, session.currentFrame().id, v), { coalesce: 'hold' }); },

    /* layers */
    addLayer() {
      let id = null;
      edit((p) => { const r = addLayer(p, { index: layerIndexOf(p, state.layerId) + 1 }); id = r.layerId; return r.project; });
      if (id) session.setLayer(id);
    },
    deleteLayer(id = state.layerId) { edit(p => deleteLayer(p, id)); },
    moveLayer(id, to) { edit(p => moveLayer(p, id, to)); },
    renameLayer(id, name) { edit(p => renameLayer(p, id, name)); },
    setLayerVisible(id, v) { edit(p => setLayerVisible(p, id, v)); },
    setLayerOpacity(id, v) { edit(p => setLayerOpacity(p, id, v), { coalesce: `opacity-${id}` }); },

    /* project */
    setFps(v) { edit(p => setFps(p, v), { coalesce: 'fps' }); },
    setName(name) {
      // The name is not an undo step, but it is a change worth saving.
      if (name === state.project.name) return;
      state = { ...state, project: setName(state.project, name) };
      contentRev++;
      emit('content');
    },
    resize(w, h) { edit(p => resizeProject(p, w, h)); },

    /* history */
    undo() { return step(history.undo(state.project, makeBitmap)); },
    redo() { return step(history.redo(state.project, makeBitmap)); },

    /* drawing */
    canDraw() {
      const l = session.currentLayer();
      return Boolean(l && l.visible);
    },

    /** Start a stroke on the current cel; null if the layer is hidden. */
    beginStroke(tool) {
      if (!session.canDraw()) return null;
      const { project, frameIndex, layerId } = state;
      const frameId = project.frames[frameIndex].id;
      const bitmap = ensureCel(project, frameId, layerId, makeBitmap);
      if (!buffer || buffer.width !== project.width || buffer.height !== project.height) buffer = makeBitmap(project.width, project.height);
      const stroke = new Stroke({ bitmap, buffer, tool });
      stroke.frameId = frameId;
      stroke.layerId = layerId;
      return stroke;
    },
    endStroke(stroke) {
      const patch = stroke.finish();
      if (patch) session.pushPatch(stroke.frameId, stroke.layerId, patch);
      else emit('view');
      return Boolean(patch);
    },
    cancelStroke(stroke) { stroke.cancel(); emit('view'); },
    pushPatch(frameId, layerId, { rect, before, after }) {
      history.push(patchEntry(frameId, layerId, rect, before, after));
      contentRev++;
      emit('content');
    },

    /** Bucket fill on the current cel at a document point. */
    fill(x, y, rgba, tolerance = 32) {
      if (!session.canDraw()) return false;
      const { project, frameIndex, layerId } = state;
      const frameId = project.frames[frameIndex].id;
      const bitmap = ensureCel(project, frameId, layerId, makeBitmap);
      const patch = fillBitmap(bitmap, x, y, rgba, tolerance);
      if (!patch) return false;
      session.pushPatch(frameId, layerId, patch);
      return true;
    },

    get overlayBuffer() { return buffer; },
  };

  function step(result) {
    if (!result) return false;
    const { project, touched } = result;
    if (touched) {
      // Show where the change happened.
      const fi = frameIndexOf(project, touched.frameId);
      state = { ...state, project, ...(fi >= 0 ? { frameIndex: fi } : {}), ...(layerIndexOf(project, touched.layerId) >= 0 ? { layerId: touched.layerId } : {}) };
      contentRev++;
      emit('content');
    } else {
      setProject(project);
    }
    return true;
  }

  return session;
}
