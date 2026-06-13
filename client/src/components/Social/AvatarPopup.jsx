import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import './AvatarPopup.css';

export default function AvatarPopup({ src, username, profileUrl, onClose }) {
  const qrRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const url = profileUrl || (username ? `${window.location.origin}/users/${username}` : window.location.href);
  const hasAvatar = !!src;

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    if (!qrRef.current) return;
    QRCode.toCanvas(qrRef.current, url, {
      width: 140,
      margin: 2,
      color: { dark: '#1a1a2e', light: '#ffffff' },
    }).catch(() => {});
  }, [url]);

  const handleCopy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  };

  return createPortal(
    <div className="avatar-popup-overlay" onMouseDown={onClose}>
      <div className="avatar-popup-card" onMouseDown={e => e.stopPropagation()}>
        <button className="avatar-popup-close" onClick={onClose} aria-label="Close">✕</button>
        {hasAvatar
          ? <img src={src} alt={username} className="avatar-popup-img" />
          : (
            <div className="avatar-popup-letter">
              {username?.[0]?.toUpperCase()}
            </div>
          )
        }
        {username && <div className="avatar-popup-name">@{username}</div>}

        <div className="avatar-popup-actions">
          <button className="avatar-popup-copy-btn" onClick={handleCopy}>
            {copied ? '✓ Copied!' : '🔗 Copy profile link'}
          </button>
        </div>

        <div className="avatar-popup-qr-wrap">
          <canvas ref={qrRef} className="avatar-popup-qr" />
          <div className="avatar-popup-qr-label">Profile QR code</div>
        </div>
      </div>
    </div>,
    document.body
  );
}
