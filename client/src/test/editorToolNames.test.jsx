import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DialogProvider } from '../components/Dialog/Dialog.jsx';

vi.mock('../components/Pages/Posts/BasicTextPostServerApi.js', async (original) => {
  const real = await original();
  const quiet = Object.fromEntries(Object.keys(real).map(k => [k, vi.fn(() => Promise.resolve({}))]));
  return { ...quiet };
});
vi.mock('axios', () => {
  const answer = () => Promise.resolve({ data: {} });
  const client = { get: vi.fn(answer), post: vi.fn(answer), put: vi.fn(answer), delete: vi.fn(answer), patch: vi.fn(answer) };
  return { default: { ...client, create: () => client, defaults: { headers: { common: {} } }, interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } } };
});

import RichTextEditor from '../components/Pages/Posts/PostRenderer/RichTextPost/Editor.jsx';

// Newer Node has a global localStorage that is undefined without a file: use a plain one.
let store;
beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const show = () => render(
  <MemoryRouter initialEntries={['/editor']}>
    <DialogProvider>
      <Routes><Route path="/editor" element={<RichTextEditor />} /></Routes>
    </DialogProvider>
  </MemoryRouter>,
);

// A control with no name is silent to a screen reader and has no hover label.
describe('the post tools', () => {
  it('every control in the tool panel has a name, and a hover label', async () => {
    show();
    const panel = await waitFor(() => screen.getByRole('toolbar', { name: 'Post tools' }));
    const controls = [...panel.querySelectorAll('button, input:not([type="hidden"])')];
    expect(controls.length).toBeGreaterThan(10);
    const unnamed = controls.filter(c => {
      const name = c.getAttribute('aria-label') || c.getAttribute('title') || c.textContent.trim();
      return !name.trim();
    });
    expect(unnamed.map(c => c.outerHTML)).toEqual([]);
    const noTip = [...panel.querySelectorAll('button.gb')].filter(b => !b.getAttribute('data-tip'));
    expect(noTip.map(b => b.outerHTML)).toEqual([]);
  });
});

describe('the kept-draft bar', () => {
  const keep = () => store.set('draft:post:new', JSON.stringify({
    v: 1, savedAt: Date.now(),
    data: { title: 'Kept title', summary: '', section: 'profile', slug: null, folder: '', wallpaper: '' },
  }));

  it.each(['Restore', 'Discard'])('%s sends focus to the writing surface, not the page', async (name) => {
    keep();
    show();
    fireEvent.click(await screen.findByRole('button', { name }));
    expect(screen.queryByText(/Unsaved changes from/)).toBeNull();
    expect(document.activeElement).toBe(document.querySelector('.editor-contenteditable'));
  });
});
