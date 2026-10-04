import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Newer Node has a global localStorage that is undefined without a file: use a plain one.
const store = new Map();
vi.stubGlobal('localStorage', {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => store.clear(),
});

let check;
vi.mock('../components/Pages/Posts/BasicTextPostServerApi', () => ({
  AUTHORIZE_SESSION: vi.fn(() => check),
  GET_COUNTERS: vi.fn(() => Promise.resolve({})),
}));
vi.mock('../components/Navbar/useUnreadCounts.js', () => ({
  useUnreadCounts: () => ({ messages: 0, notifications: 0 }),
}));

import Navbar from '../components/Navbar/Navbar.jsx';
import { handleExpiredSession } from '../utils/session.js';

const accountMenu = (c) => c.querySelector('.nav-account');

beforeEach(() => {
  localStorage.setItem('userName', 'test');
  check = new Promise(() => {});   // the server has not answered
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  window.history.pushState({}, '', '/');
});

describe('Navbar signed-in state', () => {
  it('shows the account menu while a name is stored', async () => {
    const { container } = render(<MemoryRouter><Navbar /></MemoryRouter>);
    await act(async () => {});
    expect(accountMenu(container)).not.toBeNull();
  });

  it('shows what a signed-out visitor sees once the server rejects the session on the sign-in page', async () => {
    window.history.pushState({}, '', '/routes/Login?expired=1');
    // What the 401 interceptor does before the rejection reaches its callers.
    check = Promise.reject(new Error('401')).catch((e) => { handleExpiredSession(); throw e; });
    const { container } = render(<MemoryRouter initialEntries={['/routes/Login?expired=1']}><Navbar /></MemoryRouter>);
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    expect(localStorage.getItem('userName')).toBeNull();
    expect(accountMenu(container)).toBeNull();
    expect(container.textContent).toContain('Log In');   // jsdom has no widths, so the visitor's items may sit in More or off-screen
  });

  it('drops the account menu when told the session was cleared', async () => {
    const { container } = render(<MemoryRouter><Navbar /></MemoryRouter>);
    await act(async () => {});
    expect(accountMenu(container)).not.toBeNull();
    await act(async () => {
      localStorage.removeItem('userName');
      window.dispatchEvent(new Event('wp:session-cleared'));   // what clearLocalSession should send
    });
    expect(accountMenu(container)).toBeNull();
  });
});
