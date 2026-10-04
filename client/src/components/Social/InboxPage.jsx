import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { GET_NOTIFICATIONS, MARK_NOTIFICATION_READ, MARK_ALL_READ,
         DELETE_NOTIFICATION, CLEAR_NOTIFICATIONS } from '../Pages/Posts/BasicTextPostServerApi.js';
import { useDialog } from '../Dialog/Dialog.jsx';
import './Social.css';
import './InboxPage.css';
import { notifHref, notifExcerpt, isGone, subjectTitle, GONE_TEXT } from './inboxModel.js';
import Icon from '../Icon/Icon.jsx';

// Tells the top bar's badges to recount now.
const countsChanged = () => window.dispatchEvent(new Event('wp:counts-changed'));

// The actor link goes to the profile, not the row's subject, so it marks the
// row read itself and keeps the row's own click out of it.
function ActorLink({ username, onOpen }) {
  return (
    <Link
      to={`/${username}`}
      className="inbox-actor-link"
      onClick={e => { e.stopPropagation(); onOpen?.(); }}
    >
      {username}
    </Link>
  );
}

// A click on a link inside a row lets the row do the work (mark it read, then
// go), so the badge counts it. A click that opens a new tab keeps the
// browser's own behaviour and stays out of the row.
function keepRowClick(e) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) { e.stopPropagation(); return; }
  e.preventDefault();
}

function SubjectLink({ n, children }) {
  const href = notifHref(n);
  if (!href) return <span>{children}</span>;
  return <Link to={href} className="inbox-post-link" onClick={keepRowClick}>{children}</Link>;
}

function notifLabel(n, onActorOpen) {
  const a = <ActorLink username={n.actorUsername} onOpen={onActorOpen} />;
  let subject;
  if (isGone(n)) subject = <span>{GONE_TEXT}</span>;
  else if (n.type === 'new_post' && !n.postId) subject = <span>a new post</span>;
  else subject = <SubjectLink n={n}>{subjectTitle(n)}</SubjectLink>;
  switch (n.type) {
    case 'comment':  return <span>{a} commented on {subject}</span>;
    case 'reply':    return <span>{a} replied to your comment on {subject}</span>;
    case 'mention':  return <span>{a} mentioned you in a comment on {subject}</span>;
    case 'follow':   return <span>{a} followed you</span>;
    case 'reaction': return <span>{a} reacted{n.reaction ? ` with ${n.reaction}` : ''} to {subject}</span>;
    case 'new_post': return <span>{a} published {subject}</span>;
    case 'message':  return <span>{a} sent you <SubjectLink n={n}>a message</SubjectLink></span>;
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
    countsChanged();
  };

  const clearAll = async () => {
    if (!(await confirm('Clear all notifications? This cannot be undone.'))) return;
    await CLEAR_NOTIFICATIONS().catch(() => {});
    setNotifications([]);
    offsetRef.current = 0;
    setHasMore(false);
    countsChanged();
  };

  const handleClick = async (n) => {
    if (!n.isRead) {
      await MARK_NOTIFICATION_READ(n.id).catch(() => {});
      setNotifications(ns => ns.map(x => x.id === n.id ? { ...x, isRead: true } : x));
      countsChanged();
    }
    const href = notifHref(n);
    if (href) navigate(href);
  };

  const markOne = async (e, n) => {
    e.stopPropagation();
    await MARK_NOTIFICATION_READ(n.id).catch(() => {});
    setNotifications(ns => ns.map(x => x.id === n.id ? { ...x, isRead: true } : x));
    countsChanged();
  };

  // A click on the actor's name marks the row read like the post link does.
  const markOnOpen = async (n) => {
    if (n.isRead) return;
    await MARK_NOTIFICATION_READ(n.id).catch(() => {});
    setNotifications(ns => ns.map(x => x.id === n.id ? { ...x, isRead: true } : x));
    countsChanged();
  };

  const deleteOne = async (e, n) => {
    e.stopPropagation();
    await DELETE_NOTIFICATION(n.id).catch(() => {});
    setNotifications(ns => ns.filter(x => x.id !== n.id));
    offsetRef.current = Math.max(0, offsetRef.current - 1);
    if (!n.isRead) countsChanged();
  };

  const unread = notifications.filter(n => !n.isRead).length;

  return (
    <div className="inbox-page">
      <div className="inbox-header">
        <h2>Notifications</h2>
        <div className="inbox-header-actions">
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
          tabIndex={0}
          onClick={() => handleClick(n)}
          onKeyDown={e => {
            // Only when the row itself has focus; its links and buttons keep their own keys.
            if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
            e.preventDefault();
            handleClick(n);
          }}
        >
          <span className="inbox-item-label">
            <span>{notifLabel(n, () => markOnOpen(n))}</span>
            {notifExcerpt(n) && <span className="inbox-item-excerpt">{notifExcerpt(n)}</span>}
          </span>
          <div className="inbox-item-side">
            <span className="inbox-item-time">{timeAgo(n.createdAt)}</span>
            {!n.isRead && (
              <button
                className="inbox-mark-read-btn"
                onClick={e => markOne(e, n)}
                title="Mark as read"
                aria-label="Mark as read"
              ><Icon name="check" size={14} /></button>
            )}
            <button
              className="inbox-delete-btn"
              onClick={e => deleteOne(e, n)}
              title="Delete notification"
              aria-label="Delete notification"
            ><Icon name="close" size={13} /></button>
          </div>
        </div>
      ))}
      <div ref={sentinelRef} style={{ height: '1px' }} />
      {loadingMore && <p className="inbox-empty">Loading…</p>}
    </div>
  );
}
