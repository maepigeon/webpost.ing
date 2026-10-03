import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { BASE_URL as baseUrl } from '../../../../config.js';
import { ADMIN_GET_STATUS } from '../../Posts/BasicTextPostServerApi.js';
import { Link } from 'react-router-dom';
import '../Login/Login.css';
import './Registration.css';
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

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

// Loads Cloudflare's script only when the server asks for the check.
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  return new Promise((resolve, reject) => {
    let tag = document.querySelector(`script[src="${TURNSTILE_SRC}"]`);
    if (!tag) {
      tag = document.createElement('script');
      tag.src = TURNSTILE_SRC;
      tag.async = true;
      document.head.appendChild(tag);
    }
    tag.addEventListener('load', () => resolve(window.turnstile));
    tag.addEventListener('error', () => reject(new Error('turnstile')));
  });
}

function Registration() {
  usePageTitle('Create account');
  const [config, setConfig]             = useState({ inviteRequired: true, turnstileSiteKey: null, mailEnabled: false });
  const [turnstileToken, setTurnstileToken] = useState('');
  const [notice, setNotice]             = useState('');
  const widgetRef                       = useRef(null);
  const widgetId                        = useRef(null);
  const [username, setUsername]           = useState('');
  const [email, setEmail]                 = useState('');
  const [password, setPassword]           = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode]       = useState('');
  const [error, setError]                 = useState('');
  const [loading, setLoading]             = useState(false);

  useEffect(() => {
    let live = true;
    axios.get(baseUrl + '/api/signup/config')
      .then(r => { if (live && r.data) setConfig(c => ({ ...c, ...r.data })); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!config.turnstileSiteKey) return undefined;
    let live = true;
    loadTurnstile().then(ts => {
      if (!live || !ts || !widgetRef.current || widgetId.current != null) return;
      widgetId.current = ts.render(widgetRef.current, {
        sitekey: config.turnstileSiteKey,
        callback: t => setTurnstileToken(t),
        'expired-callback': () => setTurnstileToken(''),
        'error-callback': () => setTurnstileToken(''),
      });
    }).catch(() => setError('Could not load the human check. Reload the page to try again.'));
    return () => {
      live = false;
      if (widgetId.current != null && window.turnstile) {
        try { window.turnstile.remove(widgetId.current); } catch { /* already gone */ }
      }
      widgetId.current = null;
    };
  }, [config.turnstileSiteKey]);

  const pwChecks = checkPassword(password);
  const pwValid  = Object.values(pwChecks).every(Boolean);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!username || !email || !password || !confirmPassword || (config.inviteRequired && !inviteCode)) {
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

    if (config.turnstileSiteKey && !turnstileToken) {
      setError('Please complete the human check.');
      return;
    }

    setLoading(true);
    try {
      const payload = { username, email, password };
      if (config.inviteRequired) payload.inviteCode = inviteCode;
      if (config.turnstileSiteKey) payload.turnstileToken = turnstileToken;
      await axios.post(baseUrl + '/api/register', payload);
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
      if (config.mailEnabled) {
        setNotice('Check your email to confirm your address.');
        await new Promise(r => setTimeout(r, 2500));
      }
      window.location.href = `/${username.trim()}`;
    } catch (e) {
      setError(errorMessage(e, 'Registration failed. Please try again.'));
      if (widgetId.current != null && window.turnstile) {
        try { window.turnstile.reset(widgetId.current); } catch { /* ignore */ }
        setTurnstileToken('');
      }
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
          {config.inviteRequired && (
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
          )}
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

          {config.turnstileSiteKey && <div ref={widgetRef} className="login-field" />}

          {error && <div className="login-error">{error}</div>}
          {notice && <div className="login-notice" role="status">{notice}</div>}

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
