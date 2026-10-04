import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../components/Pages/Posts/BasicTextPostServerApi.js', async (original) => {
  const real = await original();
  const quiet = Object.fromEntries(Object.keys(real).map(k => [k, vi.fn(() => Promise.resolve({}))]));
  return {
    ...quiet,
    GET_PIXEL_FONTS: vi.fn(() => Promise.resolve([{ id: 7, name: 'Mine', glyphs: { a: '00' } }])),
    CREATE_PIXEL_FONT: vi.fn(() => Promise.resolve({ id: 9 })),
  };
});
vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn(), create: () => ({}), defaults: { headers: { common: {} } }, interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } } }));

import { checkEquation, cleanCodeLabel } from '../components/Pages/Posts/PostRenderer/RichTextPost/Editor.jsx';
import GlyphEditor from '../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/GlyphEditor.jsx';
import { CREATE_PIXEL_FONT } from '../components/Pages/Posts/BasicTextPostServerApi.js';

describe('checkEquation', () => {
  it('refuses an empty entry without a complaint', () => {
    expect(checkEquation('   ')).toMatchObject({ ok: false, error: '' });
  });
  it('draws what it can and trims it', () => {
    const r = checkEquation('  \\frac{a}{b} ');
    expect(r.ok).toBe(true);
    expect(r.equation).toBe('\\frac{a}{b}');
    expect(r.html).toContain('katex');
  });
  it('refuses what cannot be drawn, with the reason', () => {
    const r = checkEquation('\\frac{a');
    expect(r.ok).toBe(false);
    expect(r.error).not.toBe('');
    expect(r.error).not.toMatch(/^KaTeX parse error/);
  });
});

describe('cleanCodeLabel', () => {
  it('keeps letters, digits and a few signs, and nothing that could carry markup', () => {
    expect(cleanCodeLabel('  C# <b>shell</b> ')).toBe('C# bshellb');
    expect(cleanCodeLabel('x'.repeat(40))).toHaveLength(24);
    expect(cleanCodeLabel('<>')).toBe('');
    expect(cleanCodeLabel(null)).toBe('');
  });
});

describe('naming a pixel font', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', { getItem: (k) => (k === 'userName' ? 'mae' : null), setItem() {}, removeItem() {} });
    vi.stubGlobal('prompt', vi.fn());
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it('asks in a field in the panel, not a browser prompt, and saves under that name', async () => {
    render(<GlyphEditor width={8} glyphs={{ a: '00' }} onChange={() => {}} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Save as font/ }));
    const field = screen.getByRole('textbox', { name: 'Name this pixel font' });
    fireEvent.change(field, { target: { value: 'Chunky' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => expect(CREATE_PIXEL_FONT).toHaveBeenCalledWith('mae', 'Chunky', { a: '00' }));
    expect(window.prompt).not.toHaveBeenCalled();
  });

  it('Escape drops the field without saving; an empty name is not saved', async () => {
    render(<GlyphEditor width={8} glyphs={{ a: '00' }} onChange={() => {}} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Save as font/ }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Name this pixel font' }), { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'Name this pixel font' })).toBeNull();
    expect(CREATE_PIXEL_FONT).not.toHaveBeenCalled();
  });

  it('lists the saved fonts in the grid dropdown, not a native select', async () => {
    const { container } = render(<GlyphEditor width={8} glyphs={{ a: '00' }} onChange={() => {}} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Your pixel fonts:/ })).toBeInTheDocument());
    expect(container.querySelector('select')).toBeNull();
  });
});
