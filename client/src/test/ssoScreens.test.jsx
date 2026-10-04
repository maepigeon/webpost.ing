import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import Login from '../components/Pages/Auth/Login/Login.jsx';
import Registration from '../components/Pages/Auth/Registration/Registration.jsx';
import ChooseUsername from '../components/Pages/Auth/Login/ChooseUsername.jsx';
import SignInMethods from '../components/Pages/Settings/SignInMethods.jsx';

vi.mock('axios');

const both = [{ id: 'google', name: 'Google' }, { id: 'microsoft', name: 'Microsoft' }];
const mount = (ui, path = '/') => render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);

/** Answers GETs by the end of their address; anything else never answers. */
const answers = (byPath) => axios.get.mockImplementation((url) => {
  const hit = Object.keys(byPath).find(p => url.endsWith(p));
  if (!hit) return new Promise(() => {});
  const value = byPath[hit];
  return value instanceof Error ? Promise.reject(value) : Promise.resolve({ data: value });
});
const config = (over = {}) => ({ inviteRequired: false, turnstileSiteKey: null, mailEnabled: true, ...over });
const httpError = (status, data) => Object.assign(new Error('http'), { response: { status, data } });

/** SettingsPage's folding section, cut down to what the test needs. */
function Section({ id, title, children }) {
  return <details id={`settings-${id}`}><summary>{title}</summary>{children}</details>;
}

// This Node has no localStorage of its own in tests; a small one in memory stands in.
let stored;
beforeEach(() => {
  vi.resetAllMocks();
  stored = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k) => (stored.has(k) ? stored.get(k) : null),
    setItem: (k, v) => { stored.set(k, String(v)); },
    removeItem: (k) => { stored.delete(k); },
  });
});

