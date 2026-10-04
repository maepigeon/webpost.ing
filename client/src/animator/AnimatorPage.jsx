import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import '../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/TileGrid.css';
import '../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/GridUI.css';
import '../components/TileArt/ColourPicker.css';
import './animator.css';
import Stage from './components/Stage.jsx';
import Toolbar from './components/Toolbar.jsx';
import LayersPanel from './components/LayersPanel.jsx';
import Timeline from './components/Timeline.jsx';
import TopBar from './components/TopBar.jsx';
import { ExportDialog, OpenDialog, SizeDialog } from './components/Dialogs.jsx';
import { canvasBitmap, canvasBitmapFromBlob, makeCanvas } from './engine/bitmap.js';
import { renderFrameTo } from './engine/compositor.js';
import { createPlayback } from './engine/playback.js';
import { createProject } from './engine/project.js';
import { createSession } from './engine/session.js';
import { createAutosaver, createStorage, flushOnHide, idbAdapter, memoryAdapter } from './engine/storage.js';

const LAST_KEY = 'animator:last-project';
const remember = (id) => { try { localStorage.setItem(LAST_KEY, id); } catch { /* private mode */ } };
const recall = () => { try { return localStorage.getItem(LAST_KEY); } catch { return null; } };

const DEFAULT_TOOL = { kind: 'brush', size: 12, opacity: 100, hardness: 80, smoothing: 35, colour: '#111111' };
const SIZE_FOR = { brush: 12, pixel: 1, eraser: 24 };

function thumbBlob(project) {
  const h = 96, w = Math.max(24, Math.round(h * project.width / project.height));
  const c = makeCanvas(w, h);
  renderFrameTo(c, project, 0, { background: '#f2f2f2' });
  return new Promise(resolve => c.toBlob(b => resolve(b), 'image/png'));
}

