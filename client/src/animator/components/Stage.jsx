import { useCallback, useEffect, useRef, useState } from 'react';
import GridButton from '../../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/GridButton.jsx';
import { fitView, panBy, renderStage, sampleFrame, screenToDoc, zoomAbout } from '../engine/compositor.js';
import { hexToRgba, rgbaToHex } from '../engine/bitmap.js';
import { readPressure } from '../engine/brush.js';

const PEN_GRACE_MS = 4000;   // after a pen was seen, touch pans and zooms instead of drawing

/**
 * The drawing surface: one canvas that fills its box, showing the document at
 * the current zoom and pan, and turning Pointer Events into strokes, fills,
 * colour picks, pans and pinch gestures.
 *
 * Props: session, tool (current settings), onion (0..3), playing, keys (a ref
 * shared with the page: { space, spaceUsed }), onPickColour(hex), onNotice(text), onPause().
 */
export default function Stage({ session, tool, onion, playing, keys, onPickColour, onNotice, onPause }) {
  const box = useRef(null);
  const canvas = useRef(null);
  const view = useRef({ zoom: 1, x: 0, y: 0 });
  const moved = useRef(false);             // the user has zoomed or panned, so do not refit on resize
  const size = useRef({ w: 0, h: 0 });
  const pointers = useRef(new Map());
  const mode = useRef(null);
  const penAt = useRef(0);
  const frame = useRef(0);
  const live = useRef(null);               // the stroke in progress
  const props = useRef({});
  props.current = { tool, onion, playing, onPickColour, onNotice, onPause };
  const lastSize = useRef('');
  const [zoomPct, setZoomPct] = useState(100);

  const draw = useCallback(() => {
    frame.current = 0;
    const c = canvas.current;
    if (!c || !size.current.w) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(size.current.w * dpr), h = Math.round(size.current.h * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const { project, frameIndex } = session.getState();
    const stroke = live.current;
    const overlay = stroke ? { frameId: stroke.frameId, layerId: stroke.layerId, ...stroke.overlay() } : null;
    renderStage(c, project, frameIndex, view.current, { onion: props.current.playing ? 0 : props.current.onion, overlay, dpr });
  }, [session]);

  const schedule = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(draw);
  }, [draw]);

  const setView = useCallback((v, user = true) => {
    view.current = v;
    if (user) moved.current = true;
    setZoomPct(Math.round(v.zoom * 100));
    schedule();
  }, [schedule]);

  const fit = useCallback(() => {
    const { project } = session.getState();
    lastSize.current = `${project.id}:${project.width}x${project.height}`;
    moved.current = false;
    setView(fitView(size.current.w, size.current.h, project.width, project.height), false);
  }, [session, setView]);

  // Redraw on any session change; refit when the canvas size changes.
  useEffect(() => {
    const check = () => {
      const { project } = session.getState();
      const key = `${project.id}:${project.width}x${project.height}`;
      if (key !== lastSize.current && size.current.w) fit();
    };
    check();
    return session.subscribe(() => { check(); schedule(); });
  }, [session, schedule, fit]);
  useEffect(() => { schedule(); }, [onion, playing, schedule]);

  // Track the box size.
  useEffect(() => {
    const el = box.current;
    const measure = () => {
      const r = el.getBoundingClientRect();
      size.current = { w: Math.max(1, Math.floor(r.width)), h: Math.max(1, Math.floor(r.height)) };
      if (!moved.current) fit(); else schedule();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => { ro.disconnect(); if (frame.current) cancelAnimationFrame(frame.current); };
  }, [fit, schedule]);

  // Wheel zoom needs a non-passive listener to stop the page scrolling.
  useEffect(() => {
    const el = canvas.current;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015) * (e.deltaMode === 1 ? 16 : 1));
      setView(zoomAbout(view.current, k, e.clientX - r.left, e.clientY - r.top));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setView]);

  const local = (e) => {
    const r = canvas.current.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  };
  const docPoint = (e) => { const { sx, sy } = local(e); return screenToDoc(view.current, sx, sy); };

  const cancelDrawing = () => {
    if (mode.current && mode.current.type === 'draw') session.cancelStroke(mode.current.stroke);
    live.current = null;
  };

  const touches = () => [...pointers.current.values()].filter(p => p.type === 'touch');
  const penRecent = () => performance.now() - penAt.current < PEN_GRACE_MS;

  const pick = (e) => {
    const p = docPoint(e);
    const { project, frameIndex } = session.getState();
    const px = sampleFrame(project, frameIndex, p.x, p.y);
    if (px) props.current.onPickColour(rgbaToHex(px.r, px.g, px.b));
  };

  const onPointerDown = (e) => {
    const { sx, sy } = local(e);
    if (e.pointerType === 'pen') penAt.current = performance.now();
    pointers.current.set(e.pointerId, { x: sx, y: sy, type: e.pointerType });
    canvas.current.setPointerCapture?.(e.pointerId);

    if (e.pointerType === 'touch' && (touches().length >= 2 || penRecent())) {
      cancelDrawing();
      mode.current = { type: 'gesture' };
      return;
    }
    if (mode.current) return;     // one thing at a time
    const t = props.current.tool;
    const wantsPan = e.button === 1 || keys.current.space || t.kind === 'pan';
    if (wantsPan) {
      keys.current.spaceUsed = true;
      mode.current = { type: 'pan', id: e.pointerId, x: sx, y: sy };
      return;
    }
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (props.current.playing) { props.current.onPause(); return; }

    if (t.kind === 'pick') {
      mode.current = { type: 'pick', id: e.pointerId };
      pick(e);
      return;
    }
    if (!session.canDraw()) { props.current.onNotice('This layer is hidden. Show it to draw on it.'); return; }
    if (t.kind === 'fill') {
      const p = docPoint(e);
      session.fill(p.x, p.y, hexToRgba(t.colour, t.opacity / 100), 32);
      mode.current = { type: 'fill', id: e.pointerId };
      return;
    }
    const stroke = session.beginStroke({
      kind: t.kind, size: t.size, opacity: t.opacity / 100, hardness: t.hardness / 100, colour: t.colour, smoothing: t.smoothing / 100,
      pressureSize: true, pressureOpacity: true,
    });
    if (!stroke) return;
    live.current = stroke;
    mode.current = { type: 'draw', id: e.pointerId, stroke };
    const { pressure, pen } = readPressure(e);
    const p = docPoint(e);
    stroke.add(p.x, p.y, pressure, pen);
    schedule();
  };

  const onPointerMove = (e) => {
    const rec = pointers.current.get(e.pointerId);
    if (!rec) return;
    if (e.pointerType === 'pen') penAt.current = performance.now();
    const m = mode.current;
    const { sx, sy } = local(e);

    if (m && m.type === 'gesture') {
      const before = touches();
      const prevPts = before.map(p => ({ x: p.x, y: p.y }));
      rec.x = sx; rec.y = sy;
      const now = touches();
      if (now.length >= 2 && prevPts.length >= 2) {
        const c0 = { x: (prevPts[0].x + prevPts[1].x) / 2, y: (prevPts[0].y + prevPts[1].y) / 2 };
        const c1 = { x: (now[0].x + now[1].x) / 2, y: (now[0].y + now[1].y) / 2 };
        const d0 = Math.hypot(prevPts[0].x - prevPts[1].x, prevPts[0].y - prevPts[1].y);
        const d1 = Math.hypot(now[0].x - now[1].x, now[0].y - now[1].y);
        let v = panBy(view.current, c1.x - c0.x, c1.y - c0.y);
        if (d0 > 8) v = zoomAbout(v, d1 / d0, c1.x, c1.y);
        setView(v);
      } else if (now.length === 1) {
        setView(panBy(view.current, sx - prevPts[0].x, sy - prevPts[0].y));
      }
      return;
    }
    rec.x = sx; rec.y = sy;
    if (!m || m.id !== e.pointerId) return;
    if (m.type === 'pan') {
      setView(panBy(view.current, sx - m.x, sy - m.y));
      m.x = sx; m.y = sy;
    } else if (m.type === 'draw') {
      const events = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
      for (const ev of events.length ? events : [e]) {
        const { pressure, pen } = readPressure(ev);
        const p = docPoint(ev);
        m.stroke.add(p.x, p.y, pressure, pen);
      }
      schedule();
    } else if (m.type === 'pick') {
      pick(e);
    }
  };

  const onPointerUp = (e) => {
    const m = mode.current;
    pointers.current.delete(e.pointerId);
    if (m && m.type === 'gesture') {
      if (touches().length === 0) mode.current = null;
      return;
    }
    if (!m || m.id !== e.pointerId) return;
    if (m.type === 'draw') {
      if (e.type === 'pointercancel') session.cancelStroke(m.stroke); else session.endStroke(m.stroke);
      live.current = null;
    }
    mode.current = null;
    schedule();
  };

  const cursor = tool.kind === 'pan' ? 'grab' : 'crosshair';
  return (
    <div className="an-stage" ref={box}>
      <canvas ref={canvas} className="an-canvas" style={{ cursor }} aria-label="Drawing canvas" role="img"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onContextMenu={e => e.preventDefault()} />
      <div className="an-zoom">
        <GridButton text="Fit" label="Fit the drawing in the window" onClick={fit} />
        <GridButton text="100%" label="Zoom to actual size" onClick={() => {
          const r = size.current;
          setView(zoomAbout(view.current, 1 / view.current.zoom, r.w / 2, r.h / 2));
        }} />
        <span className="an-zoom-pct" aria-live="off">{zoomPct}%</span>
      </div>
    </div>
  );
}
