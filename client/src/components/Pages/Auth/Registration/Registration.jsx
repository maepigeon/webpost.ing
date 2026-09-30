import { useState } from 'react';
import axios from 'axios';
import { BASE_URL as baseUrl } from '../../../../config.js';
import { ADMIN_GET_STATUS } from '../../Posts/BasicTextPostServerApi.js';
import { Link } from 'react-router-dom';
import '../Login/Login.css';
import { usePageTitle } from '../../../../utils/usePageTitle.js';
import { errorMessage } from '../../../../utils/errorMessage.js';

function checkPassword(pw) {
  return {
    length:    pw.length >= 12,
    upper:     /[A-Z]/.test(pw),
    lower:     /[a-z]/.test(pw),
    digit:     /[0-9]/.test(pw),
    special:   /[^A-Za-z0-9]/.test(pw),
    maxLength: pw.length <= 128,
  };
}

export function PasswordRequirements({ password }) {
  const c = checkPassword(password);
  const items = [
    [c.length,  'At least 12 characters'],
    [c.upper,   'One uppercase letter'],
    [c.lower,   'One lowercase letter'],
    [c.digit,   'One number'],
    [c.special, 'One special character'],
  ];
  return (
    <ul className="password-requirements">
      {items.map(([ok, label]) => (
        <li key={label} className={ok ? 'is-met' : undefined}>
          {ok ? '✓' : '–'} {label}
        </li>
      ))}
    </ul>
  );
}

function Registration() {
  usePageTitle('Create account');
  const [username, setUsername]           = useState('');
  const [email, setEmail]                 = useState('');
  const [password, setPassword]           = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode]       = useState('');
  const [error, setError]                 = useState('');
  const [loading, setLoading]             = useState(false);

  const pwChecks = checkPassword(password);
  const pwValid  = Object.values(pwChecks).every(Boolean);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!username || !email || !password || !confirmPassword || !inviteCode) {
      setError('Please fill in all fields.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!pwValid) {
      setError('Password does not meet requirements.');
      return;
    }

    setLoading(true);
    try {
      await axios.post(baseUrl + '/api/register', { username, email, password, inviteCode });
      // Auto-login after successful registration
      await axios.post(baseUrl + '/api/loginSessionAttempt',
        { username: username.trim(), password },
        { withCredentials: true });
      localStorage.setItem('userName', username.trim());
      try {
        const d = await ADMIN_GET_STATUS();
        localStorage.setItem('isAdmin', d.isAdmin ? '1' : '0');
      } catch {
        localStorage.setItem('isAdmin', '0');
      }
      window.location.href = `/${username.trim()}`;
    } catch (e) {
      setError(errorMessage(e, 'Registration failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <span className="login-logo-text">webpost.ing</span>
          <span className="login-subtitle">Create an account</span>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="login-field">
            <label className="login-label" htmlFor="inviteCode">Invite code</label>
            <input
              className="login-input"
              type="text"
              id="inviteCode"
              value={inviteCode}
              onChange={e => setInviteCode(e.target.value)}
              placeholder="paste your invite code"
              autoComplete="off"
              required
            />
          </div>
          <div className="login-field">
            <label className="login-label" htmlFor="username">Username</label>
            <input
              className="login-input"
              type="text"
              id="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="choose a username"
              autoComplete="username"
              required
            />
          </div>
          <div className="login-field">
            <label className="login-label" htmlFor="email">Email</label>
            <input
              className="login-input"
              type="email"
              id="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>
          <div className="login-field">
            <label className="login-label" htmlFor="password">Password</label>
            <input
              className="login-input"
              type="password"
              id="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder=""
              autoComplete="new-password"
              required
            />
            {password && <PasswordRequirements password={password} />}
          </div>
          <div className="login-field">
            <label className="login-label" htmlFor="confirmPassword">Confirm password</label>
            <input
              className="login-input"
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder=""
              autoComplete="new-password"
              required
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-submit-btn" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <div className="login-have-code">
          Already have an account?{' '}
          <Link to="/routes/Login" className="login-register-link">Sign in</Link>
        </div>
      </div>
    </div>
  );
}

export default Registration;
