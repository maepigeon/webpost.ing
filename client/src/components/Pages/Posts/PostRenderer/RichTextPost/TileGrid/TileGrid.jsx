import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { BASE_URL, IMAGES_BASE_URL } from '../../../../../../config.js';
import { normaliseUploadResponse, describeUploadError } from '../../../../../../utils/responsiveImage.js';
import {
  TILE, SCALE, LIMITS, FONT_NAMES, DIRECTIONS, normaliseGrid, pixelLayer, photoLayer,
  perTile, slotsPerRow, slotWidth, rowChars, writeSlot, restyleSlots, convertLayerMode, resizeLayerText,
  orderSlots, slotsIn, renderGrid, pixelatePhoto, tileKey, rectTiles, combineSelection, orderedTiles,
} from './tileGrid.js';
import { TEXTURES, fillTexture, texturePreview, DEFAULT_PAW_OPTIONS } from './textures.js';
import PawOptions from '../../../../../TileArt/PawOptions.jsx';
import GlyphEditor from './GlyphEditor.jsx';
import PixelIcon from './PixelIcon.jsx';
import './TileGrid.css';

const EMPTY = new Set();
const HISTORY_LIMIT = 60;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function blankCanvas(d) {
  const c = document.createElement('canvas');
  c.width = d.cols * TILE;
  c.height = d.rows * TILE;
  return c;
}

function boundsOf(selection) {
  const tiles = orderedTiles(selection);
  return {
    r0: Math.min(...tiles.map(t => t.r)), r1: Math.max(...tiles.map(t => t.r)),
    c0: Math.min(...tiles.map(t => t.c)), c1: Math.max(...tiles.map(t => t.c)),
  };
}

const allTiles = (d) => orderedTiles(new Set(rectTiles({ r: 0, c: 0 }, { r: d.rows - 1, c: d.cols - 1 })));

/** A square tile button with a pixel icon. */
function Tile({ icon, label, on, disabled, onClick }) {
  return (
    <button type="button" className={`tg-tile${on ? ' is-on' : ''}`}
      onClick={onClick} disabled={disabled} title={label} aria-label={label} aria-pressed={on || undefined}>
      <PixelIcon name={icon} size={14} />
    </button>
  );
}

/** Eight arrows around a centre; the four straight ones are bigger than the diagonals. */
function DirectionPad({ value, onChange }) {
  const cells = [
    ['up-left', 'arrowUpLeft'], ['up', 'arrowUp'], ['up-right', 'arrowUpRight'],
    ['left', 'arrowLeft'], null, ['right', 'arrowRight'],
    ['down-left', 'arrowDownLeft'], ['down', 'arrowDown'], ['down-right', 'arrowDownRight'],
  ];
  return (
    <div className="tg-dpad" role="radiogroup" aria-label="Typing direction">
      {cells.map((cell, i) => cell ? (
        <button key={cell[0]} type="button" role="radio" aria-checked={value === cell[0]}
          className={`tg-dpad-cell${value === cell[0] ? ' is-on' : ''}${cell[0].includes('-') ? ' is-diagonal' : ''}`}
          onClick={() => onChange(cell[0])} title={`Type ${cell[0].replace('-', ' and ')}`}>
          <PixelIcon name={cell[1]} size={cell[0].includes('-') ? 8 : 12} />
        </button>
      ) : <span key={i} className="tg-dpad-centre" aria-hidden="true" />)}
    </div>
  );
}

/**
 * The tile grid designer. Used inside posts (TileGridNode) and on profiles, so
 * it knows nothing about where its data lives: it reports each change as the
 * whole new grid through onChange(grid).
 */
