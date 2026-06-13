import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import './FollowListModal.css';

export default function FollowListModal({ title, users, onClose }) {
  const overlayRef = useRef(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Close on click outside
  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  return createPortal(
    <div className="follow-modal-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="follow-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="follow-modal-header">
          <h3 className="follow-modal-title">{title}</h3>
          <button className="follow-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <ul className="follow-modal-list">
          {users.length === 0 && <li className="follow-modal-empty">Nobody yet.</li>}
          {users.map(username => (
            <li key={username} className="follow-modal-item">
              <Link to={`/users/${username}`} className="follow-modal-link" onClick={onClose}>
                {username}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body
  );
}
