import React, { useState } from 'react';
import axios from 'axios';
import { BASE_URL as baseUrl } from '../../../../config.js';
import { ADMIN_GET_STATUS } from '../../Posts/BasicTextPostServerApi.js';
import { useNavigate } from 'react-router-dom';
import './Registration.css';
import { usePageTitle } from '../../../../utils/usePageTitle.js';

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
    <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0', fontSize: 13 }}>
      {items.map(([ok, label]) => (
        <li key={label} style={{ color: ok ? '#2a7a2a' : '#888', marginBottom: 2 }}>
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
  const navigate = useNavigate();

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
      window.location.href = `/users/${username.trim()}`;
    } catch (e) {
      const raw = e.response?.data;
      setError(typeof raw === 'string' ? raw : (raw?.message || raw?.error || 'Registration failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="registration-container">
      <h2>Create an Account</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group invite-code-group">
          <label htmlFor="inviteCode">Invite Code</label>
          <input
            type="text"
            id="inviteCode"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="Paste your invite code here"
            autoComplete="off"
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="username">Username</label>
          <input
            type="text"
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Choose a username"
            autoComplete="username"
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            autoComplete="email"
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Create a strong password"
            autoComplete="new-password"
            required
          />
          {password && <PasswordRequirements password={password} />}
        </div>
        <div className="form-group">
          <label htmlFor="confirmPassword">Confirm Password</label>
          <input
            type="password"
            id="confirmPassword"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your password"
            autoComplete="new-password"
            required
          />
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="reg-submit-btn" disabled={loading}>
          {loading ? 'Creating account…' : 'Create Account'}
        </button>
      </form>
    </div>
  );
}

export default Registration;
