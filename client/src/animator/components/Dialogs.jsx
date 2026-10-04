import { useEffect, useRef, useState } from 'react';
import GridButton from '../../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/GridButton.jsx';
import { LIMITS, sizeWarning } from '../engine/project.js';
import { downloadBlob, exportFramePng, exportPlan, exportProjectZip, extensionForMime, fileSafe, recordVideo, videoSupport } from '../engine/exporter.js';

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);
  return (
    <div className="an-modal" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="an-dialog" role="dialog" aria-modal="true" aria-label={title} onKeyDown={e => e.stopPropagation()}>
        <h2 className="an-dialog-title">{title}</h2>
        {children}
        <div className="an-row an-dialog-foot"><GridButton text="Close" label="Close" onClick={onClose} /></div>
      </div>
    </div>
  );
}

const PRESETS = [
  ['Square 1080', 1080, 1080], ['Wide 1920x1080', 1920, 1080], ['Tall 1080x1920', 1080, 1920],
  ['Small 512', 512, 512], ['Medium 1024', 1024, 1024], ['Large 2048', 2048, 2048],
];

/** New animation or change the canvas size: presets, or any size up to 4096 x 4096. */
export function SizeDialog({ mode, project, onApply, onClose }) {
  const [w, setW] = useState(String(mode === 'resize' ? project.width : 1080));
  const [h, setH] = useState(String(mode === 'resize' ? project.height : 1080));
  const [name, setName] = useState('Untitled');
  const wn = Number(w), hn = Number(h);
  const valid = Number.isInteger(wn) && Number.isInteger(hn) && wn >= 1 && hn >= 1 && wn <= LIMITS.maxSide && hn <= LIMITS.maxSide;
  const warn = valid ? sizeWarning(wn, hn) : null;
  return (
    <Modal title={mode === 'new' ? 'New animation' : 'Canvas size'} onClose={onClose}>
      {mode === 'new' && (
        <label className="an-field">Name
          <input className="an-input" value={name} maxLength={LIMITS.maxName} onChange={e => setName(e.target.value)} />
        </label>
      )}
      <div className="an-presets" role="group" aria-label="Size presets">
        {PRESETS.map(([label, pw, ph]) => (
          <GridButton key={label} text={label} label={`${label}: ${pw} by ${ph} pixels`} on={wn === pw && hn === ph}
            onClick={() => { setW(String(pw)); setH(String(ph)); }} />
        ))}
      </div>
      <div className="an-row an-fields">
        <label className="an-field">Width
          <input className="an-input an-num" inputMode="numeric" value={w} onChange={e => setW(e.target.value.replace(/\D/g, '').slice(0, 4))} />
        </label>
        <label className="an-field">Height
          <input className="an-input an-num" inputMode="numeric" value={h} onChange={e => setH(e.target.value.replace(/\D/g, '').slice(0, 4))} />
        </label>
        <span className="an-hint">pixels, 1 to {LIMITS.maxSide}</span>
      </div>
      {!valid && <p className="an-warn">Width and height must be whole numbers from 1 to {LIMITS.maxSide}.</p>}
      {warn && <p className="an-warn">{warn}</p>}
      {mode === 'resize' && <p className="an-hint an-hint-block">The drawing stays the same size and is centred. Anything outside the new size is cut off. You can undo this.</p>}
      <div className="an-row">
        <GridButton text={mode === 'new' ? 'Create' : 'Resize'} label={mode === 'new' ? 'Create the animation' : 'Resize the canvas'} disabled={!valid}
          onClick={() => onApply(wn, hn, name)} />
      </div>
    </Modal>
  );
}

