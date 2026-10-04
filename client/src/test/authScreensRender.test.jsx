import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import Login from '../components/Pages/Auth/Login/Login.jsx';
import Registration, { PasswordRequirements } from '../components/Pages/Auth/Registration/Registration.jsx';

vi.mock('axios');

const mount = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);
const config = (over = {}) => axios.get.mockResolvedValue({
  data: { inviteRequired: true, turnstileSiteKey: null, mailEnabled: true, ...over },
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe('Login', () => {
  it('shows a Forgot password link while the config loads and when mail is on', async () => {
    axios.get.mockReturnValue(new Promise(() => {}));
    mount(<Login />);
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password');
    expect(screen.getByRole('link', { name: 'Create an account' })).toBeInTheDocument();
    expect(screen.queryByText(/invite code needed/)).toBeNull();
  });

  it('says an invite is needed once the config says so', async () => {
    config({ inviteRequired: true });
    mount(<Login />);
    expect(await screen.findByText(/invite code needed/)).toBeInTheDocument();
  });

  it('with mail off, swaps the link for a button that shows one line on click', async () => {
    config({ mailEnabled: false, inviteRequired: false });
    mount(<Login />);
    const button = await screen.findByRole('button', { name: 'Forgot your password?' });
    expect(screen.queryByRole('link', { name: /Forgot/ })).toBeNull();
    expect(screen.queryByText(/not switched on/)).toBeNull();
    fireEvent.click(button);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Email is not switched on yet, so passwords cannot be reset by email. Ask the site admin to set a new one.');
  });

  it('the password field has a Show/Hide button and never autosaves', async () => {
    config();
    mount(<Login />);
    const pw = screen.getByPlaceholderText('Password');
    expect(pw).toHaveAttribute('type', 'password');
    expect(pw).toHaveAttribute('autocomplete', 'current-password');
    expect(pw).toHaveAttribute('name', 'password');
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle).toHaveAttribute('type', 'button');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(pw).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
    const user = screen.getByPlaceholderText('Username');
    expect(user).toHaveAttribute('autocapitalize', 'none');
    expect(user).toHaveAttribute('spellcheck', 'false');
  });
});

describe('Registration', () => {
  const fill = (values) => {
    for (const [placeholder, value] of Object.entries(values)) {
      fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });
    }
  };
  // The config answers after the first render; wait for it to drop the invite field.
  const noInviteField = () => waitFor(() => expect(screen.queryByPlaceholderText('Invite code')).toBeNull());
  const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

  it('shows the rules as soon as the password is focused, before typing', async () => {
    config();
    mount(<Registration />);
    expect(screen.queryByText(/At least 12 characters/)).toBeNull();
    fireEvent.focus(screen.getByPlaceholderText('Password'));
    expect(screen.getByText(/At least 12 characters/)).toBeInTheDocument();
    expect(screen.queryByText(/72 bytes/)).toBeNull();
  });

  it('puts a message under each field that fails and sends nothing', async () => {
    config();
    mount(<Registration />);
    await waitFor(() => expect(axios.get).toHaveBeenCalled());
    submit();
    const username = screen.getByPlaceholderText('Username');
    expect(username).toHaveAttribute('aria-invalid', 'true');
    expect(username.getAttribute('aria-describedby')).toBe('username-error');
    expect(document.getElementById('username-error')).toHaveAttribute('role', 'alert');
    expect(screen.getByText('Enter your invite code.')).toBeInTheDocument();
    expect(screen.getByText('Type the password again.')).toBeInTheDocument();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('does not ask for or send an invite code when none is required', async () => {
    config({ inviteRequired: false });
    axios.post.mockResolvedValue({ data: 'ok' });
    mount(<Registration />);
    await noInviteField();
    fill({ Username: 'mae', Email: 'm@e.io', Password: 'Correct-Horse-9battery', 'Confirm password': 'Correct-Horse-9battery' });
    submit();
    await waitFor(() => expect(axios.post).toHaveBeenCalled());
    const [url, payload] = axios.post.mock.calls[0];
    expect(url).toMatch(/\/api\/register$/);
    expect(payload).toEqual({ username: 'mae', email: 'm@e.io', password: 'Correct-Horse-9battery' });
  });

  it('pins a server error on the field it names', async () => {
    config({ inviteRequired: false });
    axios.post.mockRejectedValue({ response: { data: 'Username already taken.' } });
    mount(<Registration />);
    await noInviteField();
    fill({ Username: 'mae', Email: 'm@e.io', Password: 'Correct-Horse-9battery', 'Confirm password': 'Correct-Horse-9battery' });
    submit();
    const msg = await screen.findByText('Username already taken.');
    expect(msg.id).toBe('username-error');
  });

  it('shows other server errors in one line above the button', async () => {
    config({ inviteRequired: false });
    axios.post.mockRejectedValue({ response: { data: 'Too many sign-ups. Try again later.' } });
    mount(<Registration />);
    await noInviteField();
    fill({ Username: 'mae', Email: 'm@e.io', Password: 'Correct-Horse-9battery', 'Confirm password': 'Correct-Horse-9battery' });
    submit();
    const msg = await screen.findByText('Too many sign-ups. Try again later.');
    expect(msg).toHaveAttribute('role', 'alert');
    expect(msg.className).toBe('login-error');
  });
});

describe('PasswordRequirements', () => {
  it('still takes { password } and adds the byte rule only when over', () => {
    const { container, rerender } = render(<PasswordRequirements password="abc" />);
    expect(container.querySelectorAll('li')).toHaveLength(5);
    rerender(<PasswordRequirements password={'aA1!'.repeat(19)} />);
    expect(container.querySelectorAll('li')).toHaveLength(6);
    expect(container).toHaveTextContent('At most 72 bytes (long non-English text counts more)');
  });
});
