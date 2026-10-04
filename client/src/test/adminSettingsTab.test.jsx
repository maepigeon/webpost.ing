import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('axios', () => ({ default: { get: vi.fn(), defaults: {} } }));
vi.mock('../components/Pages/Posts/BasicTextPostServerApi.js', () => ({
  ADMIN_GET_SETTINGS: vi.fn(),
  ADMIN_UPDATE_SETTING: vi.fn(),
}));

import axios from 'axios';
import { ADMIN_GET_SETTINGS, ADMIN_UPDATE_SETTING } from '../components/Pages/Posts/BasicTextPostServerApi.js';
import SettingsTab from '../components/Pages/Auth/AdminPanel/SettingsTab.jsx';

const config = (o = {}) => ({ data: { inviteRequired: true, turnstileSiteKey: null, mailEnabled: false, ...o } });

beforeEach(() => {
  vi.resetAllMocks();
  ADMIN_GET_SETTINGS.mockResolvedValue({ max_daily_registrations: '5', invite_required: 'true', require_verified_email: 'false' });
  axios.get.mockResolvedValue(config());
});

describe('SettingsTab', () => {
  it('shows plain labels and no raw keys', async () => {
    const { container } = render(<SettingsTab flash={vi.fn()} />);
    await screen.findByText('Sign-ups per day');
    expect(screen.getByRole('switch', { name: 'Invite code needed to sign up' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'Confirm email before posting' })).toHaveAttribute('aria-checked', 'false');
    expect(container.textContent).not.toMatch(/max_daily_registrations|invite_required|require_verified_email/);
  });

  it('says so when settings cannot be loaded', async () => {
    ADMIN_GET_SETTINGS.mockRejectedValue(new Error('no'));
    render(<SettingsTab flash={vi.fn()} />);
    expect(await screen.findByText('Could not load settings.')).toBeInTheDocument();
  });

  it('saves a switch at once and flashes', async () => {
    ADMIN_UPDATE_SETTING.mockResolvedValue({});
    const flash = vi.fn();
    render(<SettingsTab flash={flash} />);
    const sw = await screen.findByRole('switch', { name: 'Confirm email before posting' });
    fireEvent.click(sw);
    expect(sw).toHaveAttribute('aria-checked', 'true');
    expect(sw).toBeDisabled();
    await waitFor(() => expect(flash).toHaveBeenCalledWith('Saved.'));
    expect(ADMIN_UPDATE_SETTING).toHaveBeenCalledWith('require_verified_email', 'true');
    expect(sw).not.toBeDisabled();
  });

  it('puts a switch back and says so when saving fails', async () => {
    ADMIN_UPDATE_SETTING.mockRejectedValue(new Error('no'));
    const flash = vi.fn();
    render(<SettingsTab flash={flash} />);
    const sw = await screen.findByRole('switch', { name: 'Invite code needed to sign up' });
    fireEvent.click(sw);
    await waitFor(() => expect(flash).toHaveBeenCalledWith('Could not save that setting.'));
    expect(sw).toHaveAttribute('aria-checked', 'true');
  });

  it('warns about the invite switch only while it is off and nothing else protects sign-up', async () => {
    ADMIN_UPDATE_SETTING.mockResolvedValue({});
    render(<SettingsTab flash={vi.fn()} />);
    const sw = await screen.findByRole('switch', { name: 'Invite code needed to sign up' });
    expect(screen.queryByText(/Anyone can create an account/)).toBeNull();
    fireEvent.click(sw);
    expect(await screen.findByText(/Anyone can create an account/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('switch', { name: 'Invite code needed to sign up' }));
    await waitFor(() => expect(screen.queryByText(/Anyone can create an account/)).toBeNull());
  });

  it('warns that the email rule does nothing while mail is off', async () => {
    ADMIN_GET_SETTINGS.mockResolvedValue({ require_verified_email: 'true' });
    render(<SettingsTab flash={vi.fn()} />);
    expect(await screen.findByText('Email sending is not switched on yet, so this does nothing for now.')).toBeInTheDocument();
  });

  it('enables Save only for a changed, valid number and shows the message otherwise', async () => {
    ADMIN_UPDATE_SETTING.mockResolvedValue({});
    const flash = vi.fn();
    render(<SettingsTab flash={flash} />);
    const input = await screen.findByLabelText('Sign-ups per day');
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    fireEvent.change(input, { target: { value: '20000' } });
    expect(save).toBeDisabled();
    expect(screen.getByText('Use a whole number from -1 to 10000.')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '-1' } });
    expect(save).not.toBeDisabled();
    expect(screen.queryByText('Use a whole number from -1 to 10000.')).toBeNull();
    fireEvent.click(save);
    await waitFor(() => expect(ADMIN_UPDATE_SETTING).toHaveBeenCalledWith('max_daily_registrations', -1));
    await waitFor(() => expect(flash).toHaveBeenCalledWith('Saved.'));
    expect(save).toBeDisabled();
  });
});