export default function TileGrid({
  data: rawData, onChange, editable, onMoveUp, onMoveDown, onDelete, startEditing = false,
  maxCols = LIMITS.maxCols, maxRows = LIMITS.maxRows, onDone,
}) {
  const data = useMemo(() => normaliseGrid(rawData), [rawData]);

  // The latest grid, updated synchronously: keystrokes and pointer events can
  // arrive faster than a re-render, and each must build on the one before.
  const dataRef = useRef(data);
  dataRef.current = data;
  const past = useRef([]);
  const future = useRef([]);
  const [, setHistoryTick] = useState(0);

  const commit = useCallback((next) => {
    past.current.push(dataRef.current);
    if (past.current.length > HISTORY_LIMIT) past.current.shift();
    future.current = [];
    dataRef.current = next;
    onChange(next);
    setHistoryTick(n => n + 1);
  }, [onChange]);

  const undo = () => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(dataRef.current);
    dataRef.current = prev;
    onChange(prev);
    setHistoryTick(n => n + 1);
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(dataRef.current);
    dataRef.current = next;
    onChange(next);
    setHistoryTick(n => n + 1);
  };

  const canvasRef = useRef(null);
  const typeRef = useRef(null);
  const paints = useRef({});    // layer id → { src, canvas }
  const photos = useRef({});    // layer id → { key, photo }
  const clipboard = useRef(null);
  const [, redraw] = useState(0);
  const bump = () => redraw(n => n + 1);

  const [editing, setEditing] = useState(startEditing);
  const [tool, setTool] = useState('text');
  const [colour, setColour] = useState('#ffffff');
  const [font, setFont] = useState('pixel');
  const [direction, setDirection] = useState('right');
  const [activeId, setActiveId] = useState(() => data.layers[data.layers.length - 1].id);
  const cursorRef = useRef({ r: 0, s: 0 });
  const [cursor, setCursorState] = useState({ r: 0, s: 0 });
  const setCursor = (c) => { cursorRef.current = c; setCursorState(c); };
  const selectionRef = useRef(EMPTY);
  const [selection, setSelectionState] = useState(EMPTY);
  const setSelection = (s) => { selectionRef.current = s; setSelectionState(s); };
  const [moveBy, setMoveBy] = useState(null);
  const [panel, setPanel] = useState(null);   // 'texture' | 'glyphs' | null
  const [pawOptions, setPawOptions] = useState(DEFAULT_PAW_OPTIONS);
  const [uploading, setUploading] = useState(false);
  const [dragLayer, setDragLayer] = useState(null);

  const active = data.layers.find(l => l.id === activeId) || data.layers[data.layers.length - 1];
  useEffect(() => { if (active && active.id !== activeId) setActiveId(active.id); }, [active, activeId]);

  // ── Assets ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    for (const layer of data.layers) {
      if (layer.kind !== 'pixel') continue;
      const have = paints.current[layer.id];
      const sized = have && have.canvas.width === data.cols * TILE && have.canvas.height === data.rows * TILE;
      if (have && have.src === layer.paint && sized) continue;
      const canvas = blankCanvas(data);
      paints.current[layer.id] = { src: layer.paint, canvas };
      if (!layer.paint) continue;
      loadImage(layer.paint).then(img => {
        if (cancelled || paints.current[layer.id]?.canvas !== canvas) return;
        canvas.getContext('2d').drawImage(img, 0, 0);
        bump();
      }).catch(() => {});
    }
    for (const layer of data.layers) {
      if (layer.kind !== 'photo') continue;
      const key = `${layer.src}|${layer.scale}|${data.cols}|${data.rows}`;
      if (photos.current[layer.id]?.key === key) continue;
      photos.current[layer.id] = { key, photo: null };
      loadImage(IMAGES_BASE_URL + layer.src).then(img => {
        if (cancelled || photos.current[layer.id]?.key !== key) return;
        photos.current[layer.id].photo = pixelatePhoto(img, data, layer);
        bump();
      }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [data]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = data.cols * TILE * SCALE, h = data.rows * TILE * SCALE;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const assets = {};
    for (const l of data.layers) {
      if (l.kind === 'pixel') assets[l.id] = { paint: paints.current[l.id]?.canvas };
      else assets[l.id] = { photo: photos.current[l.id]?.photo };
    }
    const draw = () => renderGrid(canvas.getContext('2d'), data, assets, {
      cursor: editing && tool === 'text' && active?.kind === 'pixel' ? cursor : null,
      selection: editing ? selection : null,
      moveBy, activeId: active?.id,
      showGrid: editing,
    });
    draw();
    document.fonts?.ready?.then(draw).catch(() => {});
  });

  // ── Layer helpers ──────────────────────────────────────────────────────────

  const activeLayer = () => {
    const d = dataRef.current;
    return d.layers.find(l => l.id === activeId) || d.layers[d.layers.length - 1];
  };
  const withLayer = (d, id, fn) => ({ ...d, layers: d.layers.map(l => (l.id === id ? fn(l) : l)) });
  const paintCanvas = (id) => paints.current[id]?.canvas;
  /** Saves a layer's canvas back into the grid; returns the new grid. */
  const savePaint = (d, id) => {
    const canvas = paintCanvas(id);
    if (!canvas) return d;
    const src = canvas.toDataURL('image/png');
    paints.current[id] = { src, canvas };
    return withLayer(d, id, l => ({ ...l, paint: src }));
  };

  // ── Pointer ────────────────────────────────────────────────────────────────

  const toGrid = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const d = dataRef.current;
    const fx = ((e.clientX - rect.left) / rect.width) * d.cols * TILE;
    const fy = ((e.clientY - rect.top) / rect.height) * d.rows * TILE;
    const x = Math.min(d.cols * TILE - 1, Math.max(0, Math.floor(fx)));
    const y = Math.min(d.rows * TILE - 1, Math.max(0, Math.floor(fy)));
    return { x, y, fx, fy, tile: { r: Math.floor(y / TILE), c: Math.floor(x / TILE) } };
  };

  const gesture = useRef(null);

  const paintAt = (canvas, x, y) => {
    const ctx = canvas.getContext('2d');
    const [px, py, size] = tool === 'tile'
      ? [Math.floor(x / TILE) * TILE, Math.floor(y / TILE) * TILE, TILE]
      : [x, y, 1];
    if (tool === 'erase') ctx.clearRect(px, py, size, size);
    else { ctx.fillStyle = colour; ctx.fillRect(px, py, size, size); }
  };

  const strokeTo = (x, y) => {
    const g = gesture.current;
    const canvas = paintCanvas(g.layerId);
    if (!canvas) return;
    const from = g.last || { x, y };
    const steps = Math.max(Math.abs(x - from.x), Math.abs(y - from.y), 1);
    for (let i = 1; i <= steps; i++) {
      paintAt(canvas, Math.round(from.x + ((x - from.x) * i) / steps), Math.round(from.y + ((y - from.y) * i) / steps));
    }
    g.last = { x, y };
    bump();
  };

  const onPointerDown = (e) => {
    if (!editing) return;
    const p = toGrid(e);
    const layer = activeLayer();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const sel = selectionRef.current;

    // Dragging a selected tile, or anything with the move tool, carries it along.
    const onSelection = sel.has(tileKey(p.tile.r, p.tile.c)) && !e.shiftKey && !e.altKey;
    if (tool === 'move' || ((tool === 'select' || tool === 'text') && onSelection)) {
      gesture.current = { kind: 'move', start: p };
      setMoveBy({ r: 0, c: 0, px: 0, py: 0 });
      return;
    }
    if (tool === 'text' || tool === 'select') {
      const mode = e.shiftKey ? 'add' : e.altKey ? 'remove' : 'replace';
      gesture.current = { kind: 'select', anchor: p.tile, base: sel, mode, moved: false };
      if (mode === 'replace') setSelection(EMPTY);
      if (tool === 'text' && mode === 'replace') {
        const d = dataRef.current;
        setCursor({ r: p.tile.r, s: Math.min(slotsPerRow(d) - 1, Math.floor(p.x / slotWidth(d))) });
      }
      return;
    }
    if (tool === 'fill') {
      fillTiles(sel.size && sel.has(tileKey(p.tile.r, p.tile.c)) ? orderedTiles(sel) : [p.tile], colour);
      return;
    }
    if (layer.kind !== 'pixel') return;
    gesture.current = { kind: 'paint', layerId: layer.id, last: null };
    strokeTo(p.x, p.y);
  };

  const onPointerMove = (e) => {
    const g = gesture.current;
    if (!g) return;
    const p = toGrid(e);
    if (g.kind === 'paint') { strokeTo(p.x, p.y); return; }
    if (g.kind === 'move') {
      setMoveBy({
        r: p.tile.r - g.start.tile.r, c: p.tile.c - g.start.tile.c,
        px: Math.round(p.fx - g.start.fx), py: Math.round(p.fy - g.start.fy),
      });
      return;
    }
    if (g.moved || p.tile.r !== g.anchor.r || p.tile.c !== g.anchor.c || g.mode !== 'replace') {
      g.moved = true;
      setSelection(combineSelection(g.base, rectTiles(g.anchor, p.tile), g.mode));
    }
  };

  const onPointerUp = (e) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) { typeRef.current?.focus(); return; }
    if (g.kind === 'paint') {
      commit(savePaint(dataRef.current, g.layerId));
    } else if (g.kind === 'move') {
      const p = toGrid(e);
      setMoveBy(null);
      moveActive({
        r: p.tile.r - g.start.tile.r, c: p.tile.c - g.start.tile.c,
        px: Math.round(p.fx - g.start.fx), py: Math.round(p.fy - g.start.fy),
      });
    } else {
      if (!g.moved && g.mode !== 'replace') {
        setSelection(combineSelection(g.base, [tileKey(g.anchor.r, g.anchor.c)], g.mode));
      }
      if (selectionRef.current.size) setCursor(orderSlots(slotsIn(dataRef.current, selectionRef.current), direction)[0]);
    }
    typeRef.current?.focus();
  };

  // ── Content operations on the active layer ─────────────────────────────────

  const fillTiles = (tiles, fillColour) => {
    const layer = activeLayer();
    const canvas = layer.kind === 'pixel' && paintCanvas(layer.id);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = fillColour;
    for (const { r, c } of tiles) ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
    commit(savePaint(dataRef.current, layer.id));
  };

  const fillWithTexture = (kind) => {
    const layer = activeLayer();
    const canvas = layer.kind === 'pixel' && paintCanvas(layer.id);
    if (!canvas) return;
    const d = dataRef.current;
    const tiles = selectionRef.current.size ? orderedTiles(selectionRef.current) : allTiles(d);
    fillTexture(canvas, kind, tiles, TILE, kind === 'paws' ? pawOptions : undefined);
    commit(savePaint(d, layer.id));
    setPanel(null);
  };

  /** Each tile's characters, styles and pixels, relative to the selection's corner. */
  const capture = (sel, layer) => {
    const d = dataRef.current;
    const n = perTile(d);
    const box = boundsOf(sel);
    const ctx = paintCanvas(layer.id)?.getContext('2d');
    return {
      tiles: orderedTiles(sel).map(({ r, c }) => ({
        dr: r - box.r0, dc: c - box.c0,
        chars: rowChars(d, layer, r).slice(c * n, (c + 1) * n),
        styles: Array.from({ length: n }, (_, i) => layer.style[`${r},${c * n + i}`] || null),
        pixels: ctx ? ctx.getImageData(c * TILE, r * TILE, TILE, TILE) : null,
      })),
    };
  };

  const clearTiles = (d, layer, tiles) => {
    const n = perTile(d);
    let l = layer;
    for (const { r, c } of tiles) for (let i = 0; i < n; i++) l = writeSlot(d, l, r, c * n + i, ' ');
    const ctx = paintCanvas(layer.id)?.getContext('2d');
    if (ctx) for (const { r, c } of tiles) ctx.clearRect(c * TILE, r * TILE, TILE, TILE);
    return l;
  };

  const stamp = (d, layer, clip, top, left) => {
    const n = perTile(d);
    const ctx = paintCanvas(layer.id)?.getContext('2d');
    let l = layer;
    const placed = new Set();
    for (const t of clip.tiles) {
      const r = top + t.dr, c = left + t.dc;
      if (r < 0 || c < 0 || r >= d.rows || c >= d.cols) continue;
      placed.add(tileKey(r, c));
      for (let i = 0; i < n; i++) l = writeSlot(d, l, r, c * n + i, t.chars[i] ?? ' ', t.styles[i] || undefined);
      if (ctx && t.pixels) ctx.putImageData(t.pixels, c * TILE, r * TILE);
    }
    return { layer: l, placed };
  };

  const applyLayer = (d, layer) => {
    const next = withLayer(d, layer.id, () => layer);
    return paintCanvas(layer.id) ? savePaint(next, layer.id) : next;
  };

  /** Moves whatever is selected on the active layer — or the whole layer, or the photo. */
  const moveActive = (by) => {
    const d = dataRef.current;
    const layer = activeLayer();
    if (layer.kind === 'photo') {
      if (by.px || by.py) commit(withLayer(d, layer.id, l => ({ ...l, x: l.x + by.px, y: l.y + by.py })));
      return;
    }
    if (!by.r && !by.c) return;
    const sel = selectionRef.current.size ? selectionRef.current
      : new Set(rectTiles({ r: 0, c: 0 }, { r: d.rows - 1, c: d.cols - 1 }));
    const clip = capture(sel, layer);
    const box = boundsOf(sel);
    const res = stamp(d, clearTiles(d, layer, orderedTiles(sel)), clip, box.r0 + by.r, box.c0 + by.c);
    commit(applyLayer(d, res.layer));
    if (selectionRef.current.size) setSelection(res.placed);
  };

  const copySelection = () => {
    const layer = activeLayer();
    if (layer.kind === 'pixel' && selectionRef.current.size) clipboard.current = capture(selectionRef.current, layer);
  };

  const deleteSelection = () => {
    const d = dataRef.current;
    const layer = activeLayer();
    if (layer.kind !== 'pixel' || !selectionRef.current.size) return;
    commit(applyLayer(d, clearTiles(d, layer, orderedTiles(selectionRef.current))));
  };

  const paste = () => {
    const clip = clipboard.current;
    const layer = activeLayer();
    if (!clip || layer.kind !== 'pixel') return;
    const d = dataRef.current;
    const sel = selectionRef.current;
    const corner = sel.size ? boundsOf(sel) : { r0: cursorRef.current.r, c0: Math.floor(cursorRef.current.s / perTile(d)) };
    const res = stamp(d, layer, clip, corner.r0, corner.c0);
    commit(applyLayer(d, res.layer));
    setSelection(res.placed);
  };

  const selectAll = () => {
    const d = dataRef.current;
    setSelection(new Set(rectTiles({ r: 0, c: 0 }, { r: d.rows - 1, c: d.cols - 1 })));
  };

  // ── Typing ─────────────────────────────────────────────────────────────────

  const typingOrder = () => orderSlots(slotsIn(dataRef.current, selectionRef.current), direction);

  /** The first slot of the next line across the typing direction. */
  const nextLineIndex = (order, i) => {
    const [dr, ds] = DIRECTIONS[direction];
    const line = ({ r, s }) => (dr === 0 ? r : ds === 0 ? s : dr * ds > 0 ? s - r : s + r);
    const here = line(order[i]);
    const j = order.findIndex((p, k) => k > i && line(p) !== here);
    return j === -1 ? i : j;
  };

  const typeChars = (str) => {
    const layer = activeLayer();
    if (layer.kind !== 'pixel') return;
    const d = dataRef.current;
    const order = typingOrder();
    let i = Math.max(0, order.findIndex(p => p.r === cursorRef.current.r && p.s === cursorRef.current.s));
    let l = layer;
    for (const ch of Array.from(str)) {
      if (ch === '\n' || ch === '\r') { i = nextLineIndex(order, i); continue; }
      const { r, s } = order[i];
      l = writeSlot(d, l, r, s, ch, { font, color: colour });
      if (i < order.length - 1) i += 1;
    }
    commit(withLayer(d, layer.id, () => l));
    setCursor(order[i]);
  };

  const onKeyDown = (e) => {
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (mod && k === 'z') { e.shiftKey ? redo() : undo(); e.preventDefault(); return; }
    if (mod && k === 'y') { redo(); e.preventDefault(); return; }
    if (mod && k === 'c') { copySelection(); e.preventDefault(); return; }
    if (mod && k === 'x') { copySelection(); deleteSelection(); e.preventDefault(); return; }
    if (mod && k === 'v') { paste(); e.preventDefault(); return; }
    if (mod && k === 'a') { selectAll(); e.preventDefault(); return; }
    const d = dataRef.current;
    const hasSel = selectionRef.current.size > 0;
    const nudge = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
    if (nudge && (e.altKey || tool === 'move')) {
      moveActive({ r: nudge[0], c: nudge[1], px: nudge[1], py: nudge[0] });
      e.preventDefault();
      return;
    }
    if (nudge) {
      const { r, s } = cursorRef.current;
      setCursor({
        r: Math.max(0, Math.min(d.rows - 1, r + nudge[0])),
        s: Math.max(0, Math.min(slotsPerRow(d) - 1, s + nudge[1])),
      });
      e.preventDefault();
      return;
    }
    const order = typingOrder();
    const i = Math.max(0, order.findIndex(p => p.r === cursorRef.current.r && p.s === cursorRef.current.s));
    const layer = activeLayer();
    switch (e.key) {
      case 'Enter': typeChars('\n'); break;
      case 'Backspace': {
        if (hasSel && i === 0) { deleteSelection(); break; }
        if (layer.kind !== 'pixel' || i === 0) break;
        const prev = order[i - 1];
        commit(withLayer(d, layer.id, l => writeSlot(d, l, prev.r, prev.s, ' ')));
        setCursor(prev);
        break;
      }
      case 'Delete':
        if (hasSel) deleteSelection();
        else if (layer.kind === 'pixel') commit(withLayer(d, layer.id, l => writeSlot(d, l, cursorRef.current.r, cursorRef.current.s, ' ')));
        break;
      case 'Escape':
        if (hasSel) setSelection(EMPTY); else if (panel) setPanel(null); else typeRef.current?.blur();
        break;
      default: return;   // printable keys arrive through onInput
    }
    e.preventDefault();
  };

  const onInput = (e) => {
    const value = e.target.value;
    e.target.value = '';
    if (value && tool === 'text') typeChars(value);
  };

  // ── Style: font and colour apply to the selection, or the cursor ───────────

  const restyle = (style) => {
    const layer = activeLayer();
    if (layer.kind !== 'pixel') return;
    const d = dataRef.current;
    const slots = selectionRef.current.size ? slotsIn(d, selectionRef.current) : [cursorRef.current];
    const filled = slots.filter(({ r, s }) => rowChars(d, layer, r)[s] !== ' ');
    if (filled.length) commit(withLayer(d, layer.id, l => restyleSlots(l, filled, style)));
  };

  const chooseFont = (f) => { setFont(f); restyle({ font: f }); };
  const chooseColour = (c) => { setColour(c); if (tool === 'text') restyle({ color: c }); };

  // ── Grid settings ──────────────────────────────────────────────────────────

  const setSize = (cols, rows) => {
    const d = dataRef.current;
    cols = Math.min(maxCols, Math.max(LIMITS.minCols, cols || 1));
    rows = Math.min(maxRows, Math.max(LIMITS.minRows, rows || 1));
    const layers = d.layers.map(l => {
      if (l.kind !== 'pixel') return l;
      const resized = resizeLayerText(d, l, cols, rows);
      const old = paintCanvas(l.id);
      if (!old) return resized;
      const c = blankCanvas({ cols, rows });
      c.getContext('2d').drawImage(old, 0, 0);
      const src = c.toDataURL('image/png');
      paints.current[l.id] = { src, canvas: c };
      return { ...resized, paint: src };
    });
    setSelection(EMPTY);
    setCursor({ r: Math.min(cursorRef.current.r, rows - 1), s: 0 });
    commit({ ...d, cols, rows, layers });
  };

  const setMode = (mode) => {
    const d = dataRef.current;
    if (mode === d.mode) return;
    commit({ ...d, mode, layers: d.layers.map(l => convertLayerMode(d, l, mode)) });
    setCursor({ r: cursorRef.current.r, s: 0 });
  };

  // ── Layers ─────────────────────────────────────────────────────────────────

  const insertLayer = (layer) => {
    const d = dataRef.current;
    const at = d.layers.findIndex(l => l.id === activeLayer().id) + 1;
    const layers = d.layers.slice();
    layers.splice(at, 0, layer);
    commit({ ...d, layers });
    setActiveId(layer.id);
  };

  const addLayer = () => {
    if (dataRef.current.layers.length < LIMITS.maxLayers) insertLayer(pixelLayer(`Layer ${dataRef.current.layers.length + 1}`));
  };

  const deleteLayer = () => {
    const d = dataRef.current;
    if (d.layers.length <= LIMITS.minLayers) return;
    const id = activeLayer().id;
    const i = d.layers.findIndex(l => l.id === id);
    const layers = d.layers.filter(l => l.id !== id);
    commit({ ...d, layers });
    setActiveId(layers[Math.max(0, i - 1)].id);
  };

  const toggleVisible = (id) => commit(withLayer(dataRef.current, id, l => ({ ...l, visible: !l.visible })));

  const reorderLayer = (from, to) => {
    if (from === to) return;
    const d = dataRef.current;
    const layers = d.layers.slice();
    const [moved] = layers.splice(from, 1);
    layers.splice(to, 0, moved);
    commit({ ...d, layers });
  };

  /** Turns the active photo into pixels on its own layer, to edit it tile by tile. */
  const flattenPhoto = () => {
    const d = dataRef.current;
    const layer = activeLayer();
    const photo = layer.kind === 'photo' && photos.current[layer.id]?.photo;
    if (!photo) return;
    const c = blankCanvas(d);
    c.getContext('2d').drawImage(photo.canvas, photo.x + layer.x, photo.y + layer.y);
    const pixels = pixelLayer(layer.name, { paint: c.toDataURL('image/png') });
    commit({ ...d, layers: d.layers.map(l => (l.id === layer.id ? pixels : l)) });
    setActiveId(pixels.id);
  };

  const onPhoto = async (file) => {
    if (!file) return;
    if (dataRef.current.layers.length >= LIMITS.maxLayers) { alert(`A grid can have at most ${LIMITS.maxLayers} layers.`); return; }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await axios.post(BASE_URL + '/api/upload', form, { withCredentials: true });
      const name = file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Photo';
      insertLayer(photoLayer(normaliseUploadResponse(response.data).url, name));
      setTool('move');
    } catch (err) {
      alert(describeUploadError(err));
    } finally {
      setUploading(false);
    }
  };

  const texturePreviews = useMemo(() => (panel === 'texture'
    ? Object.fromEntries(Object.keys(TEXTURES).map(k => [k, texturePreview(k, 32, k === 'paws' ? pawOptions : undefined)])) : {}), [panel, pawOptions]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const aspect = `${data.cols * TILE} / ${data.rows * TILE}`;
  const canvasCursor = !editing ? 'default'
    : { text: 'text', select: 'cell', move: 'move', fill: 'copy' }[tool] || 'crosshair';
  const isPixel = active?.kind === 'pixel';
  const hasSel = selection.size > 0;
  const hint = !isPixel && !['move', 'select'].includes(tool)
    ? 'Photo layer: drag to move it, or flatten it to pixels to paint on it.'
    : {
      text: 'Click a tile and type. Drag to select tiles; typing then fills them.',
      select: 'Drag to select. Shift adds, Alt removes. Drag a selection to move it.',
      move: 'Drag to move the selection, or the whole layer. Arrow keys nudge.',
      pixel: 'Paint single pixels.', tile: 'Paint whole tiles.', erase: 'Erase to transparent.',
      fill: 'Click a tile, or the selection, to fill it.',
    }[tool];

  return (
    <div className={`tilegrid${editing ? ' tilegrid--editing' : ''}`}>
      <div className="tilegrid-stage">
        <canvas
          ref={canvasRef}
          className="tilegrid-canvas"
          style={{ aspectRatio: aspect, cursor: canvasCursor }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          role="img"
          aria-label={data.layers.flatMap(l => l.text || []).join(' ').trim() || 'Tile grid'}
        />
      </div>

      {editing && (
        <textarea ref={typeRef} className="tilegrid-typing" aria-label="Type into the grid"
          autoCapitalize="off" autoCorrect="off" spellCheck={false} onKeyDown={onKeyDown} onInput={onInput} />
      )}

      {editable && !editing && (
        <div className="tilegrid-controls">
          {onMoveUp && <Tile icon="arrowUp" label="Move block up" onClick={onMoveUp} />}
          {onMoveDown && <Tile icon="arrowDown" label="Move block down" onClick={onMoveDown} />}
          <button type="button" className="tg-text-btn" onClick={() => setEditing(true)}>Edit grid</button>
          {onDelete && <Tile icon="trash" label="Delete block" onClick={onDelete} />}
        </div>
      )}

      {editing && (
        <div className="tg-panel">
          <div className="tg-main">
            <div className="tg-group" aria-label="Tools">
              <Tile icon="text" label="Text: type on tiles" on={tool === 'text'} onClick={() => setTool('text')} />
              <Tile icon="select" label="Select tiles" on={tool === 'select'} onClick={() => setTool('select')} />
              <Tile icon="move" label="Move" on={tool === 'move'} onClick={() => setTool('move')} />
              <Tile icon="pixel" label="Paint pixels" on={tool === 'pixel'} onClick={() => setTool('pixel')} />
              <Tile icon="tile" label="Paint tiles" on={tool === 'tile'} onClick={() => setTool('tile')} />
              <Tile icon="erase" label="Erase" on={tool === 'erase'} onClick={() => setTool('erase')} />
              <Tile icon="fill" label="Fill" on={tool === 'fill'} onClick={() => setTool('fill')} />
              <label className="tg-swatch" title="Colour" style={{ background: colour }}>
                <input type="color" value={colour} onChange={e => chooseColour(e.target.value)} aria-label="Colour" />
              </label>
            </div>

            <div className="tg-group" aria-label="Edit">
              <Tile icon="undo" label="Undo (⌘Z)" onClick={undo} disabled={!past.current.length} />
              <Tile icon="redo" label="Redo (⇧⌘Z)" onClick={redo} disabled={!future.current.length} />
              <span className="tg-gap" />
              <Tile icon="all" label="Select all (⌘A)" onClick={selectAll} />
              <Tile icon="none" label="Deselect (Esc)" onClick={() => setSelection(EMPTY)} disabled={!hasSel} />
              <Tile icon="copy" label="Copy (⌘C)" onClick={copySelection} disabled={!hasSel || !isPixel} />
              <Tile icon="cut" label="Cut (⌘X)" onClick={() => { copySelection(); deleteSelection(); }} disabled={!hasSel || !isPixel} />
              <Tile icon="paste" label="Paste (⌘V)" onClick={paste} disabled={!clipboard.current || !isPixel} />
              <Tile icon="delete" label="Delete selection" onClick={deleteSelection} disabled={!hasSel || !isPixel} />
              <span className="tg-gap" />
              <Tile icon="texture" label="Fill with a texture" on={panel === 'texture'} disabled={!isPixel}
                onClick={() => setPanel(p => (p === 'texture' ? null : 'texture'))} />
              <label className={`tg-tile${uploading ? ' is-busy' : ''}`} title="Add a photo layer">
                <PixelIcon name="photo" size={14} />
                <input type="file" accept="image/*" disabled={uploading} aria-label="Add a photo layer"
                  onChange={e => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              <Tile icon="glyph" label="Custom characters" on={panel === 'glyphs'}
                onClick={() => setPanel(p => (p === 'glyphs' ? null : 'glyphs'))} />
            </div>

            <div className="tg-group tg-group--type" aria-label="Text">
              <Tile icon="one" label="One character per tile" on={data.mode === 'full'} onClick={() => setMode('full')} />
              <Tile icon="two" label="Two characters per tile" on={data.mode === 'half'} onClick={() => setMode('half')} />
              <span className="tg-gap" />
              <Tile icon="fontPixel" label={`${FONT_NAMES.pixel} font — for the selection or cursor`} on={font === 'pixel'} onClick={() => chooseFont('pixel')} />
              <Tile icon="fontSmooth" label={`${FONT_NAMES.smooth} font — for the selection or cursor`} on={font === 'smooth'} onClick={() => chooseFont('smooth')} />
              <span className="tg-gap" />
              <DirectionPad value={direction} onChange={setDirection} />
              <span className="tg-gap" />
              <label className="tg-size" title="Width in tiles">W
                <input type="number" min={LIMITS.minCols} max={maxCols} value={data.cols}
                  onChange={e => setSize(parseInt(e.target.value, 10), data.rows)} />
              </label>
              <label className="tg-size" title="Height in tiles">H
                <input type="number" min={LIMITS.minRows} max={maxRows} value={data.rows}
                  onChange={e => setSize(data.cols, parseInt(e.target.value, 10))} />
              </label>
            </div>

            {panel === 'texture' && (
              <div className="tg-textures" aria-label="Textures">
                <div className="tg-texture-options"><PawOptions value={pawOptions} onChange={setPawOptions} /></div>
                {Object.entries(TEXTURES).map(([k, t]) => (
                  <button key={k} type="button" className="tg-texture" onClick={() => fillWithTexture(k)}
                    title={`Fill ${hasSel ? 'the selection' : 'the layer'} with ${t.label.toLowerCase()}`}>
                    <img src={texturePreviews[k]} alt="" width="32" height="32" />
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            )}

            {active?.kind === 'photo' && (
              <div className="tg-photo">
                <label>Scale
                  <input type="range" min="0.1" max="4" step="0.05" value={active.scale}
                    onChange={e => commit(withLayer(dataRef.current, active.id, l => ({ ...l, scale: parseFloat(e.target.value) })))} />
                  <span>{Math.round(active.scale * 100)}%</span>
                </label>
                <button type="button" className="tg-text-btn" onClick={() => commit(withLayer(dataRef.current, active.id, l => ({ ...l, scale: 1, x: 0, y: 0 })))}>Fit</button>
                <button type="button" className="tg-text-btn" onClick={flattenPhoto}>Flatten to pixels</button>
              </div>
            )}

            <div className="tg-status">
              <span className="tg-hint">{hint}</span>
              {hasSel && <span className="tg-badge">{selection.size} tile{selection.size === 1 ? '' : 's'}</span>}
              <button type="button" className="tg-done" onClick={() => { setEditing(false); setSelection(EMPTY); setPanel(null); onDone?.(); }}>
                Done
              </button>
            </div>
          </div>

          <div className="tg-layers" aria-label="Layers">
            <div className="tg-layers-head">
              <span>Layers</span>
              <Tile icon="plus" label="Add layer" onClick={addLayer} disabled={data.layers.length >= LIMITS.maxLayers} />
              <Tile icon="trash" label="Delete layer" onClick={deleteLayer} disabled={data.layers.length <= LIMITS.minLayers} />
            </div>
            <ol className="tg-layer-list">
              {data.layers.map((l, index) => ({ l, index })).reverse().map(({ l, index }) => (
                <li key={l.id}
                  className={`tg-layer${l.id === active?.id ? ' is-active' : ''}${dragLayer === index ? ' is-dragging' : ''}`}
                  draggable
                  onDragStart={e => { setDragLayer(index); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); if (dragLayer !== null) reorderLayer(dragLayer, index); setDragLayer(null); }}
                  onDragEnd={() => setDragLayer(null)}
                  onClick={() => setActiveId(l.id)}>
                  <span className="tg-layer-grip" aria-hidden="true"><PixelIcon name="grip" size={10} /></span>
                  <button type="button" className="tg-layer-eye" onClick={e => { e.stopPropagation(); toggleVisible(l.id); }}
                    title={l.visible ? 'Hide layer' : 'Show layer'} aria-label={l.visible ? `Hide ${l.name}` : `Show ${l.name}`}>
                    <PixelIcon name={l.visible ? 'eye' : 'eyeOff'} size={12} />
                  </button>
                  <span className="tg-layer-kind" aria-hidden="true"><PixelIcon name={l.kind === 'photo' ? 'photo' : 'tile'} size={10} /></span>
                  <input className="tg-layer-name" value={l.name} aria-label="Layer name"
                    onFocus={() => setActiveId(l.id)}
                    onChange={e => onChange(withLayer(dataRef.current, l.id, x => ({ ...x, name: e.target.value.slice(0, 40) })))} />
                </li>
              ))}
            </ol>
            <span className="tg-hint">Drag to reorder · top is in front</span>
          </div>
        </div>
      )}

      {editing && panel === 'glyphs' && (
        <GlyphEditor width={data.mode === 'half' ? 8 : 16} glyphs={data.glyphs}
          onChange={glyphs => commit({ ...dataRef.current, glyphs })} onClose={() => setPanel(null)} />
      )}
    </div>
  );
}
