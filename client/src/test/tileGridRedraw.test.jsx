import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DialogProvider } from '../components/Dialog/Dialog.jsx';

// The grid's drawing is counted, not done: jsdom has no canvas. Fonts "arrive"
// when the test says so.
const fonts = vi.hoisted(() => ({ waiting: [] }));
vi.mock('../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/tileGrid.js', async (original) => ({
  ...(await original()),
  renderGrid: vi.fn(),
  fontsSettled: vi.fn(() => new Promise(resolve => { fonts.waiting.push(resolve); })),
}));

import TileGrid from '../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/TileGrid.jsx';
import { renderGrid, normaliseGrid, pixelLayer } from '../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/tileGrid.js';

// The whole editor is mounted for each test, which is slow on a busy machine.
vi.setConfig({ testTimeout: 20000 });

const draws = () => renderGrid.mock.calls.length;
/** What the last draw was given: the grid and the editing marks. */
const last = () => { const c = renderGrid.mock.calls.at(-1); return { data: c[1], assets: c[2], view: c[3] }; };
const fontsArrive = async () => { const due = fonts.waiting.splice(0); await act(async () => { due.forEach(f => f()); }); };

const newGrid = () => normaliseGrid({ v: 3, cols: 4, rows: 2, layers: [pixelLayer('Text')] });

/** Holds the grid as a post or profile does: each change comes back as new data. */
function Host({ initial, seen }) {
  const [data, setData] = useState(initial);
  const [, setOther] = useState(0);
  seen.rerender = () => setOther(n => n + 1);
  seen.data = data;
  return <TileGrid data={data} onChange={setData} editable startEditing />;
}
const page = (ui) => <MemoryRouter><DialogProvider>{ui}</DialogProvider></MemoryRouter>;

const fakeContext = () => ({
  fillRect: vi.fn(), clearRect: vi.fn(), drawImage: vi.fn(), putImageData: vi.fn(),
  getImageData: vi.fn((x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })),
});

beforeEach(() => {
  renderGrid.mockClear();
  fonts.waiting.length = 0;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function getContext() {
    this.fake2d ||= fakeContext();
    return this.fake2d;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => `data:image/png;base64,${Math.random()}`);
  // A 4 × 2 grid shown at 20 screen pixels a tile.
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 80, height: 40 });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const canvas = () => document.querySelector('canvas.tilegrid-canvas');
const typing = () => screen.getByLabelText('Type into the grid');
const press = (name) => fireEvent.click(screen.getByRole('button', { name }));
const at = (col, row) => ({ clientX: col * 20 + 10, clientY: row * 20 + 10, pointerId: 1 });

describe('a grid being read', () => {
  it('draws once, and not again when the page around it re-renders', () => {
    const grid = newGrid();
    const view = render(page(<TileGrid data={grid} editable={false} onChange={() => {}} />));
    expect(draws()).toBe(1);
    expect(last().view).toMatchObject({ cursor: null, selection: null, showGrid: false, showLinks: false, lasso: null });

    view.rerender(page(<TileGrid data={grid} editable={false} onChange={() => {}} />));
    view.rerender(page(<TileGrid data={grid} editable={false} onChange={() => {}} linksActive={false} />));
    expect(draws()).toBe(1);
  });

  it('draws again when the grid changes', () => {
    const view = render(page(<TileGrid data={newGrid()} editable={false} onChange={() => {}} />));
    const next = normaliseGrid({ v: 3, cols: 6, rows: 3, layers: [pixelLayer('Text')] });
    view.rerender(page(<TileGrid data={next} editable={false} onChange={() => {}} />));
    expect(draws()).toBe(2);
    expect(last().data.cols).toBe(6);
    expect(canvas().width).toBe(6 * 16 * 4);
  });

  it('draws again when the fonts arrive, once', async () => {
    render(page(<TileGrid data={newGrid()} editable={false} onChange={() => {}} />));
    await fontsArrive();
    expect(draws()).toBe(2);
  });

  it('does not let a late font draw an earlier grid over a newer one, or draw after it has gone', async () => {
    const first = newGrid();
    const view = render(page(<TileGrid data={first} editable={false} onChange={() => {}} />));
    const next = normaliseGrid({ v: 3, cols: 6, rows: 3, layers: [pixelLayer('Text')] });
    view.rerender(page(<TileGrid data={next} editable={false} onChange={() => {}} />));
    renderGrid.mockClear();

    await fontsArrive();                 // both waits end: only the newer grid is drawn
    expect(draws()).toBe(1);
    expect(last().data.cols).toBe(6);

    view.rerender(page(<TileGrid data={first} editable={false} onChange={() => {}} />));
    view.unmount();
    renderGrid.mockClear();
    await fontsArrive();
    expect(draws()).toBe(0);
  });

  it('draws again when the browser hands back a canvas it had dropped', () => {
    render(page(<TileGrid data={newGrid()} editable={false} onChange={() => {}} />));
    fireEvent(canvas(), new Event('contextrestored'));
    expect(draws()).toBe(2);
  });
});

