import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  GET_SIGN_IN_METHODS, LINK_SSO_PROVIDER, UNLINK_SSO_PROVIDER, SET_FIRST_PASSWORD, SSO_START_URL,
} from '../Posts/BasicTextPostServerApi.js';
import { PasswordRequirements } from '../Auth/Registration/Registration.jsx';
import { passwordMeetsRules } from '../Auth/Registration/passwordRules.js';
import { ProviderMark } from '../Auth/Login/SsoButtons.jsx';
import { ssoSettingsMessage } from '../Auth/Login/ssoOutcome.js';
import { errorMessage } from '../../../utils/errorMessage.js';
import './SignInMethods.css';

const SECTION_ID = 'signin';

/**
 * Settings > Sign-in methods: the password (or "Set a password" for an account
 * made through Google or Microsoft) and each provider that can be linked or
 * unlinked. Changing any of them asks for the password again; an account with
 * no password signs in again with a linked provider instead.
 *
 * Renders nothing, not even its heading, when single sign-on is off on this
 * site and nothing is linked, so Settings looks as it always did. `Section`
 * is SettingsPage's own folding section.
 */
export default function SignInMethods({ Section }) {
  const location = useLocation();
  const [outcome] = useState(() => ssoSettingsMessage(new URLSearchParams(location.search).get('sso')));
  const [data, setData] = useState(null);
  // Which row's form is open: 'password', 'link:<id>', 'unlink:<id>' or 'reauth'.
  const [open, setOpen] = useState(null);
  const [password, setPassword] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(outcome && !outcome.error ? outcome.text : '');
  const [error, setError] = useState(outcome && outcome.error ? outcome.text : '');

  const load = useCallback(() => GET_SIGN_IN_METHODS().then(setData).catch(() => setData(null)), []);
  useEffect(() => { load(); }, [load]);

  const shown = !!data && ((data.methods || []).length > 0 || !data.hasPassword);

  // Back from a provider: unfold this section so the result is in view.
  useEffect(() => {
    if (!outcome || !shown) return;
    const el = document.getElementById(`settings-${SECTION_ID}`);
    if (el) el.open = true;
  }, [outcome, shown]);

  if (!shown) return null;

  const methods = data.methods || [];
  const linkedOn = methods.filter(m => m.linked && m.enabled);
  // No password to ask for: the proof is a provider sign-in in the last five minutes.
  const mustSignInAgain = !data.hasPassword && !data.fresh;

  const close = () => { setOpen(null); setPassword(''); setNext(''); setAgain(''); };
  const clear = () => { setNote(''); setError(''); };

  const failed = (err, fallback) => {
    if (err?.response?.data?.reauth) { setOpen('reauth'); return; }
    setError(errorMessage(err, fallback));
  };

  const link = async (provider, pw) => {
    setBusy(true); clear();
    try {
      const r = await LINK_SSO_PROVIDER(provider, pw);
      window.location.href = r.redirect;   // off to the provider; it sends the browser back here
    } catch (err) {
      failed(err, 'Could not start linking. Try again.');
      setBusy(false);
    }
  };

  const unlink = async (provider, pw) => {
    setBusy(true); clear();
    try {
      const r = await UNLINK_SSO_PROVIDER(provider, pw);
      close();
      setNote(r.message || 'Unlinked.');
      await load();
    } catch (err) {
      failed(err, 'Could not unlink. Try again.');
    }
    setBusy(false);
  };

  const setFirstPassword = async (e) => {
    e.preventDefault();
    if (busy || !passwordMeetsRules(next) || next !== again) return;
    setBusy(true); clear();
    try {
      const r = await SET_FIRST_PASSWORD(next);
      close();
      setNote(r.message || 'Password set.');
      await load();
    } catch (err) {
      failed(err, 'Could not set the password. Try again.');
    }
    setBusy(false);
  };

  /** A row's button was pressed: ask for whatever proof is needed, or just do it. */
  const begin = (kind, provider) => {
    clear();
    if (mustSignInAgain) { setOpen('reauth'); return; }
    if (kind === 'password') { setOpen('password'); return; }
    if (data.hasPassword) { setPassword(''); setOpen(`${kind}:${provider}`); return; }
    if (kind === 'link') link(provider); else unlink(provider);
  };

  const confirm = (e, kind, provider) => {
    e.preventDefault();
    if (busy || !password) return;
    if (kind === 'link') link(provider, password); else unlink(provider, password);
  };

  const mismatch = again !== '' && again !== next;

  return (
    <Section id={SECTION_ID} title="Sign-in methods">
      <ul className="signin-list">
        <li className="signin-row">
          <span className="signin-name">Password</span>
          <span className="signin-state">{data.hasPassword ? 'Set' : 'None yet'}</span>
          {!data.hasPassword && (
            <button type="button" className="settings-btn" disabled={busy} onClick={() => begin('password')}>
              Set a password
            </button>
          )}
        </li>
        {open === 'password' && (
          <li className="signin-form-row">
            <form className="settings-password-form" onSubmit={setFirstPassword}>
              <input type="password" className="settings-input" value={next} autoComplete="new-password" autoFocus
                placeholder="New password" aria-label="New password"
                onChange={e => setNext(e.target.value)} maxLength={128} />
              {next && <PasswordRequirements password={next} />}
              <input type="password" className="settings-input" value={again} autoComplete="new-password"
                placeholder="New password again" aria-label="New password again"
                onChange={e => setAgain(e.target.value)} maxLength={128} aria-invalid={mismatch || undefined} />
              {mismatch && <p className="settings-error" role="alert">The two passwords don&rsquo;t match.</p>}
              <div className="signin-actions">
                <button type="submit" className="settings-btn settings-btn--primary"
                  disabled={busy || !passwordMeetsRules(next) || next !== again}>
                  {busy ? 'Setting…' : 'Set password'}
                </button>
                <button type="button" className="settings-btn" onClick={close}>Cancel</button>
              </div>
            </form>
          </li>
        )}

        {methods.map(m => {
          const action = m.linked ? 'unlink' : 'link';
          const blocked = m.linked && !m.canUnlink;
          const key = `${action}:${m.provider}`;
          return [
            <li className="signin-row" key={m.provider}>
              <span className="signin-name"><ProviderMark id={m.provider} />{m.name}</span>
              <span className="signin-state">
                {m.linked ? (m.email ? `Linked as ${m.email}` : 'Linked') : 'Not linked'}
                {m.linked && !m.enabled && ' (switched off on this site)'}
                {blocked && '. Set a password before unlinking.'}
              </span>
              {(m.linked || m.enabled) && (
                <button type="button" className="settings-btn" disabled={busy || blocked}
                  onClick={() => begin(action, m.provider)}>
                  {m.linked ? 'Unlink' : 'Link'}
                </button>
              )}
            </li>,
            open === key && (
              <li className="signin-form-row" key={key}>
                <form className="signin-confirm" onSubmit={e => confirm(e, action, m.provider)}>
                  <input type="password" className="settings-input" value={password} autoComplete="current-password"
                    autoFocus placeholder="Your password" aria-label="Your password"
                    onChange={e => setPassword(e.target.value)} maxLength={128} />
                  <button type="submit" className="settings-btn settings-btn--primary" disabled={busy || !password}>
                    {m.linked ? `Unlink ${m.name}` : `Continue to ${m.name}`}
                  </button>
                  <button type="button" className="settings-btn" onClick={close}>Cancel</button>
                </form>
              </li>
            ),
          ];
        })}
      </ul>

      {open === 'reauth' && (
        <div className="signin-reauth" role="status">
          <span>Sign in again first, then make your change within 5 minutes.</span>
          <div className="signin-actions">
            {linkedOn.map(m => (
              // A button like its neighbours; pressing it is a page load to the provider.
              <button key={m.provider} type="button" className="settings-btn signin-again"
                onClick={() => { window.location.href = SSO_START_URL(m.provider, 'reauth'); }}>
                <ProviderMark id={m.provider} />Continue with {m.name}
              </button>
            ))}
            <button type="button" className="settings-btn" onClick={close}>Cancel</button>
          </div>
        </div>
      )}

      {note && <p className="settings-section-hint" role="status">{note}</p>}
      {error && <p className="settings-error" role="alert">{error}</p>}
    </Section>
  );
}
