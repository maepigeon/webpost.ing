import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import './Login.css';
import { BASE_URL as baseUrl } from '../../../../config.js';
import { ADMIN_GET_STATUS } from '../../Posts/BasicTextPostServerApi.js';
import { usePageTitle } from '../../../../utils/usePageTitle.js';

function Login() {
  usePageTitle('Sign in');
  const location = useLocation();
  const justRegistered = location.state?.registered === true;
  // Set by handleExpiredSession when a 401 bounced the user here, so the
  // redirect explains itself instead of looking like a random sign-out.
  const sessionExpired = new URLSearchParams(location.search).get('expired') === '1';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please fill in all fields.');
      return;
    }
    setError('');
    setLoading(true);
    try {
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
    } catch (err) {
      setError(err?.response?.data || 'Invalid username or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <span className="login-logo-text">webpost.ing</span>
          <span className="login-subtitle">Sign in to your account</span>
        </div>

        {justRegistered && (
          <div className="login-success">Account created! Sign in below.</div>
        )}

        {sessionExpired && (
          <div className="login-expired">
            Your session ended, so you were signed out. Sign in again to continue.
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="login-field">
            <label className="login-label" htmlFor="username">Username</label>
            <input
              className="login-input"
              type="text"
              id="username"
              autoComplete="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="your username"
              autoFocus
              required
            />
          </div>
          <div className="login-field">
            <label className="login-label" htmlFor="password">Password</label>
            <input
              className="login-input"
              type="password"
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder=""
              required
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-submit-btn" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="login-have-code">
          Have an invite code?{' '}
          <Link to="/routes/NewAccount" className="login-register-link">Create an account</Link>
        </div>

        {/* Only useful once an address has been confirmed, which the endpoint
            enforces — it reports the same thing either way so an unregistered
            address cannot be told apart from a registered one. */}
        <div className="login-have-code">
          <Link to="/forgot-password" className="login-register-link">Forgot your password?</Link>
        </div>
      </div>
    </div>
  );
}

export default Login;