describe('provider buttons on sign-in and sign-up', () => {
  it('are not there when the server lists no providers', async () => {
    answers({ '/api/signup/config': config() });
    mount(<Login />);
    await waitFor(() => expect(axios.get).toHaveBeenCalled());
    await screen.findByRole('link', { name: 'Forgot password?' });
    expect(screen.queryByText(/Continue with/)).toBeNull();
    expect(screen.queryByText('or')).toBeNull();
  });

  it('are not there either when the config has no such field at all (an older server)', async () => {
    answers({ '/api/signup/config': { inviteRequired: true, turnstileSiteKey: null, mailEnabled: true } });
    mount(<Registration />);
    await waitFor(() => expect(axios.get).toHaveBeenCalled());
    expect(screen.queryByText(/Continue with/)).toBeNull();
  });

  it('show one link per provider that is on, each to that provider\'s start address', async () => {
    answers({ '/api/signup/config': config({ ssoProviders: both }) });
    mount(<Login />);
    const google = await screen.findByRole('link', { name: 'Continue with Google' });
    expect(google.getAttribute('href')).toMatch(/\/api\/auth\/sso\/google\/start$/);
    expect(screen.getByRole('link', { name: 'Continue with Microsoft' }).getAttribute('href'))
      .toMatch(/\/api\/auth\/sso\/microsoft\/start$/);
    // The password form is still there and still first.
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('show only the one that is on, on the sign-up card too', async () => {
    answers({ '/api/signup/config': config({ ssoProviders: [both[1]] }) });
    mount(<Registration />);
    expect(await screen.findByRole('link', { name: 'Continue with Microsoft' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Continue with Google' })).toBeNull();
  });
});

describe('coming back to the sign-in page', () => {
  it('says why nobody was signed in', async () => {
    answers({ '/api/signup/config': config({ ssoProviders: both }) });
    mount(<Login />, '/routes/Login?sso=exists');
    const line = screen.getByText(
      'An account with this email exists. Sign in with your password, then link this provider in Settings.');
    expect(line).toHaveAttribute('role', 'status');
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('with ok, asks the server who is signed in and remembers them', async () => {
    answers({ '/api/signup/config': config({ ssoProviders: both }), '/api/admin/me': { isAdmin: false } });
    axios.post.mockResolvedValue({ data: 'mae' });
    mount(<Login />, '/routes/Login?sso=ok');
    await waitFor(() => expect(localStorage.getItem('userName')).toBe('mae'));
    expect(axios.post.mock.calls[0][0]).toMatch(/\/api\/authorizeSession$/);
    await waitFor(() => expect(localStorage.getItem('isAdmin')).toBe('0'));
  });

  it('with ok but no session, says the sign-in did not finish', async () => {
    answers({ '/api/signup/config': config() });
    axios.post.mockRejectedValue(httpError(401, 'Not signed in'));
    mount(<Login />, '/routes/Login?sso=ok');
    expect(await screen.findByRole('alert')).toHaveTextContent('That sign-in did not finish. Try again.');
    expect(localStorage.getItem('userName')).toBeNull();
  });
});

describe('ChooseUsername', () => {
  it('says so when no sign-in is waiting', async () => {
    answers({ '/api/auth/sso/pending': httpError(404, { message: 'That sign-in ran out. Start again.' }) });
    mount(<ChooseUsername />);
    expect(await screen.findByRole('status')).toHaveTextContent('That sign-in ran out. Start again.');
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/routes/Login');
    expect(screen.queryByPlaceholderText('Username')).toBeNull();
  });

  it('shows which account is waiting, checks the name here first, then sends it', async () => {
    answers({
      '/api/auth/sso/pending': { provider: 'google', providerName: 'Google', email: 'mae@example.test', inviteRequired: false },
      '/api/admin/me': { isAdmin: false },
    });
    axios.post.mockResolvedValue({ data: { username: 'mae', signedIn: true } });
    mount(<ChooseUsername />);
    expect(await screen.findByText('mae@example.test')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Invite code')).toBeNull();

    const name = screen.getByPlaceholderText('Username');
    fireEvent.change(name, { target: { value: 'no spaces' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Letters, numbers, _ and - only.').id).toBe('username-error');
    expect(axios.post).not.toHaveBeenCalled();

    fireEvent.change(name, { target: { value: ' mae ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(axios.post).toHaveBeenCalled());
    const [url, payload] = axios.post.mock.calls[0];
    expect(url).toMatch(/\/api\/auth\/sso\/complete$/);
    expect(payload).toEqual({ username: 'mae' });
    await waitFor(() => expect(localStorage.getItem('userName')).toBe('mae'));
  });

  it('asks for the invite code when one is needed and pins a taken name on its field', async () => {
    answers({ '/api/auth/sso/pending': { provider: 'microsoft', providerName: 'Microsoft', email: null, inviteRequired: true } });
    axios.post.mockRejectedValue(httpError(409, { message: 'Username already taken.' }));
    mount(<ChooseUsername />);
    const code = await screen.findByPlaceholderText('Invite code');
    expect(screen.getByText('Signed in with Microsoft')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'mae' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Enter your invite code.')).toBeInTheDocument();
    expect(axios.post).not.toHaveBeenCalled();

    fireEvent.change(code, { target: { value: ' ABC-123 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    const pinned = await screen.findByText('Username already taken.');
    expect(pinned.id).toBe('username-error');
    expect(axios.post.mock.calls[0][1]).toEqual({ username: 'mae', inviteCode: 'ABC-123' });
    expect(localStorage.getItem('userName')).toBeNull();
    expect(screen.getByRole('button', { name: 'Create account' })).not.toBeDisabled();
  });
});

describe('Settings > Sign-in methods', () => {
  const methods = (over) => ({ hasPassword: true, fresh: false, methods: [], ...over });
  const google = (over = {}) => ({ provider: 'google', name: 'Google', enabled: true, linked: false, ...over });
  const microsoft = (over = {}) => ({ provider: 'microsoft', name: 'Microsoft', enabled: true, linked: false, ...over });

  it('is not drawn at all when single sign-on is off and nothing is linked', async () => {
    answers({ '/api/auth/sso/methods': methods() });
    const { container } = mount(<SignInMethods Section={Section} />);
    await waitFor(() => expect(axios.get).toHaveBeenCalled());
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });

  it('is not drawn when the answer cannot be loaded', async () => {
    answers({ '/api/auth/sso/methods': httpError(500, 'x') });
    const { container } = mount(<SignInMethods Section={Section} />);
    await waitFor(() => expect(axios.get).toHaveBeenCalled());
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });

  it('linking asks for the password and then goes where the server says', async () => {
    answers({ '/api/auth/sso/methods': methods({ methods: [google(), microsoft()] }) });
    axios.post.mockReturnValue(new Promise(() => {}));
    mount(<SignInMethods Section={Section} />);
    expect(await screen.findByText('Sign-in methods')).toBeInTheDocument();
    expect(screen.getByText('Set')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set a password' })).toBeNull();
    expect(screen.getAllByText('Not linked')).toHaveLength(2);

    fireEvent.click(screen.getAllByRole('button', { name: 'Link' })[0]);
    expect(axios.post).not.toHaveBeenCalled();
    const go = screen.getByRole('button', { name: 'Continue to Google' });
    expect(go).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('Your password'), { target: { value: 'hunter2-Hunter2!' } });
    fireEvent.click(go);
    await waitFor(() => expect(axios.post).toHaveBeenCalled());
    expect(axios.post.mock.calls[0][0]).toMatch(/\/api\/auth\/sso\/google\/link$/);
    expect(axios.post.mock.calls[0][1]).toEqual({ password: 'hunter2-Hunter2!' });
  });

  it('a wrong password is said plainly and nothing leaves the page', async () => {
    answers({ '/api/auth/sso/methods': methods({ methods: [google({ linked: true, email: 'a@b.test', canUnlink: true })] }) });
    axios.post.mockRejectedValue(httpError(403, { message: 'That password is not right.' }));
    mount(<SignInMethods Section={Section} />);
    expect(await screen.findByText('Linked as a@b.test')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Unlink' }));
    fireEvent.change(screen.getByPlaceholderText('Your password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlink Google' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That password is not right.');
    expect(axios.post.mock.calls[0][0]).toMatch(/\/api\/auth\/sso\/google\/unlink$/);
  });

  it('the only way to sign in cannot be unlinked, and the reason is shown', async () => {
    answers({ '/api/auth/sso/methods': methods({
      hasPassword: false, fresh: true, methods: [google({ linked: true, email: 'a@b.test', canUnlink: false })] }) });
    mount(<SignInMethods Section={Section} />);
    expect(await screen.findByText('None yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlink' })).toBeDisabled();
    expect(screen.getByText('Linked as a@b.test. Set a password before unlinking.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set a password' })).not.toBeDisabled();
  });

  it('an account with no password sets one, straight after signing in with its provider', async () => {
    answers({ '/api/auth/sso/methods': methods({
      hasPassword: false, fresh: true, methods: [google({ linked: true, canUnlink: false })] }) });
    axios.post.mockResolvedValue({ data: { message: 'Password set. You can now sign in with your username and password.' } });
    mount(<SignInMethods Section={Section} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Set a password' }));
    const set = screen.getByRole('button', { name: 'Set password' });
    fireEvent.change(screen.getByPlaceholderText('New password'), { target: { value: 'short' } });
    expect(set).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('New password'), { target: { value: 'Correct-Horse-9battery' } });
    fireEvent.change(screen.getByPlaceholderText('New password again'), { target: { value: 'Correct-Horse-9batterx' } });
    expect(screen.getByRole('alert')).toHaveTextContent('don’t match');
    expect(set).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('New password again'), { target: { value: 'Correct-Horse-9battery' } });
    fireEvent.click(set);
    await waitFor(() => expect(axios.post).toHaveBeenCalled());
    expect(axios.post.mock.calls[0][0]).toMatch(/\/api\/auth\/sso\/password$/);
    expect(axios.post.mock.calls[0][1]).toEqual({ newPassword: 'Correct-Horse-9battery' });
    expect(await screen.findByText('Password set. You can now sign in with your username and password.')).toBeInTheDocument();
  });

  it('when that sign-in was a while ago, it offers to sign in again instead of failing', async () => {
    answers({ '/api/auth/sso/methods': methods({
      hasPassword: false, fresh: false,
      methods: [google({ linked: true, canUnlink: true }), microsoft({ linked: true, enabled: false, canUnlink: true })] }) });
    mount(<SignInMethods Section={Section} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Set a password' }));
    expect(screen.queryByPlaceholderText('New password')).toBeNull();
    expect(screen.getByText('Sign in again first, then make your change within 5 minutes.')).toBeInTheDocument();
    // Only a linked provider that is switched on can be used for it.
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue with Microsoft' })).toBeNull();
    expect(screen.getByText(/switched off on this site/)).toBeInTheDocument();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('back from a provider, unfolds itself and says what happened', async () => {
    answers({ '/api/auth/sso/methods': methods({ methods: [google({ linked: true, canUnlink: true })] }) });
    mount(<SignInMethods Section={Section} />, '/settings?sso=linked');
    expect(await screen.findByRole('status')).toHaveTextContent('Linked. You can now sign in with it.');
    expect(document.getElementById('settings-signin').open).toBe(true);
  });

  it('back from a provider with bad news, says it as an error', async () => {
    answers({ '/api/auth/sso/methods': methods({ methods: [google()] }) });
    mount(<SignInMethods Section={Section} />, '/settings?sso=taken');
    expect(await screen.findByRole('alert')).toHaveTextContent('That account is already linked to another member here.');
  });
});
