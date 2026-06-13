import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { GET_UNREAD_COUNT, GET_NOTIFICATIONS, MARK_NOTIFICATION_READ, MARK_ALL_READ } from '../Pages/Posts/BasicTextPostServerApi.js';
import './Social.css';

function ActorLink({ username, onClick }) {
  return (
    <Link
      to={`/users/${username}`}
      className="notif-actor-link"
      onClick={e => { e.stopPropagation(); if (onClick) onClick(); }}
    >
      {username}
    </Link>
  );
}

function PostLink({ n, onClose }) {
  if (!n.postOwner || !n.postId) return <span>{n.postTitle || 'your post'}</span>;
  const anchor = n.commentId ? `#comment-${n.commentId}` : '';
  return (
    <Link
      to={`/users/${n.postOwner}/${n.postId}/discussion${anchor}`}
      className="notif-post-link"
      onClick={e => { e.stopPropagation(); if (onClose) onClose(); }}
    >
      {n.postTitle || 'your post'}
    </Link>
  );
}

function notifLabel(n, closeDropdown) {
  const a = <ActorLink username={n.actorUsername} onClick={closeDropdown} />;
  switch (n.type) {
    case 'comment':  return <span>{a} commented on your post <PostLink n={n} onClose={closeDropdown} /></span>;
    case 'reply':    return <span>{a} replied to your comment on <PostLink n={n} onClose={closeDropdown} /></span>;
    case 'follow':   return <span>{a} followed you</span>;
    case 'reaction': return <span>{a} reacted to your post <PostLink n={n} onClose={closeDropdown} /></span>;
    case 'new_post': return <span>{a} published {n.postOwner && n.postId ? <Link to={`/users/${n.postOwner}/${n.postId}`} className="notif-post-link" onClick={e => { e.stopPropagation(); if (closeDropdown) closeDropdown(); }}>{n.postTitle || 'a new post'}</Link> : 'a new post'}</span>;
    case 'message':  return <span>{a} sent you a message: {n.message || ''}</span>;
    default:         return <span>New notification from {a}</span>;
  }
}

export default function NotificationBell() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const ref = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  const fetchCount = () => GET_UNREAD_COUNT().then(d => setCount(d.count)).catch(() => {});

  useEffect(() => {
    fetchCount();
    const id = setInterval(fetchCount, 30000);
    return () => clearInterval(id);
  }, []);

  // Re-fetch when user navigates (e.g. returning from the inbox page)
  useEffect(() => { fetchCount(); }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    GET_NOTIFICATIONS(50).then(ns => setNotifications(ns.filter(n => !n.isRead).slice(0, 10))).catch(() => {});
  }, [open]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleClick = async (n) => {
    if (!n.isRead) {
      await MARK_NOTIFICATION_READ(n.id).catch(() => {});
      setNotifications(ns => ns.map(x => x.id === n.id ? { ...x, isRead: true } : x));
      setCount(c => Math.max(0, c - 1));
    }
    setOpen(false);
    if (n.type === 'message' && n.actorUsername) {
      navigate(`/messages?with=${encodeURIComponent(n.actorUsername)}`);
    } else {
      navigate(`/inbox?highlight=${n.id}`);
    }
  };

  const markAll = async () => {
    await MARK_ALL_READ().catch(() => {});
    setNotifications(ns => ns.map(n => ({ ...n, isRead: true })));
    setCount(0);
  };

  return (
    <div className="notif-bell-wrap" ref={ref}>
      <button className="notif-bell-btn" onClick={() => setOpen(o => !o)} title="Notifications">
        Notifications
        {count > 0 && <span className="notif-badge">{count > 99 ? '99+' : count}</span>}
      </button>
      {open && (
        <div className="notif-dropdown">
          <div className="notif-dropdown-header">
            <span>Notifications</span>
            {count > 0 && <button onClick={markAll} className="notif-mark-all">Mark all read</button>}
          </div>
          <div className="notif-list">
            {notifications.length === 0
              ? <p className="notif-empty">No notifications.</p>
              : notifications.map(n => (
                <div
                  key={n.id}
                  className={`notif-item${n.isRead ? '' : ' notif-item--unread'}`}
                  onClick={() => handleClick(n)}
                >
                  {notifLabel(n, () => setOpen(false))}
                </div>
              ))
            }
          </div>
          <div className="notif-dropdown-footer">
            <button onClick={() => { setOpen(false); navigate('/inbox'); }}>View all notifications</button>
          </div>
        </div>
      )}
    </div>
  );
}
