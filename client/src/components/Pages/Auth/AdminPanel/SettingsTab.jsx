import { useState, useEffect } from 'react';
import axios from 'axios';
import { ADMIN_GET_SETTINGS, ADMIN_UPDATE_SETTING } from '../../Posts/BasicTextPostServerApi.js';
import { BASE_URL } from '../../../../config.js';
import { errorMessage } from '../../../../utils/errorMessage.js';
import {
  withDefaults, isOn, parseDailyLimit, canSaveDailyLimit, settingWarnings,
} from './settingsModel.js';

function Switch({ id, labelId, descId, on, busy, onToggle }) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={on}
      aria-labelledby={labelId}
      aria-describedby={descId}
      className={`admin-set-switch${on ? ' admin-set-switch--on' : ''}`}
      disabled={busy}
      onClick={onToggle}
    >
      <span className="admin-set-track" aria-hidden="true"><span className="admin-set-thumb" /></span>
      <span className="admin-set-state" aria-hidden="true">{on ? 'On' : 'Off'}</span>
    </button>
  );
}

export default function SettingsTab({ flash }) {
  const [settings, setSettings] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [signupConfig, setSignupConfig] = useState(null);
  const [limitText, setLimitText] = useState('');
  const [saving, setSaving] = useState({});

  useEffect(() => {
    let live = true;
    ADMIN_GET_SETTINGS()
      .then(d => {
        if (!live) return;
        const s = withDefaults(d);
        setSettings(s);
        setLimitText(s.max_daily_registrations);
      })
      .catch(() => { if (live) setLoadFailed(true); });
    // Only used for the warnings, so a failure just means no warnings.
    axios.get(BASE_URL + '/api/signup/config')
      .then(r => { if (live && r.data) setSignupConfig(r.data); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  if (loadFailed) {
    return <div className="admin-card admin-set-card"><h3>Sign-ups</h3><p className="admin-error">Could not load settings.</p></div>;
  }
  if (!settings) {
    return <div className="admin-card admin-set-card"><h3>Sign-ups</h3><p className="admin-hint-small">Loading…</p></div>;
  }

  const setBusy = (key, v) => setSaving(s => ({ ...s, [key]: v }));

  const toggle = async (key) => {
    const before = settings[key];
    const next = before === 'true' ? 'false' : 'true';
    setSettings(s => ({ ...s, [key]: next }));
    setBusy(key, true);
    try {
      await ADMIN_UPDATE_SETTING(key, next);
      flash('Saved.');
    } catch (e) {
      setSettings(s => ({ ...s, [key]: before }));
      flash(errorMessage(e, 'Could not save that setting.'));
    } finally {
      setBusy(key, false);
    }
  };

  const saveLimit = async () => {
    const p = parseDailyLimit(limitText);
    if (!p.valid) return;
    const key = 'max_daily_registrations';
    setBusy(key, true);
    try {
      await ADMIN_UPDATE_SETTING(key, p.value);
      setSettings(s => ({ ...s, [key]: String(p.value) }));
      setLimitText(String(p.value));
      flash('Saved.');
    } catch (e) {
      flash(errorMessage(e, 'Could not save that setting.'));
    } finally {
      setBusy(key, false);
    }
  };

  const limit = parseDailyLimit(limitText);
  const canSave = canSaveDailyLimit(limitText, settings.max_daily_registrations) && !saving.max_daily_registrations;
  const warnings = settingWarnings({ settings, signupConfig });

  return (
    <div className="admin-card admin-set-card">
      <h3>Sign-ups</h3>

      <div className="admin-set-item">
        <form className="admin-set-row" onSubmit={e => { e.preventDefault(); if (canSave) saveLimit(); }}>
          <div className="admin-set-text">
            <label id="set-limit-label" htmlFor="set-limit" className="admin-set-label">Sign-ups per day</label>
            <p id="set-limit-desc" className="admin-set-desc">
              How many new accounts can be created each day, all together. -1 means no limit.
            </p>
          </div>
          <div className="admin-set-control">
            <input
              id="set-limit"
              className="admin-set-input"
              type="number"
              inputMode="numeric"
              min={-1}
              max={10000}
              step={1}
              value={limitText}
              onChange={e => setLimitText(e.target.value)}
              aria-invalid={!limit.valid}
              aria-describedby={`set-limit-desc${limit.valid ? '' : ' set-limit-err'}`}
            />
            <button type="submit" className="admin-btn admin-set-save" disabled={!canSave}>Save</button>
          </div>
          {!limit.valid && <p id="set-limit-err" className="admin-error admin-set-err">{limit.message}</p>}
        </form>
      </div>

      <div className="admin-set-item">
        <div className="admin-set-row">
          <div className="admin-set-text">
            <span id="set-invite-label" className="admin-set-label">Invite code needed to sign up</span>
            <p id="set-invite-desc" className="admin-set-desc">
              When on, only people with a code you made can create an account.
            </p>
          </div>
          <div className="admin-set-control">
            <Switch
              id="set-invite" labelId="set-invite-label" descId="set-invite-desc"
              on={isOn(settings, 'invite_required')} busy={!!saving.invite_required}
              onToggle={() => toggle('invite_required')}
            />
          </div>
        </div>
        <div role="status">{warnings.invite && <p className="admin-set-warn">{warnings.invite}</p>}</div>
      </div>

      <div className="admin-set-item">
        <div className="admin-set-row">
          <div className="admin-set-text">
            <span id="set-verify-label" className="admin-set-label">Confirm email before posting</span>
            <p id="set-verify-desc" className="admin-set-desc">
              When on, new accounts must confirm their email address before they can post, comment, follow, message or upload. Admins are exempt.
            </p>
          </div>
          <div className="admin-set-control">
            <Switch
              id="set-verify" labelId="set-verify-label" descId="set-verify-desc"
              on={isOn(settings, 'require_verified_email')} busy={!!saving.require_verified_email}
              onToggle={() => toggle('require_verified_email')}
            />
          </div>
        </div>
        <div role="status">{warnings.verifiedEmail && <p className="admin-set-warn">{warnings.verifiedEmail}</p>}</div>
      </div>
    </div>
  );
}
