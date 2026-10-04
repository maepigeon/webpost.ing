import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Login.css';
import { AuthField } from './AuthFields.jsx';
import { rememberSignIn } from './signedIn.js';
import { GET_SSO_PENDING, COMPLETE_SSO_SIGNUP } from '../../Posts/BasicTextPostServerApi.js';
import { validateInviteCode, validateUsername, mapRegisterError } from '../Registration/registrationValidation.js';
import { usePageTitle } from '../../../../utils/usePageTitle.js';
import { errorMessage } from '../../../../utils/errorMessage.js';

/**
 * The one step between a first sign-in with Google or Microsoft and having an
 * account: pick a username (and give an invite code while those are needed).
 * The server holds the proven provider account for ten minutes; without one
 * this page only says so.
 */
export default function ChooseUsername() {
  usePageTitle('Choose a username');
  const navigate = useNavigate();
  // undefined while asking, null when no sign-in is waiting.
  const [pending, setPending]     = useState(undefined);
  const [username, setUsername]   = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);

  useEffect(() => {
    let live = true;
    GET_SSO_PENDING()
      .then(d => { if (live) setPending(d && typeof d === 'object' ? d : null); })
      .catch(() => { if (live) setPending(null); });
    return () => { live = false; };
  }, []);

  const edit = (key, set) => (e) => {
    set(e.target.value);
    setFieldErrors(f => (f[key] ? { ...f, [key]: '' } : f));
  };
  const focusFirst = (errs) => {
    const id = errs.invite ? 'inviteCode' : errs.username ? 'username' : null;
    if (id) document.getElementById(id)?.focus();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    const errs = {};
    const invite = validateInviteCode(inviteCode, pending.inviteRequired === true);
    const name = validateUsername(username);
    if (invite) errs.invite = invite;
    if (name) errs.username = name;
    setFieldErrors(errs);
    if (Object.keys(errs).length) { focusFirst(errs); return; }

    setLoading(true);
    try {
      const made = await COMPLETE_SSO_SIGNUP(username.trim(), pending.inviteRequired === true ? inviteCode.trim() : '');
      if (made.signedIn === false) {
        navigate('/routes/Login', { state: { registered: true } });
        return;
      }
      await rememberSignIn(made.username);
      window.location.href = `/${made.username}`;
    } catch (e) {
      // The sign-in ran out while the form was open: start again from the sign-in page.
      if (e?.response?.status === 410) { setPending(null); return; }
      const { field, message } = mapRegisterError(errorMessage(e, 'Could not create the account. Try again.'));
      if (field === 'invite' || field === 'username') {
        const pinned = { [field]: message };
        setFieldErrors(pinned);
        focusFirst(pinned);
      } else {
        setError(message);
      }
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <span className="login-logo-text">webpost.ing</span>
          <span className="login-subtitle">Choose a username</span>
        </div>

        {pending === null && (
          <>
            <div className="login-expired" role="status">That sign-in ran out. Start again.</div>
            <div className="login-have-code">
              <Link to="/routes/Login" className="login-register-link">Back to sign in</Link>
            </div>
          </>
        )}

        {pending && (
          <form onSubmit={handleSubmit} noValidate>
            <p className="login-note">
              Signed in with {pending.providerName}{pending.email ? <> as <strong>{pending.email}</strong></> : null}
            </p>
            {pending.inviteRequired === true && (
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
              maxLength={32}
              autoFocus
              required
            />

            {error && <div className="login-error" role="alert">{error}</div>}

            <button type="submit" className="login-submit-btn" disabled={loading}>
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
