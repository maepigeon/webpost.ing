import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { GET_USER_ACTIVITY } from '../Posts/BasicTextPostServerApi.js';
import './ActivityPage.css';

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(date).toLocaleDateString();
}

export default function ActivityPage() {
  const { username } = useParams();
  const navigate = useNavigate();
  const me = localStorage.getItem('userName');
  const [tab, setTab] = useState('comments');
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

  const comments = data?.comments || [];
  const reactions = data?.reactions || [];

  return (
    <div className="activity-page">
      <div className="activity-card">
        <div className="activity-header">
          <h2 className="activity-title">{me === username ? 'My Activity' : `${username}'s Activity`}</h2>
          <Link to={`/users/${username}`} className="activity-back-link">← Profile</Link>
        </div>

        <div className="activity-tabs">
          {[['comments', `Posts (${comments.length})`], ['reactions', `Reactions (${reactions.length})`]].map(([key, label]) => (
            <button
              key={key}
              className={`activity-tab${tab === key ? ' activity-tab--active' : ''}`}
              onClick={() => setTab(key)}
            >{label}</button>
          ))}
        </div>

        {tab === 'comments' && (
          <div className="activity-list">
            {comments.length === 0 && <p className="activity-empty">No comments yet.</p>}
            {comments.map(c => (
              <div key={c.id} className="activity-item">
                <div className="activity-item-meta">
                  <span className="activity-time">{timeAgo(c.created_at)}</span>
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
                <p className="activity-comment-text">{c.content}</p>
              </div>
            ))}
          </div>
        )}

        {tab === 'reactions' && (
          <div className="activity-list">
            {reactions.length === 0 && <p className="activity-empty">No reactions yet.</p>}
            {reactions.map((r, i) => (
              <div key={i} className="activity-item activity-item--reaction">
                <span className="activity-reaction-emoji">{r.reaction}</span>
                <Link
                  to={`/users/${r.post_owner}/${r.post_id}`}
                  className="activity-post-link"
                >
                  {r.post_title || 'Untitled post'}
                </Link>
                <span className="activity-by">by {r.post_owner}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
