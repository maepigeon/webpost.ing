import './Login.css';
import { SSO_START_URL } from '../../Posts/BasicTextPostServerApi.js';

/**
 * A provider's mark in one colour (the text colour), so the buttons stay in
 * the app's grayscale. Decorative: the button's words say who it is.
 */
export function ProviderMark({ id }) {
  if (id === 'google') {
    return (
      <svg className="login-sso-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
      </svg>
    );
  }
  if (id === 'microsoft') {
    return (
      <svg className="login-sso-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M1 1h10.5v10.5H1zM12.5 1H23v10.5H12.5zM1 12.5h10.5V23H1zM12.5 12.5H23V23H12.5z" />
      </svg>
    );
  }
  return null;
}

/**
 * "Continue with Google / Microsoft" under a sign-in or sign-up form, one
 * button per provider the server has switched on; nothing at all when none
 * is. Each is a plain link: the server answers it by sending the browser to
 * the provider.
 */
export default function SsoButtons({ providers }) {
  if (!providers || providers.length === 0) return null;
  return (
    <div className="login-sso">
      <div className="login-sso-or" aria-hidden="true"><span>or</span></div>
      {providers.map(p => (
        <a key={p.id} className="login-sso-btn" href={SSO_START_URL(p.id)}>
          <ProviderMark id={p.id} />
          <span>Continue with {p.name}</span>
        </a>
      ))}
    </div>
  );
}
