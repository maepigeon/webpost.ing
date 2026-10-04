import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { BASE_URL as baseUrl } from '../../../../config.js';
import { ADMIN_GET_STATUS } from '../../Posts/BasicTextPostServerApi.js';
import { Link, useNavigate } from 'react-router-dom';
import '../Login/Login.css';
import './Registration.css';
import { usePageTitle } from '../../../../utils/usePageTitle.js';
import { errorMessage } from '../../../../utils/errorMessage.js';
import { AuthField } from '../Login/AuthFields.jsx';
import { passwordRuleItems } from './passwordRules.js';
import { FIELD_ORDER, mapRegisterError, validateRegistration } from './registrationValidation.js';
import SsoButtons from '../Login/SsoButtons.jsx';
import { ssoProvidersOf } from '../Login/ssoOutcome.js';

// Imported by the reset form, settings and the admin panel; keep the props.
export function PasswordRequirements({ password, id }) {
  return (
    <ul className="password-requirements" id={id}>
      {passwordRuleItems(password).map(({ ok, over, label }) => (
        <li key={label} className={ok ? 'is-met' : over ? 'is-over' : undefined}>
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
  const navigate = useNavigate();
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
  const [fieldErrors, setFieldErrors]     = useState({});
  const [pwFocused, setPwFocused]         = useState(false);
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

  // Typing in a field clears the message that was pinned on it.
  const edit = (key, set) => (e) => {
    set(e.target.value);
    setFieldErrors(f => (f[key] ? { ...f, [key]: '' } : f));
  };
  const inputIds = { invite: 'inviteCode', username: 'username', email: 'email', password: 'password', confirm: 'confirmPassword' };
  const focusFirst = (errs) => {
    const key = FIELD_ORDER.find(k => errs[k]);
    if (key) document.getElementById(inputIds[key])?.focus();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    const errs = validateRegistration(
      { inviteCode, username, email, password, confirm: confirmPassword },
      { inviteRequired: config.inviteRequired });
    setFieldErrors(errs);
    if (Object.keys(errs).length) {
      focusFirst(errs);
      return;
    }
    if (config.turnstileSiteKey && !turnstileToken) {
      setError('Please complete the human check.');
      return;
    }

    const name = username.trim();
    setLoading(true);
    try {
      const payload = { username: name, email: email.trim(), password };
      if (config.inviteRequired) payload.inviteCode = inviteCode.trim();
      if (config.turnstileSiteKey) payload.turnstileToken = turnstileToken;
      await axios.post(baseUrl + '/api/register', payload);
    } catch (e) {
      const { field, message } = mapRegisterError(errorMessage(e, 'Registration failed. Please try again.'));
      if (field) {
        const pinned = { [field]: message };
        setFieldErrors(pinned);
        focusFirst(pinned);
      } else {
        setError(message);
      }
      if (widgetId.current != null && window.turnstile) {
        try { window.turnstile.reset(widgetId.current); } catch { /* ignore */ }
        setTurnstileToken('');
      }
      setLoading(false);
      return;
    }

    // The account exists now. Sign in; if that alone fails, say so on the
    // sign-in screen rather than showing it as a sign-up error.
    try {
      await axios.post(baseUrl + '/api/loginSessionAttempt',
        { username: name, password },
        { withCredentials: true });
      localStorage.setItem('userName', name);
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
      window.location.href = `/${name}`;
    } catch {
      navigate('/routes/Login', { state: { registered: true } });
    }
  };

  // The rules show up front, as soon as the password field is focused.
  const showRules = pwFocused || password !== '' || Boolean(fieldErrors.password);

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <span className="login-logo-text">webpost.ing</span>
          <span className="login-subtitle">Create an account</span>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {config.inviteRequired && (
            <AuthField
              id="inviteCode"
              name="inviteCode"
              label="Invite code"
              placeholder="Invite code"
              value={inviteCode}
              onChange={edit('invite', setInviteCode)}
              error={fieldErrors.invite}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
            />
          )}
          <AuthField
            id="username"
            name="username"
            label="Username"
            placeholder="Username"
            value={username}
            onChange={edit('username', setUsername)}
            error={fieldErrors.username}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
          />
          <AuthField
            id="email"
            name="email"
            label="Email"
            type="email"
            placeholder="Email"
            value={email}
            onChange={edit('email', setEmail)}
            error={fieldErrors.email}
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
          />
          <AuthField
            id="password"
            name="password"
            label="Password"
            placeholder="Password"
            password
            value={password}
            onChange={edit('password', setPassword)}
            onFocus={() => setPwFocused(true)}
            onBlur={() => setPwFocused(false)}
            error={fieldErrors.password}
            describedBy={showRules ? 'password-rules' : undefined}
            below={showRules ? <PasswordRequirements password={password} id="password-rules" /> : null}
            autoComplete="new-password"
            required
          />
          <AuthField
            id="confirmPassword"
            name="confirmPassword"
            label="Confirm password"
            placeholder="Confirm password"
            password
            value={confirmPassword}
            onChange={edit('confirm', setConfirmPassword)}
            error={fieldErrors.confirm}
            autoComplete="new-password"
            required
          />

          {config.turnstileSiteKey && <div ref={widgetRef} className="login-field" />}

          {error && <div className="login-error" role="alert">{error}</div>}
          {notice && <div className="login-notice" role="status">{notice}</div>}

          <button type="submit" className="login-submit-btn" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <SsoButtons providers={ssoProvidersOf(config)} />

        <div className="login-have-code">
          Already have an account?{' '}
          <Link to="/routes/Login" className="login-register-link">Sign in</Link>
        </div>
      </div>
    </div>
  );
}

export default Registration;
