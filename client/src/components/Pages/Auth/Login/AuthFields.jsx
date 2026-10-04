import { useState } from 'react';
import './Login.css';

/** A short message right under the field it belongs to. */
export function FieldError({ id, message }) {
  if (!message) return null;
  return <div id={id} className="login-field-error" role="alert">{message}</div>;
}

/**
 * One sign-in / sign-up field. The label is for screen readers only (hidden);
 * the placeholder says what the field is. `password` adds a Show/Hide button
 * inside the field's right edge. `below` is extra content under the error
 * (the password rules); pass its id as `describedBy` so it is announced.
 */
export function AuthField({
  id, label, error, describedBy, below, password = false, type = 'text', ...inputProps
}) {
  const [shown, setShown] = useState(false);
  const errorId = `${id}-error`;
  const described = [error ? errorId : '', describedBy || ''].filter(Boolean).join(' ') || undefined;
  const input = (
    <input
      {...inputProps}
      id={id}
      className={`login-input${password ? ' has-toggle' : ''}`}
      type={password ? (shown ? 'text' : 'password') : type}
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={described}
    />
  );
  return (
    <div className="login-field">
      <label className="login-label" htmlFor={id}>{label}</label>
      {password ? (
        <div className="login-pw-wrap">
          {input}
          <button
            type="button"
            className="login-pw-toggle"
            aria-pressed={shown}
            aria-label={shown ? 'Hide password' : 'Show password'}
            onClick={() => setShown(s => !s)}
          >
            {shown ? 'Hide' : 'Show'}
          </button>
        </div>
      ) : input}
      <FieldError id={errorId} message={error} />
      {below}
    </div>
  );
}