/** The animator: a flipbook with layers, onion skin, playback and export, saved on this device. */
export default function AnimatorPage() {
  const navigate = useNavigate();
  const sessionRef = useRef(null);
  if (!sessionRef.current) {
    sessionRef.current = createSession({ makeBitmap: canvasBitmap, project: createProject({ width: 1080, height: 1080, fps: 12 }) });
  }
  const session = sessionRef.current;
  const state = useSyncExternalStore(session.subscribe, session.getState);

  const [ready, setReady] = useState(false);
  const [tool, setToolState] = useState(DEFAULT_TOOL);
  const [onion, setOnion] = useState(1);
  const [loop, setLoopState] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [status, setStatus] = useState(null);
  const [notice, setNotice] = useState('');
  const [toolsOpen, setToolsOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const keys = useRef({ space: false, spaceUsed: false });
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const sizes = useRef({ ...SIZE_FOR });

  // Storage and autosave.
  const storageRef = useRef(null);
  if (!storageRef.current) {
    const hasIdb = typeof indexedDB !== 'undefined';
    storageRef.current = createStorage({
      adapter: hasIdb ? idbAdapter() : memoryAdapter(),
      encode: (bitmap) => bitmap.toBlob(),
      decode: canvasBitmapFromBlob,
    });
  }
  const storage = storageRef.current;
  const autosaverRef = useRef(null);
  if (!autosaverRef.current) {
    autosaverRef.current = createAutosaver({
      save: async () => {
        const { project } = session.getState();
        const rev = session.revision;
        const thumb = await thumbBlob(project).catch(() => null);
        const r = await storage.save(project, { thumb });
        if (r.ok) session.markSaved(rev);
        return r;
      },
      onStatus: setStatus,
    });
  }
  const autosaver = autosaverRef.current;

  const showNotice = useCallback((text) => {
    setNotice(text);
    window.clearTimeout(showNotice.t);
    showNotice.t = window.setTimeout(() => setNotice(''), 3200);
  }, []);

  // First load: reopen the last project, or start fresh.
  useEffect(() => {
    let alive = true;
    (async () => {
      const id = recall();
      if (id) {
        const r = await storage.load(id);
        if (alive && r.ok) { session.load(r.project); setStatus({ state: 'saved', at: Date.now() }); }
      }
      if (alive) setReady(true);
    })();
    return () => { alive = false; };
  }, [session, storage]);

  useEffect(() => {
    const unsub = session.subscribe((kind) => { if (kind === 'content' && session.isDirty) autosaver.touch(); });
    const unhook = flushOnHide(document, window, autosaver);
    return () => { unsub(); unhook(); autosaver.flush(); };
  }, [session, autosaver]);

  useEffect(() => { if (ready) remember(state.project.id); }, [ready, state.project.id]);

  // Playback.
  const playbackRef = useRef(null);
  if (!playbackRef.current) {
    playbackRef.current = createPlayback({
      getFrames: () => session.getState().project.frames,
      getFps: () => session.getState().project.fps,
      onFrame: (i) => session.setFrame(i),
      onStop: () => setPlaying(false),
    });
  }
  const playback = playbackRef.current;
  useEffect(() => () => playback.pause(), [playback]);

  const togglePlay = useCallback(() => {
    if (playback.isPlaying()) { playback.pause(); return; }
    const { project, frameIndex } = session.getState();
    const from = frameIndex >= project.frames.length - 1 && !playback.loop ? 0 : frameIndex;
    session.setFrame(from);
    playback.play(from);
    setPlaying(true);
  }, [playback, session]);

  const setLoop = (v) => { setLoopState(v); playback.setLoop(v); };

  const setTool = useCallback((next) => {
    // Each of brush, pixel and eraser remembers its own size.
    const prev = toolRef.current;
    if (['brush', 'pixel', 'eraser'].includes(prev.kind)) sizes.current[prev.kind] = prev.size;
    if (next.kind !== prev.kind && sizes.current[next.kind]) next = { ...next, size: sizes.current[next.kind] };
    setToolState(next);
  }, []);

  const pickKind = useCallback((kind) => setTool({ ...toolRef.current, kind }), [setTool]);

  // Keyboard.
  useEffect(() => {
    const typing = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    const down = (e) => {
      if (typing(e.target) || document.querySelector('.an-modal')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) { keys.current.space = true; keys.current.spaceUsed = false; }
        return;
      }
      const k = e.key.toLowerCase();
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) session.redo(); else session.undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); session.redo(); return; }
      if (mod || e.altKey) return;
      const t = toolRef.current;
      if (k === 'b') pickKind('brush');
      else if (k === 'p') pickKind('pixel');
      else if (k === 'e') pickKind('eraser');
      else if (k === 'g') pickKind('fill');
      else if (k === 'i') pickKind('pick');
      else if (k === 'h') pickKind('pan');
      else if (k === '[' || k === ']') {
        const step = Math.max(1, Math.round(t.size * 0.15));
        setTool({ ...t, size: Math.max(1, Math.min(200, t.size + (k === ']' ? step : -step))) });
      } else if (k === ',') session.stepFrame(-1);
      else if (k === '.') session.stepFrame(1);
      else if (k === 'n') { if (!playback.isPlaying()) session.addFrame(); }
      else return;
      e.preventDefault();
    };
    const up = (e) => {
      if (e.code !== 'Space') return;
      if (typing(e.target)) return;
      e.preventDefault();
      const used = keys.current.spaceUsed;
      keys.current.space = false;
      if (!used && !document.querySelector('.an-modal')) togglePlay();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [session, playback, pickKind, setTool, togglePlay]);

  const leave = async () => {
    playback.pause();
    await autosaver.flush();
    if (window.history.length > 1) navigate(-1); else navigate('/');
  };

  const switchTo = async (fn) => {
    playback.pause();
    await autosaver.flush();
    fn();
    setDialog(null);
  };

  const newProject = (w, h, name) => switchTo(() => {
    session.load(createProject({ width: w, height: h, fps: 12, name: name.trim() || 'Untitled' }));
    autosaver.touch();
  });

  const openProject = (id) => switchTo(async () => {
    const r = await storage.load(id);
    if (r.ok) { session.load(r.project); setStatus({ state: 'saved', at: Date.now() }); } else showNotice(r.error);
  });

  return (
    <div className="animator" data-ready={ready}>
      <TopBar state={state} status={status} onExit={leave} onDialog={setDialog} onUndo={() => session.undo()} onRedo={() => session.redo()}
        onName={(n) => session.setName(n)} toolsOpen={toolsOpen} layersOpen={layersOpen}
        onToggleTools={() => { setToolsOpen(o => !o); setLayersOpen(false); }} onToggleLayers={() => { setLayersOpen(o => !o); setToolsOpen(false); }} />
      <aside className={`an-panel an-left${toolsOpen ? ' is-open' : ''}`} aria-label="Tools">
        <Toolbar tool={tool} onChange={setTool} />
      </aside>
      <main className="an-center">
        <Stage session={session} tool={tool} onion={onion} playing={playing} keys={keys} onPause={() => playback.pause()}
          onPickColour={(colour) => setTool({ ...toolRef.current, colour })} onNotice={showNotice} />
        {notice && <div className="an-notice" role="status">{notice}</div>}
        {!ready && <div className="an-notice">Opening...</div>}
      </main>
      <aside className={`an-panel an-right${layersOpen ? ' is-open' : ''}`} aria-label="Layers">
        <LayersPanel session={session} state={state} />
      </aside>
      <Timeline session={session} state={state} playing={playing} loop={loop} onion={onion}
        onTogglePlay={togglePlay} onLoop={setLoop} onOnion={setOnion} />
      {dialog === 'new' && <SizeDialog mode="new" project={state.project} onClose={() => setDialog(null)} onApply={newProject} />}
      {dialog === 'resize' && <SizeDialog mode="resize" project={state.project} onClose={() => setDialog(null)}
        onApply={(w, h) => { session.resize(w, h); setDialog(null); }} />}
      {dialog === 'open' && <OpenDialog storage={storage} currentId={state.project.id} onClose={() => setDialog(null)} onOpen={openProject} />}
      {dialog === 'export' && <ExportDialog session={session} onClose={() => setDialog(null)} />}
    </div>
  );
}
