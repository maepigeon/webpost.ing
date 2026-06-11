import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { GET_NOTIFICATIONS, MARK_NOTIFICATION_READ, MARK_ALL_READ,
         DELETE_NOTIFICATION, CLEAR_NOTIFICATIONS } from '../Pages/Posts/BasicTextPostServerApi.js';
import { useDialog } from '../Dialog/Dialog.jsx';
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

function PostLink({ n }) {
  if (!n.postOwner || !n.postId) return <span>{n.postTitle || 'your post'}</span>;
  const anchor = n.commentId ? `#comment-${n.commentId}` : '';
  return (
    <Link
      to={`/users/${n.postOwner}/${n.postId}/discussion${anchor}`}
      className="inbox-post-link"
      onClick={e => e.stopPropagation()}
    >
      {n.postTitle || 'your post'}
    </Link>
  );
}

function notifLabel(n) {
  const a = <ActorLink username={n.actorUsername} />;
  switch (n.type) {
    case 'comment':  return <span>{a} commented on your post <PostLink n={n} /></span>;
    case 'reply':    return <span>{a} replied to your comment on <PostLink n={n} /></span>;
    case 'follow':   return <span>{a} followed you</span>;
    case 'reaction': return <span>{a} reacted to your post <PostLink n={n} /></span>;
    case 'new_post': return <span>{a} published {n.postOwner && n.postId ? <Link to={`/users/${n.postOwner}/${n.postId}`} className="inbox-post-link" onClick={e => e.stopPropagation()}>{n.postTitle || 'a new post'}</Link> : 'a new post'}</span>;
    case 'message':  return <span style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}><span style={{ fontWeight: 500 }}>{a} sent you a message:</span><span style={{ color: '#333', whiteSpace: 'pre-wrap' }}>{n.message || ''}</span></span>;
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

const PAGE_SIZE = 30;

export default function InboxPage() {
  const { confirm } = useDialog();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);
  const sentinelRef = useRef(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight') ? parseInt(searchParams.get('highlight'), 10) : null;
  const highlightRef = useRef(null);

  const loadNotifications = useCallback((reset = false) => {
    const offset = reset ? 0 : offsetRef.current;
    if (reset) setLoading(true); else setLoadingMore(true);
    GET_NOTIFICATIONS(PAGE_SIZE, offset)
      .then(data => {
        const page = Array.isArray(data) ? data : [];
        setNotifications(prev => reset ? page : [...prev, ...page]);
        offsetRef.current = offset + page.length;
        setHasMore(page.length === PAGE_SIZE);
        if (reset) setLoading(false); else setLoadingMore(false);
      })
      .catch(() => { setLoading(false); setLoadingMore(false); });
  }, []);

  useEffect(() => {
    offsetRef.current = 0;
    setHasMore(true);
    loadNotifications(true);
  }, []);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
        loadNotifications(false);
      }
    }, { rootMargin: '200px' });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, loadNotifications]);

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
    if (!(await confirm('Clear all notifications? This cannot be undone.'))) return;
    await CLEAR_NOTIFICATIONS().catch(() => {});
    setNotifications([]);
    offsetRef.current = 0;
    setHasMore(false);
  };

  const handleClick = async (n) => {
    if (!n.isRead) {
      await MARK_NOTIFICATION_READ(n.id).catch(() => {});
      setNotifications(ns => ns.map(x => x.id === n.id ? { ...x, isRead: true } : x));
    }
    if ((n.type === 'comment' || n.type === 'reply') && n.postOwner && n.postId) {
      const anchor = n.commentId ? `#comment-${n.commentId}` : '';
      navigate(`/users/${n.postOwner}/${n.postId}/discussion${anchor}`);
    } else if (n.type === 'reaction' && n.postOwner && n.postId) {
      navigate(`/users/${n.postOwner}/${n.postId}`);
    } else if (n.type === 'new_post' && n.postId) {
      navigate(`/users/${n.actorUsername}/${n.postId}`);
    } else if (n.type === 'follow') {
      navigate(`/users/${n.actorUsername}`);
    }
  };

  const markOne = async (e, n) => {
    e.stopPropagation();
    await MARK_NOTIFICATION_READ(n.id).catch(() => {});
    setNotifications(ns => ns.map(x => x.id === n.id ? { ...x, isRead: true } : x));
  };

  const deleteOne = async (e, n) => {
    e.stopPropagation();
    await DELETE_NOTIFICATION(n.id).catch(() => {});
    setNotifications(ns => ns.filter(x => x.id !== n.id));
    offsetRef.current = Math.max(0, offsetRef.current - 1);
  };

  const unread = notifications.filter(n => !n.isRead).length;

  return (
    <div className="inbox-page">
      <div className="inbox-header" style={{ justifyContent: 'center', position: 'relative' }}>
        <h2 style={{ textAlign: 'center' }}>Notifications</h2>
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
      {!loading && notifications.length === 0 && <p className="inbox-empty">No notifications yet.</p>}
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
            {!n.isRead && (
              <button
                className="inbox-mark-read-btn"
                onClick={e => markOne(e, n)}
                title="Mark as read"
              >✓</button>
            )}
            <button
              className="inbox-delete-btn"
              onClick={e => deleteOne(e, n)}
              title="Delete notification"
            >✕</button>
          </div>
        </div>
      ))}
      <div ref={sentinelRef} style={{ height: '1px' }} />
      {loadingMore && <p className="inbox-empty">Loading…</p>}
    </div>
  );
}
