import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { GET_NOTIFICATIONS, MARK_NOTIFICATION_READ, MARK_ALL_READ,
         DELETE_NOTIFICATION, CLEAR_NOTIFICATIONS } from '../Pages/Posts/BasicTextPostServerApi.js';
import './Social.css';

function ActorLink({ username }) {
  return (
    <Link
      to={`/users/${username}`}
      className="inbox-actor-link"
      onClick={e => e.stopPropagation()}
    >
      {username}
    </Link>
  );
}

function notifLabel(n) {
  const a = <ActorLink username={n.actorUsername} />;
  switch (n.type) {
    case 'comment':  return <span>{a} commented on your post</span>;
    case 'reply':    return <span>{a} replied to your comment</span>;
    case 'follow':   return <span>{a} followed you</span>;
    case 'reaction': return <span>{a} reacted to your post</span>;
    default:         return <span>Notification from {a}</span>;
  }
}

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(date).toLocaleDateString();
}

export default function InboxPage() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight') ? parseInt(searchParams.get('highlight'), 10) : null;
  const highlightRef = useRef(null);

  useEffect(() => {
    GET_NOTIFICATIONS(100)
      .then(data => { setNotifications(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Scroll highlighted notification into view after load
  useEffect(() => {
    if (!loading && highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [loading, highlightId]);

  const markAll = async () => {
    await MARK_ALL_READ().catch(() => {});
    setNotifications(ns => ns.map(n => ({ ...n, isRead: true })));
  };

  const clearAll = async () => {
    if (!window.confirm('Clear all notifications? This cannot be undone.')) return;
    await CLEAR_NOTIFICATIONS().catch(() => {});
    setNotifications([]);
  };

  const handleClick = async (n) => {
    if (!n.isRead) {
      await MARK_NOTIFICATION_READ(n.id).catch(() => {});
      setNotifications(ns => ns.map(x => x.id === n.id ? { ...x, isRead: true } : x));
    }
    if (n.postId) navigate(`/users/${n.actorUsername}/${n.postId}`);
  };

  const deleteOne = async (e, n) => {
    e.stopPropagation();
    await DELETE_NOTIFICATION(n.id).catch(() => {});
    setNotifications(ns => ns.filter(x => x.id !== n.id));
  };

  const unread = notifications.filter(n => !n.isRead).length;

  return (
    <div className="inbox-page">
      <div className="inbox-header" style={{ justifyContent: 'center', position: 'relative' }}>
        <h2 style={{ textAlign: 'center' }}>Inbox</h2>
        <div style={{ position: 'absolute', right: 0, display: 'flex', gap: '8px', alignItems: 'center' }}>
          {unread > 0 && (
            <button className="inbox-mark-all" onClick={markAll}>Mark all as read</button>
          )}
          {notifications.length > 0 && (
            <button className="inbox-mark-all inbox-clear-btn" onClick={clearAll}>Clear all</button>
          )}
        </div>
      </div>

      {loading && <p className="inbox-empty">Loading…</p>}
      {!loading && notifications.length === 0 && <p className="inbox-empty">Your inbox is empty.</p>}
      {!loading && notifications.map(n => (
        <div
          key={n.id}
          ref={n.id === highlightId ? highlightRef : null}
          className={`inbox-item${n.isRead ? '' : ' inbox-item--unread'}${n.id === highlightId ? ' inbox-item--highlight' : ''}`}
          onClick={() => handleClick(n)}
        >
          <span className="inbox-item-label">{notifLabel(n)}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <span className="inbox-item-time">{timeAgo(n.createdAt)}</span>
            <button
              className="inbox-delete-btn"
              onClick={e => deleteOne(e, n)}
              title="Delete notification"
            >✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}
