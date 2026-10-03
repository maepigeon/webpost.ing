import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DialogProvider } from '../components/Dialog/Dialog.jsx';

// The server is stood in for: every call answers with nothing, except the post itself.
vi.mock('../components/Pages/Posts/BasicTextPostServerApi.js', async (original) => {
  const real = await original();
  const quiet = Object.fromEntries(Object.keys(real).map(k => [k, vi.fn(() => Promise.resolve({}))]));
  return { ...quiet, READ_POST: vi.fn(), GET_USER_FROM_POST: vi.fn(() => Promise.resolve('mae')) };
});
vi.mock('axios', () => {
  const answer = () => Promise.resolve({ data: {} });
  const client = { get: vi.fn(answer), post: vi.fn(answer), put: vi.fn(answer), delete: vi.fn(answer), patch: vi.fn(answer) };
  return { default: { ...client, create: () => client, defaults: { headers: { common: {} } }, interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } } };
});

import RichTextViewer from '../components/Pages/Posts/PostRenderer/RichTextPost/Viewer.jsx';
import RichTextEditor from '../components/Pages/Posts/PostRenderer/RichTextPost/Editor.jsx';
import { READ_POST } from '../components/Pages/Posts/BasicTextPostServerApi.js';

const body = (text) => JSON.stringify({
  root: {
    type: 'root', version: 1, direction: 'ltr', format: '', indent: 0,
    children: [{
      type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0,
      children: [{ type: 'text', version: 1, text, format: 0, mode: 'normal', style: '', detail: 0 }],
    }],
  },
});
const post = (text) => ({ title: 'A post', slug: null, date: '2026-10-03', summary: 'About', published: true, backgroundPattern: '', description: body(text) });

const at = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <DialogProvider>
      <Routes>
        <Route path="/editor/:id" element={<RichTextEditor />} />
        <Route path="/:username/:id" element={<RichTextViewer />} />
      </Routes>
    </DialogProvider>
  </MemoryRouter>,
);
const open = () => at('/mae/7-a-post');

// Newer Node has a global localStorage that is undefined without a file: use a plain one.
let store;
let fail;
beforeEach(() => {
  store = new Map();
  fail = false;
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(k => (store.has(k) ? store.get(k) : null)),
    // "Full" here means no room for a post's body; small things still fit.
    setItem: vi.fn((k, v) => { if (fail && k === 'currentPostData') throw new DOMException('full', 'QuotaExceededError'); store.set(k, String(v)); }),
    removeItem: vi.fn(k => { if (fail) throw new DOMException('blocked', 'SecurityError'); store.delete(k); }),
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('reading a post', () => {
  it('shows the post without copying its body into localStorage', async () => {
    READ_POST.mockResolvedValue(post('Hello from the server'));
    open();
    expect(await screen.findByText('Hello from the server')).toBeInTheDocument();
    expect(localStorage.setItem.mock.calls.filter(([key]) => key === 'currentPostData')).toEqual([]);
    expect(store.has('currentPostData')).toBe(false);
  });

  it('shows the post it loaded, not a body another tab left in localStorage, and drops that copy', async () => {
    store.set('currentPostData', body('Some other post'));
    READ_POST.mockResolvedValue(post('The post that was asked for'));
    open();
    expect(await screen.findByText('The post that was asked for')).toBeInTheDocument();
    expect(screen.queryByText('Some other post')).toBeNull();
    expect(store.has('currentPostData')).toBe(false);
  });

  it('still shows a post too large for what is left of the browser\'s storage', async () => {
    READ_POST.mockResolvedValue(post('Readable all the same'));
    fail = true;
    open();
    expect(await screen.findByText('Readable all the same')).toBeInTheDocument();
    expect(screen.queryByText('Post not found')).toBeNull();
  });
});

describe('opening a post in the editor', () => {
  beforeEach(() => { store.set('userName', 'mae'); });   // the author: anyone else is sent to the reader's page
  const editorText = () => document.querySelector('.editor-contenteditable[contenteditable="true"]')?.textContent;

  it('loads the post from the server, with nothing in localStorage to start from', async () => {
    READ_POST.mockResolvedValue(post('Text to edit'));
    at('/editor/7');
    await waitFor(() => expect(editorText()).toBe('Text to edit'));
    expect(localStorage.setItem.mock.calls.filter(([key]) => key === 'currentPostData')).toEqual([]);
  });

  it('loads the post it asked for, not a body another tab left in localStorage, and drops that copy', async () => {
    store.set('currentPostData', body('Some other post'));
    READ_POST.mockResolvedValue(post('Text to edit'));
    at('/editor/7');
    await waitFor(() => expect(editorText()).toBe('Text to edit'));
    expect(screen.queryByText('Some other post')).toBeNull();
    expect(store.has('currentPostData')).toBe(false);
  });

  it('opens a post too large for what is left of the browser\'s storage', async () => {
    READ_POST.mockResolvedValue(post('Text to edit'));
    fail = true;
    at('/editor/7');
    await waitFor(() => expect(editorText()).toBe('Text to edit'));
  });
});
