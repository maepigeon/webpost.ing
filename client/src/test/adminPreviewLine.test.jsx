import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn(), defaults: {} } }));
vi.mock('../components/Dialog/Dialog.jsx', () => ({ useDialog: () => ({ confirm: vi.fn(() => Promise.resolve(true)) }) }));
vi.mock('../utils/build.js', () => ({
  BUILD: { commit: 'abc1234def', time: '' },
  fetchLatestBuild: vi.fn(() => Promise.resolve({ available: false })),
}));
vi.mock('../components/Pages/Posts/BasicTextPostServerApi.js', async (orig) => ({
  ...(await orig()),
  ADMIN_GET_STATUS: vi.fn(() => Promise.resolve({ isAdmin: true })),
  ADMIN_LIST_USERS: vi.fn(() => Promise.resolve([])),
  ADMIN_GET_STATS: vi.fn(() => Promise.resolve({ totalUsers: 3, totalStorage: 0 })),
}));

import axios from 'axios';
import PreviewLine from '../components/Pages/Auth/AdminPanel/PreviewLine.jsx';
import AdminPanel from '../components/Pages/Auth/AdminPanel/AdminPanel.jsx';
import { previewLineText, previewsLeft } from '../components/Pages/Auth/AdminPanel/previewLine.js';

beforeEach(() => { vi.clearAllMocks(); });

describe('previewLineText', () => {
  it('says how many are left, or that it is up to date, or nothing while unknown', () => {
    expect(previewLineText({ remaining: 12 })).toBe('Card previews: 12 left');
    expect(previewLineText({ remaining: 0 })).toBe('Card previews: up to date');
    expect(previewLineText(null)).toBe('');
    expect(previewLineText({})).toBe('');
    expect(previewsLeft({ remaining: 'x' })).toBeNull();
  });
});

describe('PreviewLine', () => {
  it('shows the count with a Run now button that updates the line', async () => {
    axios.get.mockResolvedValue({ data: { remaining: 5 } });
    axios.post.mockResolvedValue({ data: { remaining: 0 } });
    render(<PreviewLine flash={vi.fn()} />);
    expect(await screen.findByText('Card previews: 5 left')).toBeInTheDocument();
    expect(axios.get.mock.calls[0][0]).toMatch(/\/api\/admin\/previews$/);
    fireEvent.click(screen.getByRole('button', { name: 'Run now' }));
    expect(await screen.findByText('Card previews: up to date')).toBeInTheDocument();
    expect(axios.post.mock.calls[0][0]).toMatch(/\/api\/admin\/previews\/run$/);
    expect(screen.queryByRole('button', { name: 'Run now' })).toBeNull();
  });

  it('has no button when nothing is left', async () => {
    axios.get.mockResolvedValue({ data: { remaining: 0 } });
    render(<PreviewLine flash={vi.fn()} />);
    expect(await screen.findByText('Card previews: up to date')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('draws nothing when the status cannot be read, and flashes the server message when a run fails', async () => {
    axios.get.mockRejectedValueOnce(new Error('no'));
    const { container } = render(<PreviewLine flash={vi.fn()} />);
    await waitFor(() => expect(axios.get).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();

    axios.get.mockResolvedValue({ data: { remaining: 2 } });
    axios.post.mockRejectedValue({ response: { data: 'Busy, try again.' } });
    const flash = vi.fn();
    render(<PreviewLine flash={flash} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Run now' }));
    await waitFor(() => expect(flash).toHaveBeenCalledWith('Busy, try again.'));
  });
});

describe('AdminPanel', () => {
  const open = () => render(<MemoryRouter><AdminPanel /></MemoryRouter>);

  it('lets an admin-set password run to 128 characters', async () => {
    open();
    const pw = await screen.findByPlaceholderText('Password');
    expect(pw).toHaveAttribute('maxlength', '128');
  });

  it('marks the chosen tab and shows the previews line on Stats', async () => {
    axios.get.mockResolvedValue({ data: { remaining: 4 } });
    open();
    const users = await screen.findByRole('button', { name: 'Users' });
    expect(users).toHaveClass('admin-tab--active');
    const stats = screen.getByRole('button', { name: 'Stats' });
    fireEvent.click(stats);
    expect(stats).toHaveClass('admin-tab--active');
    expect(users).not.toHaveClass('admin-tab--active');
    expect(await screen.findByText('Card previews: 4 left')).toBeInTheDocument();
  });
});
