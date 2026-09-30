import { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { BASE_URL, IMAGES_BASE_URL } from '../../../../../../config.js';
import { normaliseUploadResponse, describeUploadError } from '../../../../../../utils/responsiveImage.js';
import {
  TILE, SCALE, LIMITS, GRID_TEXTURES, LAYER_NAMES, normaliseGrid, slotsPerRow, slotWidth, rowChars,
  setChar, convertMode, resizeText, renderGrid, pixelatePhoto, textureImage,
  tileKey, rectTiles, combineSelection, orderedTiles, selectionSlots,
} from './tileGrid.js';
import GlyphEditor from './GlyphEditor.jsx';
import './TileGrid.css';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** An offscreen canvas at grid resolution, for the paint layer. */
function blankPaint(d) {
  const c = document.createElement('canvas');
  c.width = d.cols * TILE;
  c.height = d.rows * TILE;
  return c;
}

const EMPTY = new Set();

/** Bounding box of a set of tiles. */
function boundsOf(selection) {
  const tiles = orderedTiles(selection);
  return {
    r0: Math.min(...tiles.map(t => t.r)), r1: Math.max(...tiles.map(t => t.r)),
    c0: Math.min(...tiles.map(t => t.c)), c1: Math.max(...tiles.map(t => t.c)),
  };
}

/**
 * The tile grid designer: text on tiles, pixel painting, a photo, background
 * textures and layer order. Used inside posts (TileGridNode) and on profiles,
 * so it knows nothing about where its data is stored — it reports changes
 * through onChange(patch).
 *
 * @param {object}   props.data      grid data (normalised here)
 * @param {Function} props.onChange  called with the fields that changed
 * @param {boolean}  props.editable  whether the owner can edit it
 * @param {Function} [props.onMoveUp] [props.onMoveDown] [props.onDelete]  block controls
 * @param {boolean}  [props.startEditing]
 */
export default function TileGrid({ data: rawData, onChange, editable, onMoveUp, onMoveDown, onDelete, startEditing = false }) {
  const data = normaliseGrid(rawData);

  // The latest data, updated synchronously on every change. Keystrokes can
  // arrive faster than a re-render, and each has to build on the one before.
  const dataRef = useRef(data);
  dataRef.current = data;
  const change = useCallback((patch) => {
    dataRef.current = normaliseGrid({ ...dataRef.current, ...patch });
    onChange(patch);
  }, [onChange]);

  const canvasRef = useRef(null);
  const paintRef = useRef(null);
  const photoRef = useRef(null);
  const textureRef = useRef(null);
  const typeRef = useRef(null);
  const clipboard = useRef(null);
  const [, redraw] = useState(0);
  const bump = () => redraw(n => n + 1);

  const [editing, setEditing] = useState(startEditing);
  const [tool, setTool] = useState('text');
  const [paintColor, setPaintColor] = useState('#ffffff');
  const cursorRef = useRef({ r: 0, s: 0 });
  const [cursor, setCursorState] = useState({ r: 0, s: 0 });
  const setCursor = (c) => { cursorRef.current = c; setCursorState(c); };
  // Any set of tiles, as "r,c" keys. Shift-drag adds, Alt-drag removes.
  const [selection, setSelectionState] = useState(EMPTY);
  const selectionRef = useRef(EMPTY);
  const setSelection = (s) => { selectionRef.current = s; setSelectionState(s); };
  const [moveBy, setMoveBy] = useState(null);
  const [glyphOpen, setGlyphOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  // ── Layers from the stored data ────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    const c = blankPaint(data);
    if (!data.paint) { paintRef.current = c; bump(); return; }
    loadImage(data.paint).then(img => {
      if (cancelled) return;
      c.getContext('2d').drawImage(img, 0, 0);
      paintRef.current = c;
      bump();
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [data.paint, data.cols, data.rows]);

  useEffect(() => {
    let cancelled = false;
    if (!data.image) { photoRef.current = null; bump(); return; }
    loadImage(IMAGES_BASE_URL + data.image.src).then(img => {
      if (cancelled) return;
      photoRef.current = pixelatePhoto(img, data);
      bump();
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [data.image?.src, data.image?.scale, data.cols, data.rows]);

  useEffect(() => {
    let cancelled = false;
    textureImage(data.texture).then(img => { if (!cancelled) { textureRef.current = img; bump(); } });
    return () => { cancelled = true; };
  }, [data.texture]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = data.cols * TILE * SCALE;
    canvas.height = data.rows * TILE * SCALE;
    const draw = () => renderGrid(canvas.getContext('2d'), data, {
      photo: photoRef.current,
      paint: paintRef.current,
      texture: textureRef.current,
      cursor: editing && tool === 'text' && !selection.size ? cursor : null,
      selection: editing ? selection : null,
      moveBy,
      showGrid: editing,
    });
    draw();
    document.fonts?.ready?.then(draw).catch(() => {});
  });

  // ── Pointer ────────────────────────────────────────────────────────────────

  const toGrid = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const d = dataRef.current;
    const x = Math.min(d.cols * TILE - 1, Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * d.cols * TILE)));
    const y = Math.min(d.rows * TILE - 1, Math.max(0, Math.floor(((e.clientY - rect.top) / rect.height) * d.rows * TILE)));
    return { x, y, tile: { r: Math.floor(y / TILE), c: Math.floor(x / TILE) } };
  };

  // { kind: 'paint', last } | { kind: 'select', anchor, base, mode, moved } | { kind: 'move', anchor }
  const gesture = useRef(null);

  const paintAt = (x, y) => {
    const ctx = paintRef.current?.getContext('2d');
    if (!ctx) return;
    const [px, py, size] = tool === 'tile'
      ? [Math.floor(x / TILE) * TILE, Math.floor(y / TILE) * TILE, TILE]
      : [x, y, 1];
    if (tool === 'erase') ctx.clearRect(px, py, size, size);
    else { ctx.fillStyle = paintColor; ctx.fillRect(px, py, size, size); }
  };

  /** Paints every point from the previous one to this, so a fast stroke has no gaps. */
  const strokeTo = (x, y) => {
    const from = gesture.current.last || { x, y };
    const steps = Math.max(Math.abs(x - from.x), Math.abs(y - from.y), 1);
    for (let i = 1; i <= steps; i++) {
      paintAt(Math.round(from.x + ((x - from.x) * i) / steps), Math.round(from.y + ((y - from.y) * i) / steps));
    }
    gesture.current.last = { x, y };
    bump();
  };

  const onPointerDown = (e) => {
    if (!editing) return;
    const p = toGrid(e);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (tool === 'text' || tool === 'select') {
      const sel = selectionRef.current;
      const mode = e.shiftKey ? 'add' : e.altKey ? 'remove' : 'replace';
      // Grabbing a selected tile with no modifier drags the selection along.
      if (mode === 'replace' && sel.has(tileKey(p.tile.r, p.tile.c))) {
        gesture.current = { kind: 'move', anchor: p.tile };
        setMoveBy({ r: 0, c: 0 });
        return;
      }
      gesture.current = { kind: 'select', anchor: p.tile, base: sel, mode, moved: false };
      if (mode === 'replace') setSelection(EMPTY);
      if (tool === 'text' && mode === 'replace') {
        const d = dataRef.current;
        setCursor({ r: p.tile.r, s: Math.min(slotsPerRow(d) - 1, Math.floor(p.x / slotWidth(d))) });
      }
      return;
    }
    gesture.current = { kind: 'paint', last: null };
    strokeTo(p.x, p.y);
  };

  const onPointerMove = (e) => {
    const g = gesture.current;
    if (!g) return;
    const p = toGrid(e);
    if (g.kind === 'paint') { strokeTo(p.x, p.y); return; }
    if (g.kind === 'move') { setMoveBy({ r: p.tile.r - g.anchor.r, c: p.tile.c - g.anchor.c }); return; }
    if (g.moved || p.tile.r !== g.anchor.r || p.tile.c !== g.anchor.c || g.mode !== 'replace') {
      g.moved = true;
      setSelection(combineSelection(g.base, rectTiles(g.anchor, p.tile), g.mode));
    }
  };

  const onPointerUp = (e) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.kind === 'paint') { change({ paint: paintRef.current.toDataURL('image/png') }); return; }
    if (g.kind === 'move') {
      const p = toGrid(e);
      const by = { r: p.tile.r - g.anchor.r, c: p.tile.c - g.anchor.c };
      setMoveBy(null);
      if (by.r || by.c) moveSelection(by);
      typeRef.current?.focus();
      return;
    }
    // A single click with Shift or Alt still toggles that one tile.
    if (!g.moved && g.mode !== 'replace') {
      setSelection(combineSelection(g.base, [tileKey(g.anchor.r, g.anchor.c)], g.mode));
    }
    const sel = selectionRef.current;
    if (sel.size) {
      const first = orderedTiles(sel)[0];
      const perTile = dataRef.current.mode === 'half' ? 2 : 1;
      setCursor({ r: first.r, s: first.c * perTile });
    }
    typeRef.current?.focus();
  };

  // ── Typing: left to right, then down; inside the selection if there is one ─

  /** Where typing can go, in order: the selected tiles, or the whole grid. */
  const typingSlots = () => {
    const d = dataRef.current;
    if (selectionRef.current.size) return selectionSlots(d, selectionRef.current);
    const slots = [];
    for (let r = 0; r < d.rows; r++) for (let s = 0; s < slotsPerRow(d); s++) slots.push({ r, s });
    return slots;
  };

  const slotIndex = (slots, pos) => {
    const i = slots.findIndex(p => p.r === pos.r && p.s === pos.s);
    return i === -1 ? 0 : i;
  };

  const typeChars = (str) => {
    const slots = typingSlots();
    let i = slotIndex(slots, cursorRef.current);
    let text = dataRef.current.text;
    for (const ch of Array.from(str)) {
      if (ch === '\n' || ch === '\r') {
        const row = slots[i].r;
        const next = slots.findIndex((p, j) => j > i && p.r > row);
        if (next !== -1) i = next;
        continue;
      }
      const { r, s } = slots[i];
      text = setChar({ ...dataRef.current, text }, r, s, ch);
      if (i < slots.length - 1) i += 1;
    }
    change({ text });
    setCursor(slots[i]);
  };

  const onKeyDown = (e) => {
    const d = dataRef.current;
    const slots = typingSlots();
    const i = slotIndex(slots, cursorRef.current);
    const { r, s } = cursorRef.current;
    const n = slotsPerRow(d);
    const go = (nr, ns) => setCursor({ r: Math.max(0, Math.min(d.rows - 1, nr)), s: Math.max(0, Math.min(n - 1, ns)) });
    const mod = e.metaKey || e.ctrlKey;
    const hasSel = selectionRef.current.size > 0;
    const k = e.key.toLowerCase();
    if (mod && k === 'c') { copySelection(); e.preventDefault(); return; }
    if (mod && k === 'x') { copySelection(); clearSelection(); e.preventDefault(); return; }
    if (mod && k === 'v') { pasteAt(); e.preventDefault(); return; }
    if (mod && k === 'a') { selectAll(); e.preventDefault(); return; }
    switch (e.key) {
      case 'ArrowLeft':  if (hasSel && e.altKey) moveSelection({ r: 0, c: -1 }); else hasSel ? setCursor(slots[Math.max(0, i - 1)]) : go(r, s - 1); break;
      case 'ArrowRight': if (hasSel && e.altKey) moveSelection({ r: 0, c: 1 });  else hasSel ? setCursor(slots[Math.min(slots.length - 1, i + 1)]) : go(r, s + 1); break;
      case 'ArrowUp':    if (hasSel && e.altKey) moveSelection({ r: -1, c: 0 }); else go(r - 1, s); break;
      case 'ArrowDown':  if (hasSel && e.altKey) moveSelection({ r: 1, c: 0 });  else go(r + 1, s); break;
      case 'Enter': typeChars('\n'); break;
      case 'Backspace':
        if (hasSel && i === 0) { clearSelection(); break; }
        if (i > 0) {
          const prev = slots[i - 1];
          change({ text: setChar(d, prev.r, prev.s, ' ') });
          setCursor(prev);
        }
        break;
      case 'Delete':
        if (hasSel) clearSelection();
        else change({ text: setChar(d, r, s, ' ') });
        break;
      case 'Escape':
        if (hasSel) setSelection(EMPTY); else typeRef.current?.blur();
        break;
      default: return;   // printable keys arrive through onInput
    }
    e.preventDefault();
  };

  const onInput = (e) => {
    const value = e.target.value;
    e.target.value = '';
    if (value) typeChars(value);
  };

  // ── Selection actions ──────────────────────────────────────────────────────

  const paintCtx = () => paintRef.current?.getContext('2d');
  const commitPaint = (patch = {}) => change({ ...patch, paint: paintRef.current.toDataURL('image/png') });

  const selectAll = () => {
    const d = dataRef.current;
    setSelection(new Set(rectTiles({ r: 0, c: 0 }, { r: d.rows - 1, c: d.cols - 1 })));
  };

  const fillSelection = () => {
    const ctx = paintCtx();
    if (!ctx || !selectionRef.current.size) return;
    ctx.fillStyle = paintColor;
    for (const { r, c } of orderedTiles(selectionRef.current)) ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
    commitPaint();
  };

  /** Removes text and paint from the selected tiles. */
  const clearSelection = () => {
    const sel = selectionRef.current;
    if (!sel.size) return;
    const d = dataRef.current;
    let text = d.text;
    for (const { r, s } of selectionSlots(d, sel)) text = setChar({ ...d, text }, r, s, ' ');
    const ctx = paintCtx();
    if (ctx) {
      for (const { r, c } of orderedTiles(sel)) ctx.clearRect(c * TILE, r * TILE, TILE, TILE);
      commitPaint({ text });
    } else {
      change({ text });
    }
  };

  /** Each selected tile's characters and pixels, relative to the selection's corner. */
  const captureSelection = (sel) => {
    const d = dataRef.current;
    const perTile = d.mode === 'half' ? 2 : 1;
    const box = boundsOf(sel);
    const ctx = paintCtx();
    return {
      perTile,
      tiles: orderedTiles(sel).map(({ r, c }) => ({
        dr: r - box.r0,
        dc: c - box.c0,
        chars: rowChars(d, r).slice(c * perTile, (c + 1) * perTile),
        pixels: ctx ? ctx.getImageData(c * TILE, r * TILE, TILE, TILE) : null,
      })),
    };
  };

  /** Writes captured tiles with their corner at (top, left); returns the new text. */
  const stamp = (clip, top, left, text) => {
    const d = dataRef.current;
    const perTile = d.mode === 'half' ? 2 : 1;
    const ctx = paintCtx();
    const placed = new Set();
    for (const t of clip.tiles) {
      const r = top + t.dr, c = left + t.dc;
      if (r < 0 || c < 0 || r >= d.rows || c >= d.cols) continue;
      placed.add(tileKey(r, c));
      for (let i = 0; i < perTile; i++) text = setChar({ ...d, text }, r, c * perTile + i, t.chars[i] ?? ' ');
      if (ctx && t.pixels) ctx.putImageData(t.pixels, c * TILE, r * TILE);
    }
    return { text, placed };
  };

  const copySelection = () => {
    if (selectionRef.current.size) clipboard.current = captureSelection(selectionRef.current);
  };

  const pasteAt = () => {
    const clip = clipboard.current;
    if (!clip) return;
    const d = dataRef.current;
    const perTile = d.mode === 'half' ? 2 : 1;
    const sel = selectionRef.current;
    const corner = sel.size ? boundsOf(sel) : { r0: cursorRef.current.r, c0: Math.floor(cursorRef.current.s / perTile) };
    const { text, placed } = stamp(clip, corner.r0, corner.c0, d.text);
    if (paintRef.current) commitPaint({ text }); else change({ text });
    setSelection(placed);
  };

  /** Lifts the selected tiles and sets them down `by` tiles away. */
  const moveSelection = (by) => {
    const sel = selectionRef.current;
    if (!sel.size) return;
    const clip = captureSelection(sel);
    const box = boundsOf(sel);
    // Clear the old spot first, so a move onto an overlapping area is correct.
    const d = dataRef.current;
    let text = d.text;
    for (const { r, s } of selectionSlots(d, sel)) text = setChar({ ...d, text }, r, s, ' ');
    const ctx = paintCtx();
    if (ctx) for (const { r, c } of orderedTiles(sel)) ctx.clearRect(c * TILE, r * TILE, TILE, TILE);
    const res = stamp(clip, box.r0 + by.r, box.c0 + by.c, text);
    if (paintRef.current) commitPaint({ text: res.text }); else change({ text: res.text });
    setSelection(res.placed);
    const first = orderedTiles(res.placed)[0];
    if (first) setCursor({ r: first.r, s: first.c * (d.mode === 'half' ? 2 : 1) });
  };

  // ── Settings ───────────────────────────────────────────────────────────────

  const setSize = (cols, rows) => {
    const d = dataRef.current;
    cols = Math.min(LIMITS.maxCols, Math.max(LIMITS.minCols, cols || 1));
    rows = Math.min(LIMITS.maxRows, Math.max(LIMITS.minRows, rows || 1));
    const next = { cols, rows, text: resizeText(d, cols, rows) };
    if (paintRef.current) {
      const c = blankPaint({ cols, rows });
      c.getContext('2d').drawImage(paintRef.current, 0, 0);
      next.paint = c.toDataURL('image/png');
    }
    setSelection(EMPTY);
    setCursor({ r: Math.min(cursorRef.current.r, rows - 1), s: 0 });
    change(next);
  };

  const setMode = (mode) => {
    change({ mode, text: convertMode(dataRef.current, mode) });
    setCursor({ r: cursorRef.current.r, s: 0 });
  };

  const moveLayer = (index, delta) => {
    const layers = dataRef.current.layers.slice();
    const j = index + delta;
    if (j < 0 || j >= layers.length) return;
    [layers[index], layers[j]] = [layers[j], layers[index]];
    change({ layers });
  };

  const onPhoto = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await axios.post(BASE_URL + '/api/upload', form, { withCredentials: true });
      change({ image: { src: normaliseUploadResponse(response.data).url, scale: 1 } });
    } catch (err) {
      alert(describeUploadError(err));
    } finally {
      setUploading(false);
    }
  };

  const clearPaint = () => {
    paintRef.current = blankPaint(dataRef.current);
    change({ paint: null });
  };

  const aspect = `${data.cols * TILE} / ${data.rows * TILE}`;
  const canvasCursor = !editing ? 'default' : tool === 'text' ? 'text' : tool === 'select' ? 'cell' : 'crosshair';
  const hint = {
    text: 'Click a tile and type, left to right then down. Drag to select; typing then fills the selection.',
    select: 'Drag to select tiles. Shift adds, Alt removes. Drag a selection to move it; Alt + arrows nudge it.',
    pixel: 'Drag to paint single pixels.',
    tile: 'Drag to paint whole tiles.',
    erase: 'Drag to erase paint.',
  }[tool];

  return (
    <div className={`tilegrid${editing ? ' tilegrid--editing' : ''}`}>
      <canvas
        ref={canvasRef}
        className="tilegrid-canvas"
        style={{ aspectRatio: aspect, cursor: canvasCursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="img"
        aria-label={data.text.join(' ').trim() || 'Tile grid'}
      />

      {editing && (
        <textarea
          ref={typeRef}
          className="tilegrid-typing"
          aria-label="Type into the grid"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onKeyDown={onKeyDown}
          onInput={onInput}
        />
      )}

      {editable && !editing && (
        <div className="tilegrid-controls">
          {onMoveUp && <button type="button" onMouseDown={e => { e.preventDefault(); onMoveUp(); }} title="Move up">↑</button>}
          {onMoveDown && <button type="button" onMouseDown={e => { e.preventDefault(); onMoveDown(); }} title="Move down">↓</button>}
          <button type="button" onMouseDown={e => { e.preventDefault(); setEditing(true); }}>Edit grid</button>
          {onDelete && <button type="button" className="tilegrid-danger" onMouseDown={e => { e.preventDefault(); onDelete(); }}>Delete</button>}
        </div>
      )}

      {editing && (
        <div className="tilegrid-panel">
          <div className="tilegrid-row">
            <span className="tilegrid-label">Tool</span>
            {[['text', 'Text'], ['select', 'Select'], ['pixel', 'Pixel'], ['tile', 'Tile'], ['erase', 'Erase']].map(([id, label]) => (
              <button key={id} type="button" aria-pressed={tool === id}
                className={tool === id ? 'is-on' : ''} onClick={() => setTool(id)}>{label}</button>
            ))}
            <input type="color" value={paintColor} onChange={e => setPaintColor(e.target.value)} title="Paint colour" />
            <button type="button" onClick={clearPaint} title="Remove all painted pixels">Clear paint</button>
          </div>

          <div className="tilegrid-row tilegrid-row--selection">
            <span className="tilegrid-label">Select</span>
            <span className="tilegrid-hint">{selection.size ? `${selection.size} tile${selection.size === 1 ? '' : 's'}` : 'nothing'}</span>
            <button type="button" onClick={selectAll}>All</button>
            <button type="button" onClick={fillSelection} disabled={!selection.size}>Fill</button>
            <button type="button" onClick={clearSelection} disabled={!selection.size}>Delete</button>
            <button type="button" onClick={copySelection} disabled={!selection.size}>Copy</button>
            <button type="button" onClick={() => { copySelection(); clearSelection(); }} disabled={!selection.size}>Cut</button>
            <button type="button" onClick={pasteAt} disabled={!clipboard.current}>Paste</button>
            <button type="button" onClick={() => setSelection(EMPTY)} disabled={!selection.size}>Deselect</button>
          </div>

          <div className="tilegrid-row">
            <span className="tilegrid-label">Size</span>
            <label>W <input type="number" min={LIMITS.minCols} max={LIMITS.maxCols} value={data.cols}
              onChange={e => setSize(parseInt(e.target.value, 10), data.rows)} /></label>
            <label>H <input type="number" min={LIMITS.minRows} max={LIMITS.maxRows} value={data.rows}
              onChange={e => setSize(data.cols, parseInt(e.target.value, 10))} /></label>
            <span className="tilegrid-hint">tiles</span>
          </div>

          <div className="tilegrid-row">
            <span className="tilegrid-label">Text</span>
            <button type="button" className={data.mode === 'full' ? 'is-on' : ''} onClick={() => setMode('full')}
              title="One character per tile (full width)">1 char</button>
            <button type="button" className={data.mode === 'half' ? 'is-on' : ''} onClick={() => setMode('half')}
              title="Two characters per tile (half width)">Double char</button>
            <span className="tilegrid-sep" />
            <button type="button" className={data.font === 'pixel' ? 'is-on' : ''} onClick={() => change({ font: 'pixel' })}>Pixel font</button>
            <button type="button" className={data.font === 'smooth' ? 'is-on' : ''} onClick={() => change({ font: 'smooth' })}>Smooth font</button>
            <label title="Text colour">Ink <input type="color" value={data.fg} onChange={e => change({ fg: e.target.value })} /></label>
            <button type="button" onClick={() => setGlyphOpen(true)}>Custom characters…</button>
          </div>

          <div className="tilegrid-row">
            <span className="tilegrid-label">Back</span>
            <label title="Background colour">Colour <input type="color" value={data.bg} onChange={e => change({ bg: e.target.value })} /></label>
            <select value={data.texture} onChange={e => change({ texture: e.target.value })} aria-label="Background texture">
              {Object.entries(GRID_TEXTURES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>

          <div className="tilegrid-row">
            <span className="tilegrid-label">Layers</span>
            <span className="tilegrid-hint">bottom</span>
            {data.layers.map((layer, i) => (
              <span key={layer} className="tilegrid-layer">
                <button type="button" onClick={() => moveLayer(i, -1)} disabled={i === 0} aria-label={`Move ${LAYER_NAMES[layer]} down`}>‹</button>
                <span>{LAYER_NAMES[layer]}</span>
                <button type="button" onClick={() => moveLayer(i, 1)} disabled={i === data.layers.length - 1} aria-label={`Move ${LAYER_NAMES[layer]} up`}>›</button>
              </span>
            ))}
            <span className="tilegrid-hint">top</span>
          </div>

          <div className="tilegrid-row">
            <span className="tilegrid-label">Photo</span>
            <label className="tilegrid-file">
              {uploading ? 'Uploading…' : data.image ? 'Replace photo' : 'Import photo'}
              <input type="file" accept="image/*" disabled={uploading}
                onChange={e => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            {data.image && (
              <>
                <label className="tilegrid-scale">Scale
                  <input type="range" min="0.1" max="4" step="0.05" value={data.image.scale}
                    onChange={e => change({ image: { ...data.image, scale: parseFloat(e.target.value) } })} />
                  <span>{Math.round(data.image.scale * 100)}%</span>
                </label>
                <button type="button" onClick={() => change({ image: { ...data.image, scale: 1 } })}>Fit</button>
                <button type="button" onClick={() => change({ image: null })}>Remove</button>
              </>
            )}
          </div>

          <div className="tilegrid-row tilegrid-row--end">
            <span className="tilegrid-hint">{hint}</span>
            <button type="button" className="tilegrid-done" onClick={() => { setEditing(false); setSelection(EMPTY); }}>Done</button>
          </div>
        </div>
      )}

      {glyphOpen && (
        <GlyphEditor
          width={data.mode === 'half' ? 8 : 16}
          glyphs={data.glyphs}
          onChange={glyphs => change({ glyphs })}
          onClose={() => setGlyphOpen(false)}
        />
      )}
    </div>
  );
}
