import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../components/Pages/Posts/BasicTextPostServerApi.js', () => ({
  GET_RECENTLY_ACTIVE_USERS: () => Promise.resolve([{ username: 'ann' }]),
  GET_USER_AVATAR: () => Promise.resolve({}),
}));
vi.mock('../components/Pages/Home/WaterTitle.jsx', () => ({ default: () => null }));

vi.mock('../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/TileGrid.jsx', () => ({ default: () => null }));

import { DialogProvider } from '../components/Dialog/Dialog.jsx';
import Home from '../components/Pages/Home/Home.jsx';

const store = {};
vi.stubGlobal('localStorage', {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
});

describe('Home', () => {
  it('offers sign-up when signed out', async () => {
    localStorage.removeItem('userName');
    render(<DialogProvider><MemoryRouter><Home /></MemoryRouter></DialogProvider>);
    expect(screen.getByRole('link', { name: 'Create an account' }).getAttribute('href')).toBe('/routes/NewAccount');
    expect(screen.getByRole('link', { name: 'Look around' }).getAttribute('href')).toBe('/discover');
    expect(await screen.findByText('ann')).toBeTruthy();
  });
  it('offers a new post when signed in', () => {
    localStorage.setItem('userName', 'ann');
    render(<DialogProvider><MemoryRouter><Home /></MemoryRouter></DialogProvider>);
    expect(screen.getByRole('link', { name: 'New post' }).getAttribute('href')).toBe('/editor');
    localStorage.removeItem('userName');
  });
});
