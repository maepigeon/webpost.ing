import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { GET_USER_ACTIVITY } from '../Posts/BasicTextPostServerApi.js';
import './ActivityPage.css';

function timeAgo(date) {
  if (!date) return '';
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(date).toLocaleDateString();
}

function fmtBytes(n) {
  if (!n || n === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0, v = Number(n);
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

export default function ActivityPage() {
  const { username } = useParams();
  const navigate = useNavigate();
  const me = localStorage.getItem('userName');
  const [tab, setTab] = useState('posts');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!me) { setDenied(true); setLoading(false); return; }
    GET_USER_ACTIVITY(username)
      .then(d => { setData(d); setLoading(false); })
      .catch(err => {
        if (err?.response?.status === 401 || err?.response?.status === 403) setDenied(true);
        setLoading(false);
      });
  }, [username]);

  if (loading) return <div className="activity-page"><p className="activity-status">Loading…</p></div>;
  if (denied) return (
    <div className="activity-page">
      <div className="activity-card">
        <p className="activity-status">This page is private.</p>
        <button className="activity-back-btn" onClick={() => navigate('/')}>Go home</button>
      </div>
    </div>
  );

  const posts         = data?.posts           || [];
  const comments      = data?.comments        || [];
  const postReactions = data?.postReactions   || [];
  const commentReactions = data?.commentReactions || [];
  const uploads       = data?.uploads         || [];
  const deletions     = data?.deletions       || [];

  const allReactions = [
    ...postReactions.map(r => ({ ...r, context: 'post' })),
    ...commentReactions.map(r => ({ ...r, context: 'comment' })),
  ].sort((a, b) => (b.post_id ?? 0) - (a.post_id ?? 0));

  const TABS = [
    ['posts',     `Posts (${posts.length})`],
    ['comments',  `Comments (${comments.length})`],
    ['reactions', `Reactions (${allReactions.length})`],
    ['uploads',   `Uploads (${uploads.length})`],
    ['deletions', `Deletions (${deletions.length})`],
  ];

  return (
    <div className="activity-page">
      <div className="activity-card">
        <div className="activity-header">
          <h2 className="activity-title">{me === username ? 'My Activity' : `${username}'s Activity`}</h2>
          <Link to={`/users/${username}`} className="activity-back-link">← Profile</Link>
        </div>

        <div className="activity-tabs">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              className={`activity-tab${tab === key ? ' activity-tab--active' : ''}`}
              onClick={() => setTab(key)}
            >{label}</button>
          ))}
        </div>

        {tab === 'posts' && (
          <div className="activity-list">
            {posts.length === 0 && <p className="activity-empty">No posts yet.</p>}
            {posts.map(p => (
              <div key={p.id} className="activity-item">
                <div className="activity-item-meta">
                  <span className="activity-time">{timeAgo(p.date)}</span>
                  {p.edited_at && <span className="activity-badge">edited {timeAgo(p.edited_at)}</span>}
                  {!p.published && <span className="activity-badge activity-badge--draft">draft</span>}
                  <Link to={`/users/${username}/${p.id}`} className="activity-post-link">
                    {p.title || 'Untitled post'}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'comments' && (
          <div className="activity-list">
            {comments.length === 0 && <p className="activity-empty">No comments yet.</p>}
            {comments.map(c => (
              <div key={c.id} className="activity-item">
                <div className="activity-item-meta">
                  <span className="activity-time">{timeAgo(c.created_at)}</span>
                  {c.edited_at && <span className="activity-badge">edited {timeAgo(c.edited_at)}</span>}
                  {c.score !== 0 && (
                    <span className={`activity-score${c.score > 0 ? ' activity-score--pos' : ' activity-score--neg'}`}>
                      {c.score > 0 ? '+' : ''}{c.score}
                    </span>
                  )}
                  <Link
                    to={`/users/${c.post_owner}/${c.post_id}/discussion#comment-${c.id}`}
                    className="activity-post-link"
                  >
                    {c.post_title || 'Untitled post'}
                  </Link>
                  {c.parent_id && <span className="activity-badge">reply</span>}
                </div>
                <p className="activity-comment-text" style={{ textAlign: 'left' }}>{c.content}</p>
              </div>
            ))}
          </div>
        )}

        {tab === 'reactions' && (
          <div className="activity-list">
            {allReactions.length === 0 && <p className="activity-empty">No reactions yet.</p>}
            {allReactions.map((r, i) => (
              <div key={i} className="activity-item activity-item--reaction">
                <span className="activity-reaction-emoji">{r.reaction}</span>
                {r.context === 'post' ? (
                  <>
                    <Link to={`/users/${r.post_owner}/${r.post_id}`} className="activity-post-link">
                      {r.post_title || 'Untitled post'}
                    </Link>
                    <span className="activity-by">post by {r.post_owner}</span>
                  </>
                ) : (
                  <>
                    <Link
                      to={`/users/${r.post_owner}/${r.post_id}/discussion#comment-${r.comment_id}`}
                      className="activity-post-link"
                    >
                      {r.post_title || 'Untitled post'}
                    </Link>
                    <span className="activity-by">comment in post by {r.post_owner}</span>
                    {r.comment_preview && (
                      <span className="activity-comment-preview">"{r.comment_preview}{r.comment_preview.length >= 120 ? '…' : ''}"</span>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === 'uploads' && (
          <div className="activity-list">
            {uploads.length === 0 && <p className="activity-empty">No uploads yet.</p>}
            {uploads.map(u => (
              <div key={u.id} className="activity-item activity-item--upload">
                <div className="activity-item-meta">
                  <span className="activity-time">{timeAgo(u.uploaded_at)}</span>
                  <span className="activity-upload-size">{fmtBytes(u.size_bytes)}</span>
                  {u.post_owner && u.post_id ? (
                    <Link to={`/users/${u.post_owner}/${u.post_id}`} className="activity-post-link">
                      {u.post_title || 'Untitled post'}
                    </Link>
                  ) : (
                    <span className="activity-orphan">not in any post</span>
                  )}
                </div>
                <div className="activity-upload-name">
                  <a href={`/uploads/${u.filename}`} target="_blank" rel="noreferrer" className="activity-post-link">
                    {u.original_name || u.filename}
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'deletions' && (
          <div className="activity-list">
            {deletions.length === 0 && <p className="activity-empty">Nothing deleted yet.</p>}
            {deletions.map(d => (
              <div key={d.id} className="activity-item activity-item--deletion">
                <div className="activity-item-meta">
                  <span className="activity-badge activity-badge--deleted">{d.item_type} deleted</span>
                  <span className="activity-time">{timeAgo(d.deleted_at)}</span>
                  {d.post_owner && d.post_id && d.item_type === 'comment' ? (
                    <Link to={`/users/${d.post_owner}/${d.post_id}/discussion`} className="activity-post-link">
                      in: {d.post_title || 'Untitled post'}
                    </Link>
                  ) : d.post_title ? (
                    <span className="activity-orphan">{d.post_title} (deleted)</span>
                  ) : null}
                </div>
                {d.summary && <p className="activity-comment-text activity-deletion-preview">{d.summary}{d.summary.length >= 200 ? '…' : ''}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
