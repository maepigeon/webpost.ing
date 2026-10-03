import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import './Login.css';
import { AuthField } from './AuthFields.jsx';
import { BASE_URL as baseUrl } from '../../../../config.js';
import { ADMIN_GET_STATUS } from '../../Posts/BasicTextPostServerApi.js';
import { usePageTitle } from '../../../../utils/usePageTitle.js';
import { errorMessage } from '../../../../utils/errorMessage.js';

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
  // null until /api/signup/config answers; while null we assume mail is on.
  const [config, setConfig]     = useState(null);
  const [showNoMail, setShowNoMail] = useState(false);

  useEffect(() => {
    let live = true;
    axios.get(baseUrl + '/api/signup/config')
      .then(r => { if (live && r.data && typeof r.data === 'object') setConfig(r.data); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  const mailOff = config?.mailEnabled === false;

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
      window.location.href = `/${username.trim()}`;
    } catch (err) {
      setError(errorMessage(err, 'Invalid username or password.'));
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
        {typeof location.state?.notice === 'string' && (
          <div className="login-success">{location.state.notice}</div>
        )}

        {sessionExpired && (
          <div className="login-expired">
            Your session ended, so you were signed out. Sign in again to continue.
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <AuthField
            id="username"
            name="username"
            label="Username"
            placeholder="Username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoFocus
            required
          />
          <AuthField
            id="password"
            name="password"
            label="Password"
            placeholder="Password"
            password
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />

          {error && <div className="login-error" role="alert">{error}</div>}

          <button type="submit" className="login-submit-btn" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="login-have-code">
          New here?{' '}
          <Link to="/routes/NewAccount" className="login-register-link">Create an account</Link>
          {config?.inviteRequired === true && ' (invite code needed)'}
        </div>

        {/* Reset links go by email; without mail there is nothing to send. */}
        <div className="login-have-code">
          {mailOff ? (
            <button type="button" className="login-link-button" onClick={() => setShowNoMail(true)}>
              Forgot your password?
            </button>
          ) : (
            <Link to="/forgot-password" className="login-register-link">Forgot password?</Link>
          )}
          <div role="status" className="login-nomail">
            {mailOff && showNoMail && 'Email is not switched on yet, so passwords cannot be reset by email. Ask the site admin to set a new one.'}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
