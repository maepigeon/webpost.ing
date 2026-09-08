import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { BASE_URL as baseUrl } from '../../../../config.js';
import { clearLocalSession, isSignedIn } from '../../../../utils/session.js';
import { usePageTitle } from '../../../../utils/usePageTitle.js';
import './Logout.css';

/**
 * Sign-out confirmation.
 *
 * Signing out is immediate. There used to be a four-second countdown on a
 * "you've been signed out" screen before the redirect happened, which made a
 * one-click action take five and left the user watching a timer for no reason.
 */
export default function Logout() {
  usePageTitle('Sign out');
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  // Landing here already signed out — a refresh, or a second tab — has nothing
  // to confirm.
  useEffect(() => {
    if (!isSignedIn()) navigate('/', { replace: true });
  }, [navigate]);

  const signOut = async () => {
    setBusy(true);
    // Clear locally first so the UI cannot flash a signed-in state if the
    // request is slow, and so a failed request still signs you out here.
    clearLocalSession();
    try {
      await axios.post(baseUrl + '/api/logoutSessionAttempt', {}, { withCredentials: true });
    } catch {
      // The local session is already gone; a server-side failure is not worth
      // blocking on or reporting.
    }
    // A full navigation, not a router push: every component holding
    // signed-in state should be torn down.
    window.location.href = '/';
  };

  return (
    <div className="logout-page">
      <div className="logout-card">
        <h2 className="logout-title">Sign out?</h2>
        <p className="logout-subtitle">You'll need to sign in again to access your account.</p>
        <div className="logout-actions">
          <button type="button" className="logout-btn logout-btn--primary" onClick={signOut} disabled={busy}>
            {busy ? 'Signing out…' : 'Yes, sign out'}
          </button>
          <button type="button" className="logout-btn logout-btn--ghost" onClick={() => navigate(-1)} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
