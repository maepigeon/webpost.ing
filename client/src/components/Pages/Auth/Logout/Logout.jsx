import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { BASE_URL as baseUrl } from '../../../../config.js';

const cardStyle = {
  background: 'rgba(255,255,255,0.62)',
  backdropFilter: 'blur(28px) saturate(200%)',
  WebkitBackdropFilter: 'blur(28px) saturate(200%)',
  borderRadius: 22,
  border: '1.5px solid transparent',
  boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.98), inset 0 -2px 0 rgba(80,60,120,0.12), 0 24px 64px rgba(0,0,0,0.12)',
  padding: '48px 52px',
  textAlign: 'center',
  maxWidth: 360,
  width: '100%',
  position: 'relative',
  animation: 'login-rise 0.32s cubic-bezier(0.34,1.56,0.64,1) both',
};

const btnBase = {
  width: '100%',
  padding: '12px',
  borderRadius: 13,
  border: 'none',
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'filter 0.13s, transform 0.13s cubic-bezier(0.34,1.56,0.64,1)',
};

function Logout() {
  const navigate = useNavigate();
  const [confirmed, setConfirmed] = useState(false);
  const [countdown, setCountdown] = useState(4);

  // If page is loaded/refreshed while already signed out, go home immediately
  useEffect(() => {
    if (!localStorage.getItem('userName')) navigate('/', { replace: true });
  }, []);

  useEffect(() => {
    if (!confirmed) return;

    axios.post(baseUrl + '/api/logoutSessionAttempt', {}, { withCredentials: true })
      .catch(() => {});
    localStorage.removeItem('userName');
    localStorage.removeItem('isAdmin');

    const timer = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(timer);
          window.location.href = '/';
        }
        return c - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [confirmed]);

  const pageStyle = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  };

  if (!confirmed) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <h2 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 800, color: '#1a1060', letterSpacing: '-0.02em' }}>
            Sign out?
          </h2>
          <p style={{ margin: '0 0 32px', fontSize: 14, color: '#888', lineHeight: 1.6 }}>
            You'll need to sign in again to access your account.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              style={{
                ...btnBase,
                background: 'linear-gradient(to bottom, #9480f4 0%, #7060e8 55%, #5246c8 100%)',
                color: '#fff',
                boxShadow: 'inset 0 2px 0 rgba(240,230,255,0.5), inset 0 -2px 0 rgba(20,0,80,0.22), 0 4px 16px rgba(108,99,255,0.35)',
              }}
              onClick={() => setConfirmed(true)}
            >
              Yes, sign out
            </button>
            <button
              style={{
                ...btnBase,
                background: 'rgba(200,196,255,0.18)',
                color: '#5246c8',
                border: '1.5px solid rgba(108,99,255,0.22)',
                boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.8)',
              }}
              onClick={() => navigate(-1)}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: '#1a1060', letterSpacing: '-0.02em' }}>
          You've been signed out
        </h2>
        <p style={{ margin: '0 0 28px', fontSize: 14, color: '#888', lineHeight: 1.6 }}>
          See you next time!
        </p>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#aaa' }}>
          <span style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'linear-gradient(to bottom, #dac8f4 0%, #9070c8 100%)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 13,
          }}>{countdown}</span>
          Returning to home…
        </div>
      </div>
    </div>
  );
}

export default Logout;