describe('a grid being edited', () => {
  const open = () => {
    const seen = {};
    render(page(<Host initial={newGrid()} seen={seen} />));
    return seen;
  };

  it('does not draw for changes the picture does not show', () => {
    const seen = open();
    const before = draws();
    act(() => seen.rerender());
    press('Keyboard shortcuts (⌘/)');
    press('Clear (transparent)');
    press('Pixel perfect');
    press('Fill with a texture');
    expect(draws()).toBe(before);
  });

  it('starts with the grid lines and the cursor', () => {
    open();
    expect(last().view).toMatchObject({ showGrid: true, showLinks: true, cursorWide: true, cursor: { r: 0, s: 0 } });
  });

  it('draws when the tool changes: the cursor shows for Text and Select only', () => {
    open();
    let before = draws();
    press('Paint pixels (⌥P)');
    expect(draws()).toBeGreaterThan(before);
    expect(last().view.cursor).toBeNull();

    before = draws();
    press('Select tiles (⌥S)');
    expect(draws()).toBeGreaterThan(before);
    expect(last().view.cursor).toEqual({ r: 0, s: 0 });

    before = draws();
    fireEvent.keyDown(typing(), { key: 'l', code: 'KeyL', altKey: true });   // ⌥L: Line
    expect(draws()).toBeGreaterThan(before);
    expect(last().view.cursor).toBeNull();
  });

  it('draws when the cursor moves and when the typing width changes', () => {
    open();
    fireEvent.keyDown(typing(), { key: 'ArrowRight' });
    expect(last().view.cursor).toEqual({ r: 0, s: 2 });
    fireEvent.keyDown(typing(), { key: 'ArrowDown' });
    expect(last().view.cursor).toEqual({ r: 1, s: 2 });

    const before = draws();
    press('Two narrow characters per tile');
    expect(draws()).toBeGreaterThan(before);
    expect(last().view.cursorWide).toBe(false);
  });

  it('draws when the selection changes', () => {
    open();
    fireEvent.keyDown(typing(), { key: 'ArrowRight', shiftKey: true });
    expect([...last().view.selection].sort()).toEqual(['0,0', '0,1']);
    press('Select all (⌘A)');
    expect(last().view.selection.size).toBe(8);
    press('Deselect (Esc)');
    expect(last().view.selection.size).toBe(0);
  });

  it('draws what is typed, and what undo and redo bring back', () => {
    const seen = open();
    fireEvent.input(typing(), { target: { value: 'A' } });
    expect(seen.data.layers[0].text.join('')).toContain('A');
    expect(last().data.layers[0].text.join('')).toContain('A');
    expect(last().view.cursor).toEqual({ r: 0, s: 2 });

    let before = draws();
    press('Undo in this grid (⌘Z)');
    expect(draws()).toBeGreaterThan(before);
    expect(last().data.layers[0].text.join('')).not.toContain('A');

    before = draws();
    press('Redo in this grid (⇧⌘Z)');
    expect(draws()).toBeGreaterThan(before);
    expect(last().data.layers[0].text.join('')).toContain('A');
  });

  it('draws each step of a move, and the result', () => {
    open();
    press('Move (⌥M)');
    fireEvent.pointerDown(canvas(), at(0, 0));
    expect(last().view.moveBy).toMatchObject({ r: 0, c: 0 });
    fireEvent.pointerMove(canvas(), at(2, 1));
    expect(last().view.moveBy).toMatchObject({ r: 1, c: 2 });
    const before = draws();
    fireEvent.pointerUp(canvas(), at(2, 1));
    expect(draws()).toBeGreaterThan(before);
    expect(last().view.moveBy).toBeNull();
  });

  it('draws the lasso as it is drawn', () => {
    open();
    press('Lasso (⌥Q): draw a loop around tiles to select them');
    fireEvent.pointerDown(canvas(), at(0, 0));
    expect(last().view.lasso).toHaveLength(1);
    fireEvent.pointerMove(canvas(), at(2, 1));
    expect(last().view.lasso).toHaveLength(2);
    fireEvent.pointerMove(canvas(), at(3, 0));
    expect(last().view.lasso).toHaveLength(3);
    fireEvent.pointerUp(canvas(), at(3, 0));
    expect(last().view.lasso).toBeNull();
  });

  it('draws each stroke of paint, which changes a layer canvas and not the grid', () => {
    const seen = open();
    const grid = seen.data;
    for (const tool of ['Paint pixels (⌥P)', 'Paint tiles (⌥B)', 'Erase (⌥E)', 'Line (⌥L)',
      'Rectangle (⌥R): drag a box. Hold Shift to fill it.', 'Ellipse (⌥O): drag a box. Hold Shift to fill it.']) {
      press(tool);
      const start = seen.data;
      let before = draws();
      fireEvent.pointerDown(canvas(), at(0, 0));
      expect(draws(), `${tool}: press`).toBeGreaterThan(before);
      before = draws();
      fireEvent.pointerMove(canvas(), at(2, 1));
      expect(draws(), `${tool}: drag`).toBeGreaterThan(before);
      expect(seen.data, `${tool}: nothing saved mid-stroke`).toBe(start);
      before = draws();
      fireEvent.pointerUp(canvas(), at(2, 1));
      expect(draws(), `${tool}: release`).toBeGreaterThan(before);
      expect(seen.data, `${tool}: saved on release`).not.toBe(start);
    }
    expect(seen.data).not.toBe(grid);
    // The layer's own canvas is what is drawn, the one the strokes went onto.
    const layer = seen.data.layers[0];
    expect(last().assets[layer.id].paint.fake2d.fillRect).toHaveBeenCalled();
  });

  it('draws after a fill, which paints and saves in one click', () => {
    const seen = open();
    for (const tool of ['Fill whole tiles (⌥F)', 'Magic fill (⌥G): fill joined pixels of one colour. Shift fills that colour everywhere.']) {
      press(tool);
      const start = seen.data;
      const before = draws();
      fireEvent.pointerDown(canvas(), at(1, 1));
      fireEvent.pointerUp(canvas(), at(1, 1));
      expect(draws(), tool).toBeGreaterThan(before);
      expect(seen.data, tool).not.toBe(start);
    }
  });

  it('draws a saved change at once, before the owner hands the new grid back', () => {
    // A post keeps its grids in the editor's own state, which answers a moment later.
    const grid = newGrid();
    render(page(<TileGrid data={grid} onChange={() => {}} editable startEditing />));
    press('Fill whole tiles (⌥F)');
    const before = draws();
    fireEvent.pointerDown(canvas(), at(1, 1));
    expect(draws()).toBeGreaterThan(before);
  });

  it('draws when another layer is picked: a move lifts the active layer only', () => {
    const two = normaliseGrid({ v: 3, cols: 4, rows: 2, layers: [pixelLayer('Under'), pixelLayer('Over')] });
    render(page(<TileGrid data={two} onChange={() => {}} editable startEditing />));
    const [under, over] = last().data.layers;
    expect(last().view.activeId).toBe(over.id);
    const before = draws();
    fireEvent.click(screen.getByLabelText('Under'));
    expect(draws()).toBeGreaterThan(before);
    expect(last().view.activeId).toBe(under.id);
  });

  it('draws without the editing marks once editing is done', () => {
    open();
    press('Done');
    expect(last().view).toMatchObject({ cursor: null, selection: null, showGrid: false, showLinks: false });
  });
});
