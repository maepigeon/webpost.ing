import { useState, useRef, useEffect, useCallback, useMemo, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import './tips.css';
import { useDialog } from '../../../../../Dialog/Dialog.jsx';
import axios from 'axios';
import { BASE_URL, IMAGES_BASE_URL } from '../../../../../../config.js';
import { normaliseUploadResponse, describeUploadError } from '../../../../../../utils/responsiveImage.js';
import {
  TILE, SCALE, LIMITS, FONT_NAMES, DIRECTIONS, normaliseGrid, pixelLayer, photoLayer,
  SLOTS_PER_TILE, SLOT_W, slotsPerRow, rowChars, writeSlot, writeChar, writeXl, xlTiles, setTileWidths, isWide, restyleSlots, resizeLayerText,
  EDGES, floodTiles, isElbow, linePixels, rectPixels, ellipsePixels, readableText, mergeText, cleanHref, isExternalHref, setLink, linkAt, orderSlots, slotsIn, renderGrid, pixelatePhoto, photoRect, resizePhoto, zoomPhoto, tileKey, rectTiles, combineSelection, orderedTiles,
} from './tileGrid.js';
import { TEXTURES, fillTexture, texturePreview, DEFAULT_PAW_OPTIONS } from './textures.js';
import PawOptions from '../../../../../TileArt/PawOptions.jsx';
import GlyphEditor from './GlyphEditor.jsx';
import SymbolPalette from './SymbolPalette.jsx';
import { createPortal } from 'react-dom';
import { StickerCenter } from '../../../../../TileArt/StickerCenter.jsx';
import { renderGridImage } from '../../../../../TileArt/wallpaper.js';
import GridButton from './GridButton.jsx';
import { PixelWords, GridSelect, GridStepper } from './GridUI.jsx';
import PixelText from './PixelText.jsx';
import PixelIcon from './PixelIcon.jsx';
import './TileGrid.css';
import ColourPicker from '../../../../../TileArt/ColourPicker.jsx';

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

/** Alt (Option) + a letter picks a tool. Keyed by KeyboardEvent.code. */
const TOOL_KEYS = { KeyT: 'text', KeyS: 'select', KeyW: 'wand', KeyM: 'move', KeyP: 'pixel', KeyB: 'tile', KeyE: 'erase', KeyF: 'fill', KeyL: 'line', KeyR: 'rect', KeyO: 'ellipse', KeyI: 'pick' };

/** The editor's keyboard shortcuts, as the shortcuts panel lists them. */
const SHORTCUTS = [
  ['Tools', [
    ['⌥T', 'Text'], ['⌥S', 'Select'], ['⌥W', 'Magic wand'], ['⌥M', 'Move'], ['⌥P', 'Paint pixels'],
    ['⌥B', 'Paint tiles'], ['⌥E', 'Erase'], ['⌥F', 'Fill'], ['⌥L', 'Line'], ['⌥R', 'Rectangle (Shift fills)'],
    ['⌥O', 'Ellipse (Shift fills)'], ['⌥I', 'Eyedropper'],
  ]],
  ['Edit', [
    ['⌘Z', 'Undo'], ['⇧⌘Z or ⌘Y', 'Redo'], ['⌘C', 'Copy'], ['⌘X', 'Cut'], ['⌘V', 'Paste'],
    ['⌘A', 'Select all'], ['Delete', 'Clear the selection'], ['Esc', 'Deselect'],
  ]],
  ['Cursor and selection', [
    ['Arrows', 'Move the cursor (in Select, it selects that tile)'], ['⇧ Arrows', 'Grow the selection'],
    ['⌥ Arrows', 'Nudge the selection or layer'],
  ]],
  ['Typing', [
    ['Any key', 'Types, switching to Text if another tool is picked'], ['Insert', 'Avoid overdraw on or off'],
    ['Enter', 'Next line'], ['F2', 'Rename the layer'], ['⌘/', 'Show or hide this list'],
  ]],
];

/**
 * A mouse press on a button would take the keyboard away from the hidden
 * typing area, and typing after clicking a tool did nothing. Buttons act on
 * click anyway; the press itself need not move focus. Fields keep theirs.
 */
function keepTypingFocus(e) {
  if (e.target.closest('button') && !e.target.closest('input, select, textarea, label')) e.preventDefault();
}

/** Quick colours beside the colour picker. */
const PALETTE = ['#ffffff', '#000000', '#ff3b30', '#ff9500', '#ffd60a', '#34c759', '#00c7be', '#0a84ff', '#bf5af2', '#ff2d92'];

const allTiles = (d) => orderedTiles(new Set(rectTiles({ r: 0, c: 0 }, { r: d.rows - 1, c: d.cols - 1 })));

/** A square tile button with a pixel icon. */
function Tile({ icon, label, on, disabled, onClick }) {
  return (
    <button type="button" className={`tg-tile${on ? ' is-on' : ''}`}
      onClick={onClick} disabled={disabled} data-tip={label} aria-label={label} aria-pressed={on || undefined}>
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
/**
 * A grid's links, for readers: a real link over each linked tile, so they can
 * be hovered, focused and copied like any other. One tab stop per link.
 * Off-site addresses ask first, as links in posts do.
 */
function GridLinks({ data }) {
  const navigate = useNavigate();
  const { linkWarning } = useDialog();
  const [hover, setHover] = useState(-1);
  const open = (e, href) => {
    // The post viewer may already have asked about it (it watches every link in a post).
    if (e.defaultPrevented) return;
    e.preventDefault();
    if (!isExternalHref(href)) { navigate(href.startsWith('/') ? href : new URL(href).pathname); return; }
    linkWarning(href).then(ok => { if (ok) window.open(href, '_blank', 'noopener,noreferrer'); });
  };
  return data.links.map((link, i) => link.tiles.map((key, j) => {
    const [r, c] = key.split(',').map(Number);
    return (
      <a key={key} href={link.href} className={`tilegrid-link${hover === i ? ' is-hover' : ''}`}
        style={{ left: `${(c / data.cols) * 100}%`, top: `${(r / data.rows) * 100}%`, width: `${100 / data.cols}%`, height: `${100 / data.rows}%` }}
        title={link.href} aria-label={j === 0 ? `Link: ${link.href}` : undefined} tabIndex={j === 0 ? 0 : -1}
        aria-hidden={j === 0 ? undefined : true} rel="noopener noreferrer nofollow"
        onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(-1)}
        onFocus={() => setHover(i)} onBlur={() => setHover(-1)}
        onClick={e => open(e, link.href)} />
    );
  }));
}

/**
 * A reader's copy of a grid's text: invisible letters laid exactly over the
 * picture, so it can be highlighted and copied like any text on the page (and
 * found, and read aloud). Each row is a line; letters sit at their slots.
 */
function SelectableText({ data }) {
  const rows = useMemo(() => readableText(data), [data]);
  const slots = data.cols * SLOTS_PER_TILE;
  if (!rows.some(r => r.length)) return null;
  return (
    <div className="tilegrid-text" style={{ '--slots': slots }}>
      {rows.map((pieces, r) => (
        <div key={r} className="tilegrid-text-row" style={{ height: `${100 / data.rows}%` }}>
          {pieces.map((p, i) => {
            // A gap before a letter is one space, so words stay apart when copied.
            const from = i ? pieces[i - 1].slot + pieces[i - 1].width : 0;
            const gap = p.slot - from;
            return (
              <Fragment key={p.slot}>
                {gap > 0 && <span style={{ width: `${(gap / slots) * 100}%` }}>{' '}</span>}
                <span style={{ width: `${(p.width / slots) * 100}%` }}>{p.text}</span>
              </Fragment>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function TileGrid({
  data: rawData, onChange, editable, onMoveUp, onMoveDown, onDelete, startEditing = false,
  maxCols = LIMITS.maxCols, maxRows = LIMITS.maxRows, onDone,
  // Off where the grid sits inside another link (a post's card on a profile).
  linksActive = true,
  // A width that may not change (a profile banner's rows match its site rows).
  lockCols = false,
  // The colour picked at first (text on a light page wants a dark one).
  initialColour = '#ffffff',
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
  const photos = useRef({});    // layer id → { key, photo, natural }
  const clipboard = useRef(null);
  const [, redraw] = useState(0);
  const bump = () => redraw(n => n + 1);

  const [editing, setEditing] = useState(startEditing);
  const [tool, setTool] = useState('text');
  const [colour, setColour] = useState(initialColour);
  // Clear paints transparency: pixels, tiles and fills take away what is there.
  const [clear, setClear] = useState(false);
  const [font, setFont] = useState('pixel');
  const [direction, setDirection] = useState('right');
  // Full: one wide character per tile; half: two narrow ones. It applies
  // where you type (and to selected tiles when changed), never the whole grid.
  const [width, setWidthState] = useState('full');
  const widthRef = useRef('full');
  const [activeId, setActiveIdState] = useState(() => data.layers[data.layers.length - 1].id);
  // Read by key handlers, which can run twice before a re-render.
  const activeIdRef = useRef(activeId);
  const setActiveId = (id) => { activeIdRef.current = id; setActiveIdState(id); };
  const cursorRef = useRef({ r: 0, s: 0 });
  const [cursor, setCursorState] = useState({ r: 0, s: 0 });
  const setCursor = (c) => { cursorRef.current = c; setCursorState(c); };
  const selectionRef = useRef(EMPTY);
  const [selection, setSelectionState] = useState(EMPTY);
  const setSelection = (s) => { selectionRef.current = s; setSelectionState(s); };
  const [moveBy, setMoveBy] = useState(null);
  // A photo corner being dragged: the scale and offset it would have now.
  const [photoResize, setPhotoResize] = useState(null);
  const [panel, setPanel] = useState(null);   // 'texture' | 'glyphs' | null
  const [pawOptions, setPawOptions] = useState(DEFAULT_PAW_OPTIONS);
  const [uploading, setUploading] = useState(false);
  const [dragLayer, setDragLayer] = useState(null);
  const [renaming, setRenaming] = useState(null);   // layer id whose name is being edited
  // Like a keyboard's Insert key: typing jumps over slots that already hold a character.
  const [skipFilled, setSkipFilled] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [linkDraft, setLinkDraft] = useState('');
  const [linkError, setLinkError] = useState('');
  // Where a Shift+arrow selection started (a tile).
  const selAnchor = useRef(null);

  // Starting to edit hands the grid the keyboard, so shortcuts and typing work at once.
  useEffect(() => { if (editing) typeRef.current?.focus({ preventScroll: true }); }, [editing]);

  const active = data.layers.find(l => l.id === activeId) || data.layers[data.layers.length - 1];
  useEffect(() => { if (active && active.id !== activeId) setActiveId(active.id); }, [active, activeId]);

  // ── Assets ─────────────────────────────────────────────────────────────────

  // A load that finishes after the grid has changed still lands, as long as the
  // layer still wants that image: the canvas or key checks below say so. (It
  // used to be dropped whenever the grid changed while it loaded, and as the
  // layer was by then marked loaded it was never tried again: a photo stayed
  // blank, and a painted layer's next edit saved over its pixels.)
  useEffect(() => {
    for (const layer of data.layers) {
      if (layer.kind !== 'pixel') continue;
      const have = paints.current[layer.id];
      const sized = have && have.canvas.width === data.cols * TILE && have.canvas.height === data.rows * TILE;
      if (have && have.src === layer.paint && sized) continue;
      const canvas = blankCanvas(data);
      paints.current[layer.id] = { src: layer.paint, canvas };
      if (!layer.paint) continue;
      loadImage(layer.paint).then(img => {
        if (paints.current[layer.id]?.canvas !== canvas) return;
        canvas.getContext('2d').drawImage(img, 0, 0);
        bump();
      }).catch(() => {});
    }
    for (const layer of data.layers) {
      if (layer.kind !== 'photo') continue;
      const key = `${layer.src}|${layer.scale}|${data.cols}|${data.rows}|${data.edges || ''}`;
      if (photos.current[layer.id]?.key === key) continue;
      photos.current[layer.id] = { key, photo: null };
      loadImage(IMAGES_BASE_URL + layer.src).then(img => {
        if (photos.current[layer.id]?.key !== key) return;
        photos.current[layer.id].photo = pixelatePhoto(img, data, layer);
        photos.current[layer.id].natural = { w: img.naturalWidth || img.width, h: img.naturalHeight || img.height };
        bump();
      }).catch(() => {});
    }
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
      cursor: editing && (tool === 'text' || tool === 'select') && active?.kind === 'pixel' ? cursor : null,
      cursorWide: width === 'full',
      selection: editing ? selection : null,
      moveBy, activeId: active?.id,
      showGrid: editing,
      showLinks: editing,
    });
    draw();
    document.fonts?.ready?.then(draw).catch(() => {});
  });

  // ── Layer helpers ──────────────────────────────────────────────────────────

  const activeLayer = () => {
    const d = dataRef.current;
    return d.layers.find(l => l.id === activeIdRef.current) || d.layers[d.layers.length - 1];
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

  // Pixel perfect: freehand strokes lose the elbow pixels of their diagonal steps.
  const [pixelPerfect, setPixelPerfect] = useState(false);

  /**
   * How a tile looks on a layer, as a string: its characters, their styles and
   * width, and its painted pixels. Tiles that look alike have equal strings (what
   * the magic wand matches on). A photo layer has no tiles to tell apart.
   */
  const tileLook = (layer) => {
    const d = dataRef.current;
    const ctx = layer.kind === 'pixel' ? paintCanvas(layer.id)?.getContext('2d') : null;
    return (r, c) => {
      if (layer.kind !== 'pixel') return '';
      const n = SLOTS_PER_TILE;
      const chars = rowChars(d, layer, r).slice(c * n, c * n + n).join('');
      const styles = [0, 1].map(i => JSON.stringify(layer.style[`${r},${c * n + i}`] || null)).join('');
      let hash = 2166136261;
      if (ctx) {
        const px = ctx.getImageData(c * TILE, r * TILE, TILE, TILE).data;
        for (let i = 0; i < px.length; i++) hash = Math.imul(hash ^ px[i], 16777619);
      }
      return `${chars}|${styles}|${isWide(layer, r, c)}|${hash}`;
    };
  };

  const paintAt = (canvas, x, y, stroke) => {
    const ctx = canvas.getContext('2d');
    if (stroke) {
      const last = stroke.pts[stroke.pts.length - 1];
      if (last && last.x === x && last.y === y) return;
      stroke.pts.push({ x, y, was: ctx.getImageData(x, y, 1, 1) });
      const n = stroke.pts.length;
      if (n >= 3 && isElbow(stroke.pts[n - 3], stroke.pts[n - 2], stroke.pts[n - 1])) {
        const elbow = stroke.pts[n - 2];
        ctx.putImageData(elbow.was, elbow.x, elbow.y);
        stroke.pts.splice(n - 2, 1);
      }
    }
    const [px, py, size] = tool === 'tile'
      ? [Math.floor(x / TILE) * TILE, Math.floor(y / TILE) * TILE, TILE]
      : [x, y, 1];
    if (tool === 'erase' || clear) ctx.clearRect(px, py, size, size);
    else { ctx.fillStyle = colour; ctx.fillRect(px, py, size, size); }
  };

  /** The shape being dragged out, from where it started to `p`; Shift fills a rectangle or ellipse. */
  const drawShape = (p, fill) => {
    const g = gesture.current;
    const canvas = paintCanvas(g.layerId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.putImageData(g.before, 0, 0);
    const a = g.start;
    const pts = tool === 'line' ? linePixels(a.x, a.y, p.x, p.y)
      : tool === 'rect' ? rectPixels(a.x, a.y, p.x, p.y, fill)
        : ellipsePixels(a.x, a.y, p.x, p.y, fill);
    ctx.fillStyle = colour;
    for (const [x, y] of pts) {
      if (clear) ctx.clearRect(x, y, 1, 1);
      else ctx.fillRect(x, y, 1, 1);
    }
    bump();
  };

  const strokeTo = (x, y) => {
    const g = gesture.current;
    const canvas = paintCanvas(g.layerId);
    if (!canvas) return;
    const from = g.last || { x, y };
    const steps = Math.max(Math.abs(x - from.x), Math.abs(y - from.y), 1);
    for (let i = 1; i <= steps; i++) {
      paintAt(canvas, Math.round(from.x + ((x - from.x) * i) / steps), Math.round(from.y + ((y - from.y) * i) / steps),
        g.stroke);
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
      selAnchor.current = p.tile;
      const mode = e.shiftKey ? 'add' : e.altKey ? 'remove' : 'replace';
      gesture.current = { kind: 'select', anchor: p.tile, base: sel, mode, moved: false };
      if (mode === 'replace') setSelection(EMPTY);
      if (mode === 'replace') {
        // The cursor goes where you click: that slot for Text, the tile for Select.
        const d = dataRef.current;
        const s = tool === 'select' ? p.tile.c * SLOTS_PER_TILE : Math.min(slotsPerRow(d) - 1, Math.floor(p.x / SLOT_W));
        setCursor({ r: p.tile.r, s: widthRef.current === 'full' ? s - (s % SLOTS_PER_TILE) : s });
      }
      return;
    }
    if (tool === 'wand') {
      // The tiles joined to this one that look the same on this layer; Shift adds, Alt takes away.
      const found = floodTiles(dataRef.current.cols, dataRef.current.rows, tileLook(layer), p.tile.r, p.tile.c);
      const mode = e.shiftKey ? 'add' : e.altKey ? 'remove' : 'replace';
      setSelection(combineSelection(sel, found, mode));
      selAnchor.current = p.tile;
      setCursor({ r: p.tile.r, s: p.tile.c * SLOTS_PER_TILE });
      return;
    }
    if (tool === 'fill') {
      fillTiles(sel.size && sel.has(tileKey(p.tile.r, p.tile.c)) ? orderedTiles(sel) : [p.tile], colour);
      return;
    }
    if (tool === 'pick') {
      // Eyedropper: the colour of what you see at that pixel, all layers together.
      const cv = canvasRef.current;
      const px = cv.getContext('2d').getImageData(p.x * SCALE + 1, p.y * SCALE + 1, 1, 1).data;
      if (px[3] === 0) { setClear(true); }
      else chooseColour(`#${[px[0], px[1], px[2]].map(v => v.toString(16).padStart(2, '0')).join('')}`);
      return;
    }
    if (layer.kind !== 'pixel') return;
    if (tool === 'line' || tool === 'rect' || tool === 'ellipse') {
      // A shape: drawn afresh from the layer as it was each time the pointer moves.
      const canvas = paintCanvas(layer.id);
      if (!canvas) return;
      gesture.current = { kind: 'shape', layerId: layer.id, start: p,
        before: canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height) };
      drawShape(p, e.shiftKey);
      return;
    }
    // Only one-pixel strokes can be pixel perfect; tiles are painted whole.
    gesture.current = { kind: 'paint', layerId: layer.id, last: null,
      stroke: pixelPerfect && (tool === 'pixel' || tool === 'erase') ? { pts: [] } : null };
    strokeTo(p.x, p.y);
  };

  const onPointerMove = (e) => {
    const g = gesture.current;
    if (!g) return;
    const p = toGrid(e);
    if (g.kind === 'paint') { strokeTo(p.x, p.y); return; }
    if (g.kind === 'shape') { drawShape(p, e.shiftKey); return; }
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
    if (g.kind === 'paint' || g.kind === 'shape') {
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
      } else if (!g.moved && tool === 'select') {
        // A click in Select selects the one tile.
        setSelection(new Set([tileKey(g.anchor.r, g.anchor.c)]));
      }
      if (selectionRef.current.size) setCursor(typingOrder()[0]);
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
    for (const { r, c } of tiles) {
      if (clear) ctx.clearRect(c * TILE, r * TILE, TILE, TILE);
      else ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
    }
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
    const n = SLOTS_PER_TILE;
    const box = boundsOf(sel);
    const ctx = paintCanvas(layer.id)?.getContext('2d');
    return {
      tiles: orderedTiles(sel).map(({ r, c }) => ({
        dr: r - box.r0, dc: c - box.c0,
        chars: rowChars(d, layer, r).slice(c * n, (c + 1) * n),
        styles: Array.from({ length: n }, (_, i) => layer.style[`${r},${c * n + i}`] || null),
        pixels: ctx ? ctx.getImageData(c * TILE, r * TILE, TILE, TILE) : null,
        wide: isWide(layer, r, c),
      })),
    };
  };

  const clearTiles = (d, layer, tiles) => {
    const n = SLOTS_PER_TILE;
    let l = setTileWidths(d, layer, tiles, 'half');
    for (const { r, c } of tiles) for (let i = 0; i < n; i++) l = writeSlot(d, l, r, c * n + i, ' ');
    const ctx = paintCanvas(layer.id)?.getContext('2d');
    if (ctx) for (const { r, c } of tiles) ctx.clearRect(c * TILE, r * TILE, TILE, TILE);
    return l;
  };

  const stamp = (d, layer, clip, top, left) => {
    const n = SLOTS_PER_TILE;
    const ctx = paintCanvas(layer.id)?.getContext('2d');
    let l = layer;
    const placed = new Set();
    const wide = new Set(layer.wide || []);
    for (const t of clip.tiles) {
      const r = top + t.dr, c = left + t.dc;
      if (r < 0 || c < 0 || r >= d.rows || c >= d.cols) continue;
      placed.add(tileKey(r, c));
      for (let i = 0; i < n; i++) l = writeSlot(d, l, r, c * n + i, t.chars[i] ?? ' ', t.styles[i] || undefined);
      if (t.wide) wide.add(tileKey(r, c)); else wide.delete(tileKey(r, c));
      if (ctx && t.pixels) ctx.putImageData(t.pixels, c * TILE, r * TILE);
    }
    return { layer: { ...l, wide: [...wide] }, placed };
  };

  const applyLayer = (d, layer) => {
    const next = withLayer(d, layer.id, () => layer);
    return paintCanvas(layer.id) ? savePaint(next, layer.id) : next;
  };

  /**
   * Drag a corner of the active photo to resize it; the opposite corner stays
   * put. The outline follows the pointer and the photo is redrawn on release.
   */
  const startPhotoResize = (e, corner) => {
    e.preventDefault();
    e.stopPropagation();
    const layer = activeLayer();
    const natural = photos.current[layer.id]?.natural;
    if (layer.kind !== 'photo' || !natural) return;
    const handle = e.currentTarget;
    handle.setPointerCapture?.(e.pointerId);
    const at = (ev) => {
      const p = toGrid(ev);
      return resizePhoto(layer, natural, dataRef.current, corner, { x: p.fx, y: p.fy });
    };
    const onMove = (ev) => setPhotoResize({ layerId: layer.id, ...at(ev) });
    const onUp = (ev) => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      setPhotoResize(null);
      const next = at(ev);
      commit(withLayer(dataRef.current, layer.id, l => ({ ...l, ...next })));
      typeRef.current?.focus();
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
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

  /**
   * Mirrors the selection (or the whole layer) across or up and down: tiles
   * swap places and their pixels flip. Letters move with their tiles but stay
   * the right way round, so text is still readable.
   */
  const flip = (across) => {
    const d = dataRef.current;
    const layer = activeLayer();
    if (layer.kind !== 'pixel') return;
    const sel = selectionRef.current.size ? selectionRef.current
      : new Set(rectTiles({ r: 0, c: 0 }, { r: d.rows - 1, c: d.cols - 1 }));
    const clip = capture(sel, layer);
    const box = boundsOf(sel);
    const h = box.r1 - box.r0, w = box.c1 - box.c0;
    const flipped = {
      tiles: clip.tiles.map(t => {
        let pixels = t.pixels;
        if (pixels) {
          const out = new ImageData(TILE, TILE);
          for (let y = 0; y < TILE; y++) {
            for (let x = 0; x < TILE; x++) {
              const from = ((across ? y : TILE - 1 - y) * TILE + (across ? TILE - 1 - x : x)) * 4;
              out.data.set(pixels.data.subarray(from, from + 4), (y * TILE + x) * 4);
            }
          }
          pixels = out;
        }
        return { ...t, pixels, dr: across ? t.dr : h - t.dr, dc: across ? w - t.dc : t.dc,
          // Two narrow letters in a tile swap sides when it flips across.
          chars: across && !t.wide ? [...t.chars].reverse() : t.chars,
          styles: across && !t.wide ? [...t.styles].reverse() : t.styles };
      }),
    };
    const res = stamp(d, clearTiles(d, layer, orderedTiles(sel)), flipped, box.r0, box.c0);
    commit(applyLayer(d, res.layer));
    if (selectionRef.current.size) setSelection(res.placed);
    typeRef.current?.focus();
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
    const corner = sel.size ? boundsOf(sel) : { r0: cursorRef.current.r, c0: Math.floor(cursorRef.current.s / SLOTS_PER_TILE) };
    const res = stamp(d, layer, clip, corner.r0, corner.c0);
    commit(applyLayer(d, res.layer));
    setSelection(res.placed);
  };

  const selectAll = () => {
    const d = dataRef.current;
    setSelection(new Set(rectTiles({ r: 0, c: 0 }, { r: d.rows - 1, c: d.cols - 1 })));
  };

  // ── Typing ─────────────────────────────────────────────────────────────────

  /** Slots in the order typing fills them: every half slot, or a tile at a time when full width. */
  const step = () => (widthRef.current === 'full' ? SLOTS_PER_TILE : 1);
  const typingOrder = () => orderSlots(slotsIn(dataRef.current, selectionRef.current, widthRef.current), direction, step());

  /** The first slot of the next line across the typing direction. */
  const nextLineIndex = (order, i) => {
    const [dr, ds] = DIRECTIONS[direction];
    const k = step();
    const line = ({ r, s }) => { const x = s / k; return dr === 0 ? r : ds === 0 ? x : dr * ds > 0 ? x - r : x + r; };
    const here = line(order[i]);
    const j = order.findIndex((p, k) => k > i && line(p) !== here);
    return j === -1 ? i : j;
  };

  /** Whether a slot holds a character on any visible layer (this one as typed so far). */
  const slotFilled = (d, typing, { r, s }) => d.layers.some(l => {
    const layer = l.id === typing.id ? typing : l;
    if (!layer.visible || layer.kind !== 'pixel') return false;
    const chars = rowChars(d, layer, r);
    const first = s - (s % SLOTS_PER_TILE);
    // A wide tile is full whichever half you ask about; typing full width needs the whole tile free.
    if (widthRef.current === 'full' || isWide(layer, r, first / SLOTS_PER_TILE)) {
      return chars[first] !== ' ' || chars[first + 1] !== ' ';
    }
    return (chars[s] || ' ') !== ' ';
  });

  /**
   * The layer typing goes on. Text can't go on a photo, so with one picked it
   * goes on the nearest layer above it, or a new "Text" layer put there (keys
   * used to be dropped, and with a photo on top a grid took no typing at all).
   */
  const textLayerFor = (d) => {
    const layer = activeLayer();
    if (layer.kind === 'pixel') return { d, layer };
    const at = d.layers.findIndex(l => l.id === layer.id);
    const above = d.layers.slice(at + 1).find(l => l.kind === 'pixel' && l.visible);
    if (above) { setActiveId(above.id); return { d, layer: above }; }
    if (d.layers.length >= LIMITS.maxLayers) return { d, layer: null };
    const text = pixelLayer('Text');
    const layers = d.layers.slice();
    layers.splice(at + 1, 0, text);
    setActiveId(text.id);
    return { d: { ...d, layers }, layer: text };
  };

  /**
   * XL letters: each is four tiles (2 × 2), so the cursor moves two tiles
   * along and, at a line's end or Enter, two rows down. With Avoid overdraw
   * (the Insert toggle) a letter goes to the next 2 × 2 spot whose tiles are
   * all empty, instead of drawing over what is there.
   */
  const typeXl = (str, d, layer) => {
    const startC = Math.floor(cursorRef.current.s / SLOTS_PER_TILE);
    let { r } = cursorRef.current;
    let c = startC;
    let l = layer;
    const taken = (rr, cc) => xlTiles(rr, cc).some(([tr, tc]) => slotFilled(d, l, { r: tr, s: tc * SLOTS_PER_TILE }));
    for (const ch of Array.from(str)) {
      if (ch === '\n' || ch === '\r') { r += 2; c = startC; continue; }
      if (c + 1 >= d.cols) { r += 2; c = 0; }
      if (skipFilled) {
        while (r + 1 < d.rows && taken(r, c)) { c += 2; if (c + 1 >= d.cols) { r += 2; c = 0; } }
      }
      if (r + 1 >= d.rows) break;
      if (ch !== ' ') l = writeXl(d, l, r, c, ch, { color: colour });
      c += 2;
    }
    commit(withLayer(d, layer.id, () => l));
    setCursor({ r: Math.min(r, d.rows - 1), s: Math.min(c, d.cols - 1) * SLOTS_PER_TILE });
  };

  // useFont: the Symbols palette types in its own font, whatever is picked.
  const typeChars = (str, useFont = font) => {
    const { d, layer } = textLayerFor(dataRef.current);
    if (!layer) return;
    if (useFont === 'xl') { typeXl(str, d, layer); return; }
    const order = typingOrder();
    let i = Math.max(0, order.findIndex(p => p.r === cursorRef.current.r && p.s === cursorRef.current.s));
    let l = layer;
    for (const ch of Array.from(str)) {
      if (ch === '\n' || ch === '\r') { i = nextLineIndex(order, i); continue; }
      if (skipFilled) {
        while (i < order.length - 1 && slotFilled(d, l, order[i])) i += 1;
        if (slotFilled(d, l, order[i])) break;
      }
      const { r, s } = order[i];
      l = writeChar(d, l, r, s, ch, { font: useFont, color: colour }, widthRef.current);
      if (i < order.length - 1) i += 1;
    }
    commit(withLayer(d, layer.id, () => l));
    setCursor(order[i]);
  };

  /** Clears the character before the cursor and moves back to it (or clears the selection). */
  const backspace = () => {
    const d = dataRef.current;
    const order = typingOrder();
    const i = Math.max(0, order.findIndex(p => p.r === cursorRef.current.r && p.s === cursorRef.current.s));
    const layer = activeLayer();
    if (selectionRef.current.size && i === 0) { deleteSelection(); return; }
    if (layer.kind !== 'pixel' || i === 0) return;
    let prev = order[i - 1];
    // The second half of a wide tile is part of its character: one press clears it.
    if (prev.s % SLOTS_PER_TILE && isWide(layer, prev.r, Math.floor(prev.s / SLOTS_PER_TILE)) && i >= 2) prev = order[i - 2];
    const wideTile = isWide(layer, prev.r, Math.floor(prev.s / SLOTS_PER_TILE));
    commit(withLayer(d, layer.id, l => writeChar(d, l, prev.r, prev.s, ' ', undefined, wideTile ? 'full' : 'half')));
    setCursor(prev);
  };

  /** A key pressed on the on-screen symbol keyboard. A custom character brings its drawing into the grid. */
  const keyboardKey = (key) => {
    if (key.kind === 'backspace') backspace();
    else if (key.kind === 'enter') typeChars('\n');
    else if (key.kind === 'space') typeChars(' ');
    else if (key.hex) {
      const d = dataRef.current;
      if (d.glyphs[key.ch] !== key.hex) commit({ ...d, glyphs: { ...d.glyphs, [key.ch]: key.hex } });
      typeChars(key.ch, 'pixel');
    } else typeChars(key.ch, 'symbols');
    typeRef.current?.focus();
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
    if (mod && e.key === '/') { setShowKeys(v => !v); e.preventDefault(); return; }
    if (e.key === 'Insert') { setSkipFilled(v => !v); e.preventDefault(); return; }
    if (e.key === 'F2') { setRenaming(activeLayer().id); e.preventDefault(); return; }
    // Alt (Option) and a letter picks a tool; e.code, as Option+letter types an accent on a Mac.
    const toolKey = e.altKey && !mod && TOOL_KEYS[e.code];
    if (toolKey) { setTool(toolKey); e.preventDefault(); return; }
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
      const k = step();
      const from = s - (s % k);
      const next = {
        r: Math.max(0, Math.min(d.rows - 1, r + nudge[0])),
        s: Math.max(0, Math.min(slotsPerRow(d) - k, from + nudge[1] * k)),
      };
      const tileOf = (p) => ({ r: p.r, c: Math.floor(p.s / SLOTS_PER_TILE) });
      if (e.shiftKey) {
        // Shift+arrows grow the selection from where it started.
        if (!selAnchor.current) selAnchor.current = tileOf(cursorRef.current);
        setSelection(new Set(rectTiles(selAnchor.current, tileOf(next))));
      } else if (tool === 'select') {
        // In select mode the cursor carries a one-tile selection with it.
        selAnchor.current = tileOf(next);
        setSelection(new Set([tileKey(selAnchor.current.r, selAnchor.current.c)]));
      } else {
        selAnchor.current = null;
      }
      setCursor(next);
      e.preventDefault();
      return;
    }
    const layer = activeLayer();
    switch (e.key) {
      case 'Enter': typeChars('\n'); break;
      case 'Backspace': backspace(); break;
      case 'Delete':
        if (hasSel) deleteSelection();
        else if (layer.kind === 'pixel') {
          const { r, s } = cursorRef.current;
          const wideTile = isWide(layer, r, Math.floor(s / SLOTS_PER_TILE));
          commit(withLayer(d, layer.id, l => writeChar(d, l, r, s, ' ', undefined, wideTile || widthRef.current === 'full' ? 'full' : 'half')));
        }
        break;
      case 'Escape':
        selAnchor.current = null;
        if (showKeys) setShowKeys(false);
        else if (hasSel) setSelection(EMPTY); else if (panel) setPanel(null); else typeRef.current?.blur();
        break;
      default: return;   // printable keys arrive through onInput
    }
    e.preventDefault();
  };

  const onInput = (e) => {
    const value = e.target.value;
    e.target.value = '';
    if (!value) return;
    // Typing with another tool picked switches to Text: the keys were meant as text.
    if (tool !== 'text') setTool('text');
    typeChars(value);
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

  // Font and colour apply to what is selected, or the cursor's slot, whichever
  // tool is picked for text or selecting; with a drawing tool they set the next
  // thing painted (colour) or typed (font).
  const chooseFont = (f) => { setFont(f); if (tool === 'text' || tool === 'select') restyle({ font: f }); };
  const chooseColour = (c) => { setColour(c); setClear(false); if (tool === 'text' || tool === 'select') restyle({ color: c }); };

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

  /**
   * Picks the width typed from here on. With tiles selected, it changes just
   * those tiles on this layer (a narrow pair made wide keeps its first character).
   */
  const setWidth = (w) => {
    widthRef.current = w;
    setWidthState(w);
    const { r, s } = cursorRef.current;
    if (w === 'full') setCursor({ r, s: s - (s % SLOTS_PER_TILE) });
    const layer = activeLayer();
    if (!selectionRef.current.size || layer.kind !== 'pixel') return;
    const d = dataRef.current;
    commit(withLayer(d, layer.id, l => setTileWidths(d, l, orderedTiles(selectionRef.current), w)));
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

  const [choosingSticker, setChoosingSticker] = useState(false);

  /**
   * Stamps a sticker onto the grid: drawn at the grid's own pixels on a new
   * layer of its own, its top-left at the cursor's tile, so it can be moved,
   * erased or merged down like anything else.
   */
  const stampSticker = async (grid, picked) => {
    setChoosingSticker(false);
    const d = dataRef.current;
    if (d.layers.length >= LIMITS.maxLayers) { setNotice('A grid can have 10 layers; merge or delete one first.'); return; }
    const art = await renderGridImage(grid, 1).catch(() => null);
    if (!art) return;
    const c = blankCanvas(d);
    const { r } = cursorRef.current;
    const col = Math.floor(cursorRef.current.s / SLOTS_PER_TILE);
    c.getContext('2d').drawImage(art, col * TILE, r * TILE);
    insertLayer(pixelLayer(picked?.name || 'Sticker', { paint: c.toDataURL('image/png') }));
    setNotice(`Added ${picked?.name || 'a sticker'} on a layer of its own. Move it with the Move tool.`);
    typeRef.current?.focus();
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
  const [saveError, setSaveError] = useState('');
  /** Downloads the grid as a PNG, four image pixels to a grid pixel, without the editing marks. */
  const savePng = () => {
    const d = dataRef.current;
    const c = document.createElement('canvas');
    c.width = d.cols * TILE * SCALE;
    c.height = d.rows * TILE * SCALE;
    const assets = {};
    for (const l of d.layers) {
      assets[l.id] = l.kind === 'pixel' ? { paint: paints.current[l.id]?.canvas } : { photo: photos.current[l.id]?.photo };
    }
    renderGrid(c.getContext('2d'), d, assets, {});
    setSaveError('');
    try {
      c.toBlob(blob => {
        if (!blob) { setSaveError('Could not make the image.'); return; }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'grid.png';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      }, 'image/png');
    } catch {
      setSaveError('Could not make the image.');
    }
  };

  /** Opens the link panel, filled in with the selection's link if it has one. */
  const openLinkPanel = () => {
    const d = dataRef.current;
    const first = orderedTiles(selectionRef.current)[0];
    setLinkDraft(first ? linkAt(d, first.r, first.c)?.href || '' : '');
    setLinkError('');
    setPanel(p => (p === 'link' ? null : 'link'));
  };
  const applyLink = (remove = false) => {
    const tiles = [...selectionRef.current];
    if (!tiles.length) { setLinkError('Select the tiles to link first.'); return; }
    const href = remove ? null : cleanHref(linkDraft);
    if (!remove && !href) { setLinkError('Use a web address (https://…) or a path on this site (/…).'); return; }
    commit(setLink(dataRef.current, tiles, href));
    setLinkError('');
    setPanel(null);
    typeRef.current?.focus();
  };

  const setEdges = (edges) => {
    const d = dataRef.current;
    if (d.edges === edges) return;
    commit({ ...d, edges });
  };

  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 10000);
    return () => clearTimeout(t);
  }, [notice]);
  const { confirm } = useDialog();

  /** A layer's picture as a grid-sized canvas: its paint, or a photo baked at the grid's pixels. */
  const layerPicture = (d, layer) => {
    const c = blankCanvas(d);
    const ctx = c.getContext('2d');
    if (layer.kind === 'pixel') {
      const paint = paintCanvas(layer.id);
      if (paint) ctx.drawImage(paint, 0, 0);
    } else {
      const photo = photos.current[layer.id]?.photo;
      if (photo) {
        ctx.imageSmoothingEnabled = d.edges !== 'pixel';
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(photo.canvas, photo.x + layer.x, photo.y + layer.y, photo.w, photo.h);
      }
    }
    return c;
  };

  /**
   * Merges the active layer into the one under it, after asking: the two
   * become one pixel layer, painted pixels together, the upper layer's
   * characters over the lower's. A photo is flattened to pixels on the way, so
   * it can no longer be moved or resized. One undo puts both layers back.
   */
  const mergeDown = async () => {
    const d = dataRef.current;
    const layer = activeLayer();
    const at = d.layers.findIndex(l => l.id === layer.id);
    if (at < 1) return;
    const below = d.layers[at - 1];
    const hasPhoto = [layer, below].some(l => l.kind === 'photo');
    const message = `Merge "${layer.name}" down into "${below.name}"?`
      + (hasPhoto ? ' A photo in them is flattened to pixels, so it can no longer be moved or resized.' : '')
      + ' Undo (⌘Z) puts both layers back.';
    if (!(await confirm(message, 'Merge layers'))) { typeRef.current?.focus(); return; }
    const picture = layerPicture(d, below);
    picture.getContext('2d').drawImage(layerPicture(d, layer), 0, 0);
    const lowerPixels = below.kind === 'pixel' ? below : pixelLayer(below.name);
    const upperPixels = layer.kind === 'pixel' ? layer : pixelLayer(layer.name);
    const text = mergeText(d, lowerPixels, upperPixels);
    const merged = { ...lowerPixels, ...text, paint: picture.toDataURL('image/png') };
    const layers = d.layers.filter(l => l.id !== layer.id).map(l => (l.id === below.id ? merged : l));
    paints.current[merged.id] = { src: merged.paint, canvas: picture };
    commit({ ...d, layers });
    setActiveId(merged.id);
    setNotice(`Merged "${layer.name}" down into "${below.name}". ⌘Z undoes it.`);
    typeRef.current?.focus();
  };

  const flattenPhoto = () => {
    const d = dataRef.current;
    const layer = activeLayer();
    const photo = layer.kind === 'photo' && photos.current[layer.id]?.photo;
    if (!photo) return;
    const c = blankCanvas(d);
    // Baked at the grid's own pixels, whatever resolution the photo is shown at.
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = d.edges !== 'pixel';
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(photo.canvas, photo.x + layer.x, photo.y + layer.y, photo.w, photo.h);
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
    : { text: 'text', select: 'cell', wand: 'cell', move: 'move', fill: 'copy', pick: 'copy' }[tool] || 'crosshair';
  const isPixel = active?.kind === 'pixel';
  // The active photo's outline and corner handles, over the canvas.
  const photoBox = (() => {
    if (!editing || active?.kind !== 'photo' || !active.visible) return null;
    const natural = photos.current[active.id]?.natural;
    if (!natural) return null;
    const shown = photoResize?.layerId === active.id ? { ...active, ...photoResize } : active;
    const r = photoRect(shown, natural, data);
    const dx = moveBy && !photoResize ? moveBy.px : 0, dy = moveBy && !photoResize ? moveBy.py : 0;
    const W = data.cols * TILE, H = data.rows * TILE;
    return {
      style: {
        left: `${((r.x + dx) / W) * 100}%`, top: `${((r.y + dy) / H) * 100}%`,
        width: `${(r.w / W) * 100}%`, height: `${(r.h / H) * 100}%`,
      },
    };
  })();
  const hasSel = selection.size > 0;
  const hint = !isPixel && !['move', 'select'].includes(tool)
    ? 'Photo layer: drag it to move, drag a corner to resize, or flatten it to pixels to paint on it.'
    : {
      text: 'Click a tile and type. Drag to select.',
      wand: 'Click a tile to select the joined tiles that look the same. Shift adds, Alt takes away.',
      select: 'Drag, or use the arrows and Shift+arrows, to select. Shift adds, Alt removes. Drag a selection to move it.',
      move: 'Drag to move the selection, or the whole layer. Arrow keys nudge.',
      pixel: 'Paint single pixels.', tile: 'Paint whole tiles.', erase: 'Erase to transparent.',
      fill: 'Click a tile, or the selection, to fill it.',
      line: 'Drag to draw a straight line.',
      rect: 'Drag to draw a rectangle. Hold Shift to fill it.',
      ellipse: 'Drag to draw an ellipse. Hold Shift to fill it.',
      pick: 'Click to take that colour.',
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
        {!editable && <SelectableText data={data} />}
        {!editable && linksActive && data.links && <GridLinks data={data} />}
        {photoBox && (
          <div className="tg-photo-box" style={photoBox.style} aria-hidden="true">
            {['nw', 'ne', 'sw', 'se'].map(corner => (
              <span key={corner} className={`tg-photo-handle tg-photo-handle--${corner}`}
                onPointerDown={e => startPhotoResize(e, corner)} />
            ))}
          </div>
        )}
      </div>

      {editing && (
        <textarea ref={typeRef} className="tilegrid-typing" aria-label="Type into the grid"
          autoCapitalize="off" autoCorrect="off" spellCheck={false} onKeyDown={onKeyDown} onInput={onInput} />
      )}

      {editable && !editing && (
        <div className="tilegrid-controls">
          {onMoveUp && <Tile icon="arrowUp" label="Move block up" onClick={onMoveUp} />}
          {onMoveDown && <Tile icon="arrowDown" label="Move block down" onClick={onMoveDown} />}
          <GridButton symbol="pencil" showLabel label="Edit grid" onClick={() => setEditing(true)} />
          {onDelete && <Tile icon="trash" label="Delete block" onClick={onDelete} />}
        </div>
      )}

      {editing && (
        <div className="tg-panel" onMouseDown={keepTypingFocus}>
          <div className="tg-main">
            <div className="tg-group" role="group" aria-label="Draw">
              <span className="tg-group-label"><PixelText text="Draw" px={1.25} /></span>
              <Tile icon="select" label="Select tiles (⌥S)" on={tool === 'select'} onClick={() => setTool('select')} />
              <Tile icon="wand" label="Magic wand (⌥W): select joined tiles that match" on={tool === 'wand'} onClick={() => setTool('wand')} />
              <Tile icon="move" label="Move (⌥M)" on={tool === 'move'} onClick={() => setTool('move')} />
              <Tile icon="pixel" label="Paint pixels (⌥P)" on={tool === 'pixel'} onClick={() => setTool('pixel')} />
              <GridButton symbol="pixelPerfect" label="Pixel perfect" on={pixelPerfect} onClick={() => setPixelPerfect(v => !v)}
                title="Pixel perfect: keep freehand lines one pixel thick" />
              <Tile icon="tile" label="Paint tiles (⌥B)" on={tool === 'tile'} onClick={() => setTool('tile')} />
              <Tile icon="erase" label="Erase (⌥E)" on={tool === 'erase'} onClick={() => setTool('erase')} />
              <Tile icon="fill" label="Fill (⌥F)" on={tool === 'fill'} onClick={() => setTool('fill')} />
              <Tile icon="line" label="Line (⌥L)" on={tool === 'line'} onClick={() => setTool('line')} />
              <Tile icon="rect" label="Rectangle (⌥R): drag a box. Hold Shift to fill it." on={tool === 'rect'} onClick={() => setTool('rect')} />
              <Tile icon="ellipse" label="Ellipse (⌥O): drag a box. Hold Shift to fill it." on={tool === 'ellipse'} onClick={() => setTool('ellipse')} />
              <Tile icon="pick" label="Eyedropper (⌥I): take a colour from the grid" on={tool === 'pick'} onClick={() => setTool('pick')} />
              <ColourPicker value={colour} onChange={chooseColour} label="Colour" className={`tg-swatch${clear ? ' is-clear' : ''}`} />
              <button type="button" className={`tg-tile tg-clear${clear ? ' is-on' : ''}`} aria-pressed={clear}
                data-tip="Clear: painting and filling make tiles transparent" aria-label="Clear (transparent)"
                onClick={() => setClear(v => !v)} />
              <Tile icon="texture" label="Fill with a texture" on={panel === 'texture'} disabled={!isPixel}
                onClick={() => setPanel(p => (p === 'texture' ? null : 'texture'))} />
            </div>

            <div className="tg-group tg-group--type" role="group" aria-label="Text">
              <span className="tg-group-label"><PixelText text="Text" px={1.25} /></span>
              <Tile icon="text" label="Text: type on tiles (⌥T)" on={tool === 'text'} onClick={() => setTool('text')} />
              <Tile icon="one" label="One wide character per tile" on={width === 'full'} onClick={() => setWidth('full')} />
              <Tile icon="two" label="Two narrow characters per tile" on={width === 'half'} onClick={() => setWidth('half')} />
              <span className="tg-gap" />
              {/* One option per font the format knows (FONT_NAMES): a new font appears here by being added there. */}
              <GridSelect label="Font" tip="Font: applies to the selection, or what you type next."
                value={font} options={Object.entries(FONT_NAMES)} onChange={chooseFont} />
              <span className="tg-gap" />
              <span className="tg-colours" role="group" aria-label="Text colour">
                <ColourPicker value={colour} onChange={chooseColour} label="Text colour" tip="Text colour: any colour. Applies to the selection, or what you type next." className="tg-swatch" />
                {PALETTE.map(c => (
                  <button key={c} type="button" className={`tg-chip${colour.toLowerCase() === c ? ' is-on' : ''}`} style={{ background: c }}
                    aria-label={`Colour ${c}`} data-tip={c} aria-pressed={colour.toLowerCase() === c} onClick={() => chooseColour(c)} />
                ))}
              </span>
              <span className="tg-gap" />
              <Tile icon="star" label="Symbols: type ★ ♥ ✓ → and more, in the Symbols font" on={panel === 'symbols'}
                onClick={() => setPanel(p => (p === 'symbols' ? null : 'symbols'))} />
              <Tile icon="glyph" label="Custom characters" on={panel === 'glyphs'}
                onClick={() => setPanel(p => (p === 'glyphs' ? null : 'glyphs'))} />
              <Tile icon="skip" label={`Avoid overdraw (Insert): typing skips filled tiles. ${skipFilled ? 'On' : 'Off'}`} on={skipFilled} onClick={() => setSkipFilled(v => !v)} />
              <span className="tg-gap" />
              <DirectionPad value={direction} onChange={setDirection} />
            </div>

            <div className="tg-group" role="group" aria-label="Image">
              <span className="tg-group-label"><PixelText text="Image" px={1.25} /></span>
              <label className={`tg-tile${uploading ? ' is-busy' : ''}`} title="Add a photo layer">
                <PixelIcon name="photo" size={14} />
                <input type="file" accept="image/*" disabled={uploading} aria-label="Add a photo layer"
                  onChange={e => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              {active?.kind === 'photo' && (
                <>
                  <Tile icon="minus" label="Smaller" onClick={() => commit(withLayer(dataRef.current, active.id, l => ({ ...l, ...zoomPhoto(l, 1 / 1.25) })))} />
                  <Tile icon="plus" label="Larger" onClick={() => commit(withLayer(dataRef.current, active.id, l => ({ ...l, ...zoomPhoto(l, 1.25) })))} />
                  <GridButton symbol="fit" showLabel label="Fit" title="Fit the photo to the grid" onClick={() => commit(withLayer(dataRef.current, active.id, l => ({ ...l, scale: 1, x: 0, y: 0 })))} />
                  <GridButton symbol="flatten" showLabel label="Flatten" onClick={flattenPhoto}
                    title="Flatten to pixels: turn the photo into the grid's own pixels, to paint on it tile by tile. Until then it stays a photo you can move and resize." />
                </>
              )}
              <span className="tg-gap" />
              <span className="tg-seg" role="group" aria-label="Photo edges"
                title="How photos are drawn. Smooth: at full resolution. Pixel: in the grid's own pixels, hard-edged. Text is always in the grid's pixels.">
                {Object.entries(EDGES).map(([k, label]) => (
                  <GridButton key={k} label={label} text={label.split(' ')[0]} px={1.25} on={data.edges === k} onClick={() => setEdges(k)} />
                ))}
              </span>
              <span className="tg-gap" />
              <GridButton symbol="sticker" label="Sticker" title="Stamp a sticker at the cursor, on a layer of its own" onClick={() => setChoosingSticker(true)} />
              <Tile icon="save" label="Save the grid as a PNG image" onClick={savePng} />
              {saveError && <span className="tg-error" role="alert">{saveError}</span>}
            </div>

            <div className="tg-group" role="group" aria-label="Edit">
              <span className="tg-group-label"><PixelText text="Edit" px={1.25} /></span>
              <Tile icon="undo" label="Undo (⌘Z)" onClick={undo} disabled={!past.current.length} />
              <Tile icon="redo" label="Redo (⇧⌘Z)" onClick={redo} disabled={!future.current.length} />
              <span className="tg-gap" />
              <Tile icon="all" label="Select all (⌘A)" onClick={selectAll} />
              <Tile icon="none" label="Deselect (Esc)" onClick={() => setSelection(EMPTY)} disabled={!hasSel} />
              <Tile icon="copy" label="Copy (⌘C)" onClick={copySelection} disabled={!hasSel || !isPixel} />
              <Tile icon="cut" label="Cut (⌘X)" onClick={() => { copySelection(); deleteSelection(); }} disabled={!hasSel || !isPixel} />
              <Tile icon="paste" label="Paste (⌘V)" onClick={paste} disabled={!clipboard.current || !isPixel} />
              <Tile icon="delete" label="Delete selection" onClick={deleteSelection} disabled={!hasSel || !isPixel} />
              <Tile icon="flipH" label="Flip across: the selection, or the whole layer" onClick={() => flip(true)} disabled={!isPixel} />
              <Tile icon="flipV" label="Flip up and down: the selection, or the whole layer" onClick={() => flip(false)} disabled={!isPixel} />
              <span className="tg-gap" />
              <Tile icon="link" label="Link the selected tiles" on={panel === 'link'} disabled={!hasSel && panel !== 'link'} onClick={openLinkPanel} />
            </div>

            {panel === 'link' && (
              <form className="tg-link-panel" onSubmit={e => { e.preventDefault(); applyLink(); }}>
                <label className="tg-link-label"><PixelWords text={`Link ${selection.size} tile${selection.size === 1 ? '' : 's'} to`} />
                  <input type="text" inputMode="url" value={linkDraft} autoFocus placeholder="https://… or /username"
                    onChange={e => { setLinkDraft(e.target.value); setLinkError(''); }}
                    onKeyDown={e => {
                      // Handled here, not by the form: focus returns to the grid, and the
                      // key's own input must not follow it there.
                      if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
                      if (e.key === 'Escape') { e.preventDefault(); setPanel(null); typeRef.current?.focus(); }
                    }} />
                </label>
                <GridButton symbol="link" showLabel label="Link" onClick={() => applyLink()} />
                <GridButton symbol="unlink" showLabel label="Remove link" onClick={() => applyLink(true)} />
                {linkError && <span className="tg-error" role="alert">{linkError}</span>}
              </form>
            )}

            <div className="tg-group" role="group" aria-label="Size">
              <span className="tg-group-label"><PixelText text="Size" px={1.25} /></span>
              <GridStepper label="Width in tiles" short="W" value={data.cols} min={LIMITS.minCols} max={maxCols}
                disabled={lockCols} onChange={v => setSize(v, data.rows)} />
              <GridStepper label="Height in tiles" short="H" value={data.rows} min={LIMITS.minRows} max={maxRows}
                onChange={v => setSize(data.cols, v)} />
            </div>

            {panel === 'texture' && (
              <div className="tg-textures" aria-label="Textures">
                <div className="tg-texture-options"><PawOptions value={pawOptions} onChange={setPawOptions} /></div>
                {Object.entries(TEXTURES).map(([k, t]) => (
                  <button key={k} type="button" className="tg-texture" onClick={() => fillWithTexture(k)}
                    title={`Fill ${hasSel ? 'the selection' : 'the layer'} with ${t.label.toLowerCase()}`}>
                    <img src={texturePreviews[k]} alt="" width="32" height="32" />
                    <PixelText text={t.label} px={1.25} />
                  </button>
                ))}
              </div>
            )}

            {showKeys && (
              <div className="tg-keys" role="region" aria-label="Keyboard shortcuts">
                {SHORTCUTS.map(([group, keys]) => (
                  <div key={group} className="tg-keys-group">
                    <h4 className="tg-keys-title"><PixelText text={group} px={1.25} /></h4>
                    <dl>
                      {keys.map(([key, what]) => (
                        <div key={key} className="tg-keys-row"><dt><kbd>{key}</kbd></dt><dd><PixelWords text={what} px={1} /></dd></div>
                      ))}
                    </dl>
                  </div>
                ))}
                <p className="tg-keys-note"><PixelWords text="On Windows and Linux, Cmd is Ctrl and Option is Alt." px={1} /></p>
              </div>
            )}

            <div className="tg-status">
              <span className="tg-hint"><PixelWords text={hint} px={1} /></span>
              {notice && <span className="tg-notice" role="status"><PixelWords text={notice} px={1} /></span>}
              {hasSel && <span className="tg-badge"><PixelText text={`${selection.size} tile${selection.size === 1 ? '' : 's'}`} px={1} /></span>}
              {skipFilled && <span className="tg-badge"><PixelText text="No overdraw" px={1} /></span>}
              <Tile icon="keys" label="Keyboard shortcuts (⌘/)" on={showKeys} onClick={() => setShowKeys(v => !v)} />
              <GridButton symbol="check" showLabel label="Done" className="tg-done-btn"
                onClick={() => { setEditing(false); setSelection(EMPTY); setPanel(null); onDone?.(); }} />
            </div>
          </div>

          <div className="tg-layers" aria-label="Layers">
            <div className="tg-layers-head">
              <span><PixelText text="Layers" px={1.25} /></span>
              <Tile icon="plus" label="Add layer" onClick={addLayer} disabled={data.layers.length >= LIMITS.maxLayers} />
              <Tile icon="merge" label="Merge down: into the layer below" onClick={mergeDown}
                disabled={data.layers.findIndex(l => l.id === active?.id) < 1} />
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
                  onClick={() => { setActiveId(l.id); if (renaming !== l.id) typeRef.current?.focus(); }}
                  onDoubleClick={() => setRenaming(l.id)}>
                  <span className="tg-layer-grip" aria-hidden="true"><PixelIcon name="grip" size={10} /></span>
                  <button type="button" className="tg-layer-eye" onClick={e => { e.stopPropagation(); toggleVisible(l.id); }}
                    title={l.visible ? 'Hide layer' : 'Show layer'} aria-label={l.visible ? `Hide ${l.name}` : `Show ${l.name}`}>
                    <PixelIcon name={l.visible ? 'eye' : 'eyeOff'} size={12} />
                  </button>
                  <span className="tg-layer-kind" aria-hidden="true"><PixelIcon name={l.kind === 'photo' ? 'photo' : 'tile'} size={10} /></span>
                  {renaming === l.id ? (
                    <input className="tg-layer-name" value={l.name} aria-label="Layer name" autoFocus
                      onFocus={e => e.target.select()}
                      onBlur={() => setRenaming(null)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); setRenaming(null); typeRef.current?.focus(); } }}
                      onChange={e => onChange(withLayer(dataRef.current, l.id, x => ({ ...x, name: e.target.value.slice(0, 40) })))} />
                  ) : (
                    <span className="tg-layer-name" title="Double-click to rename" aria-label={l.name}>
                      {/^[\x20-\x7e]*$/.test(l.name) ? <PixelText text={l.name.slice(0, 18)} px={1.25} /> : l.name}
                    </span>
                  )}
                </li>
              ))}
            </ol>
            <span className="tg-hint"><PixelWords text="Drag to reorder. Top is in front." px={1} /></span>
          </div>
        </div>
      )}

      {choosingSticker && createPortal(
        <div className="post-theme-overlay" role="dialog" aria-modal="true" aria-label="Choose a sticker"
          onMouseDown={e => { if (e.target === e.currentTarget) setChoosingSticker(false); }}
          onKeyDown={e => { if (e.key === 'Escape') setChoosingSticker(false); }}>
          <div className="post-theme-panel">
            <div className="post-theme-head">
              <h2>Stamp a sticker</h2>
              <button type="button" className="post-theme-close" onClick={() => setChoosingSticker(false)}>Cancel</button>
            </div>
            <StickerCenter onPick={stampSticker} />
          </div>
        </div>,
        document.body,
      )}
      {editing && panel === 'symbols' && (
        <SymbolPalette onKey={keyboardKey} onClose={() => setPanel(null)} />
      )}
      {editing && panel === 'glyphs' && (
        <GlyphEditor width={width === 'half' ? 8 : 16} glyphs={data.glyphs}
          onChange={glyphs => commit({ ...dataRef.current, glyphs })} onClose={() => setPanel(null)} />
      )}
    </div>
  );
}