/** Saved animations on this device. */
export function OpenDialog({ storage, currentId, onOpen, onClose }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [sure, setSure] = useState(null);
  const urls = useRef([]);

  const refresh = async () => {
    const r = await storage.list();
    if (!r.ok) setError(r.error);
    urls.current.forEach(u => URL.revokeObjectURL(u));
    urls.current = [];
    setList(r.projects.map(p => {
      let thumbUrl = null;
      if (p.thumb) { try { thumbUrl = URL.createObjectURL(p.thumb); urls.current.push(thumbUrl); } catch { /* no preview */ } }
      return { ...p, thumbUrl };
    }));
  };
  useEffect(() => {
    refresh();
    const held = urls;
    return () => held.current.forEach(u => URL.revokeObjectURL(u));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Modal title="Open an animation" onClose={onClose}>
      {error && <p className="an-warn">{error}</p>}
      {list === null && <p className="an-hint">Looking...</p>}
      {list && list.length === 0 && <p className="an-hint">Nothing saved on this device yet. Your work saves itself as you draw.</p>}
      <ul className="an-projects">
        {(list || []).map(p => (
          <li key={p.id} className="an-project">
            {p.thumbUrl ? <img src={p.thumbUrl} alt="" /> : <span className="an-project-blank" />}
            <span className="an-project-info">
              <strong>{p.name || 'Untitled'}</strong>
              <span>{p.width} x {p.height}, {p.frames} {p.frames === 1 ? 'frame' : 'frames'}, {p.fps} fps</span>
              <span>{p.savedAt ? new Date(p.savedAt).toLocaleString() : ''}{p.id === currentId ? ' (open now)' : ''}</span>
            </span>
            <GridButton text="Open" label={`Open ${p.name || 'Untitled'}`} onClick={() => onOpen(p.id)} />
            {sure === p.id ? (
              <GridButton text="Really delete?" label={`Confirm: delete ${p.name || 'Untitled'} from this device`} onClick={async () => { await storage.remove(p.id); setSure(null); refresh(); }} />
            ) : (
              <GridButton symbol="cross" label={`Delete ${p.name || 'Untitled'} from this device`} onClick={() => setSure(p.id)} />
            )}
          </li>
        ))}
      </ul>
      <p className="an-hint an-hint-block">Projects live in this browser only. Clearing site data removes them, so export a zip to keep a copy.</p>
    </Modal>
  );
}

/** Export: video, this frame as PNG, or the project as a zip. */
export function ExportDialog({ session, onClose }) {
  const { project, frameIndex } = session.getState();
  const support = videoSupport();
  const plan = exportPlan(project.frames, project.fps);
  const [busy, setBusy] = useState(null);
  const [progress, setProgress] = useState(0);
  const [msg, setMsg] = useState('');
  const abort = useRef(null);
  const base = fileSafe(project.name);

  const finish = (r, name) => {
    if (r.ok) { downloadBlob(r.blob, name); setMsg(`Saved ${name}.`); } else setMsg(r.error);
    setBusy(null);
  };

  const video = async () => {
    setBusy('video'); setProgress(0); setMsg('');
    abort.current = new AbortController();
    const r = await recordVideo(project, { onProgress: setProgress, signal: abort.current.signal });
    finish(r, `${base}.${r.ok ? extensionForMime(r.mime) : 'webm'}`);
  };

  return (
    <Modal title="Export" onClose={() => { if (abort.current) abort.current.abort(); onClose(); }}>
      <div className="an-export">
        <p className="an-hint an-hint-block">
          Video is recorded in real time: {(plan.totalMs / 1000).toFixed(1)} seconds of animation takes about that long to export. Keep this tab open.
          Transparent areas become white.
        </p>
        <div className="an-row">
          <GridButton text={support.recorder ? `Video (${/mp4/.test(support.recorder) ? 'MP4' : 'WebM'})` : 'Video'} label="Export the animation as a video file"
            disabled={!support.recorder || Boolean(busy)} onClick={video} />
          {busy === 'video' && <GridButton text="Cancel" label="Cancel the export" onClick={() => abort.current && abort.current.abort()} />}
        </div>
        {busy === 'video' && <progress className="an-progress" value={progress} max="1" aria-label="Export progress" />}
        {!support.recorder && <p className="an-warn">This browser cannot record video from a canvas. Export PNG frames or the zip instead.</p>}
        <div className="an-row">
          <GridButton text="This frame" label="Export the current frame as a PNG picture" disabled={Boolean(busy)}
            onClick={async () => finish(await exportFramePng(project, frameIndex), `${base}-${frameIndex + 1}.png`)} />
          <GridButton text="Project zip" label="Export the whole project as a zip of PNG pictures and a project file" disabled={Boolean(busy)}
            onClick={async () => { setBusy('zip'); setMsg(''); finish(await exportProjectZip(project), `${base}.zip`); }} />
        </div>
        {msg && <p className="an-hint an-hint-block" role="status">{msg}</p>}
      </div>
    </Modal>
  );
}
