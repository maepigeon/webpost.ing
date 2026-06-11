import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  GET_POST_FEATURES, GET_COMMENTS, ADD_COMMENT,
  GET_USER_FROM_POST, READ_POST,
} from '../Pages/Posts/BasicTextPostServerApi.js';
import CommentItem from './CommentItem.jsx';
import { patternToStyle } from '../PatternPicker/patterns.js';
import './Social.css';

function flattenTree(comments) {
  const result = [];
  const walk = (list) => { for (const c of list) { result.push(c); if (c.replies?.length) walk(c.replies); } };
  walk(comments);
  return result;
}

export default function DiscussionPage() {
  const { id, username } = useParams();
  const navigate = useNavigate();

  const [postTitle, setPostTitle] = useState('');
  const [backgroundPattern, setBackgroundPattern] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [style, setStyle] = useState('threaded');
  const [loaded, setLoaded] = useState(false);
  const [comments, setComments] = useState([]);
  const [sort, setSort] = useState('recent');
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loggedIn = !!localStorage.getItem('userName');

  useEffect(() => {
    READ_POST(id).then(data => {
      setPostTitle(data.title);
      setBackgroundPattern(data.backgroundPattern || '');
    }).catch(() => {});
    GET_POST_FEATURES(id)
      .then(d => {
        setEnabled(d.discussionEnabled);
        setStyle(d.discussionStyle || 'threaded');
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [id]);

  const loadComments = useCallback(() => {
    if (!enabled) return;
    GET_COMMENTS(id, sort).then(data => {
      setComments(data);
      // Scroll to a linked comment after load
      const hash = window.location.hash;
      if (hash) {
        setTimeout(() => {
          const el = document.querySelector(hash);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('comment-highlight');
            setTimeout(() => el.classList.remove('comment-highlight'), 2000);
          }
        }, 50);
      }
    }).catch(() => {});
  }, [id, sort, enabled]);

  useEffect(() => { loadComments(); }, [loadComments]);

  useEffect(() => {
    const s = patternToStyle(backgroundPattern);
    document.body.style.backgroundImage = s.backgroundImage || '';
    document.body.style.backgroundSize = s.backgroundSize || 'auto';
    document.body.style.backgroundPosition = s.backgroundPosition || 'initial';
    document.documentElement.style.backgroundColor = s._bgColor || '';
    return () => {
      document.body.style.backgroundImage = '';
      document.body.style.backgroundSize = '';
      document.body.style.backgroundPosition = '';
      document.documentElement.style.backgroundColor = '';
    };
  }, [backgroundPattern]);

  const submitComment = async () => {
    if (!newComment.trim() || submitting) return;
    setSubmitting(true);
    try {
      await ADD_COMMENT(id, newComment);
      setNewComment('');
      loadComments();
    } catch {}
    setSubmitting(false);
  };

  if (!loaded) return <div className="discussion-page"><div className="discussion-glass-panel"><p className="discussion-empty">Loading…</p></div></div>;

  if (!enabled) return (
    <div className="discussion-page">
      <div className="discussion-glass-panel">
        <button className="discussion-back-btn" onClick={() => navigate(-1)}>← Back to post</button>
        <p className="discussion-disabled">Discussion is not enabled for this post.</p>
      </div>
    </div>
  );

  const displayComments = style === 'flat'
    ? [...flattenTree(comments)].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    : comments;

  return (
    <div className="discussion-page">
      <div className="discussion-glass-panel">
      <div className="discussion-page-header">
        <button className="discussion-back-btn" onClick={() => navigate(`/users/${username}/${id}`)}>
          ← Back to post
        </button>
        <div>
          <h2 className="discussion-page-title">Discussion</h2>
          {postTitle && <p className="discussion-post-subtitle">{postTitle}</p>}
        </div>
        <span className="discussion-style-badge">
          {style === 'flat' ? 'Flat' : 'Threaded'}
        </span>
      </div>

      {style === 'threaded' && (
        <div className="discussion-sort">
          <button className={sort === 'recent' ? 'sort-active' : ''} onClick={() => setSort('recent')}>Recent</button>
          <button className={sort === 'votes' ? 'sort-active' : ''} onClick={() => setSort('votes')}>Top</button>
        </div>
      )}

      {loggedIn ? (
        <div className="discussion-compose">
          <textarea
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            placeholder="Add to the discussion…"
            rows={4}
          />
          <button onClick={submitComment} disabled={submitting || !newComment.trim()}>
            {submitting ? 'Posting…' : 'Post comment'}
          </button>
        </div>
      ) : (
        <p className="discussion-login-prompt">Log in to join the discussion.</p>
      )}

      <div className="discussion-comments">
        {displayComments.length === 0
          ? <p className="discussion-empty">No comments yet. Be the first!</p>
          : displayComments.map(c => (
              <CommentItem
                key={c.id}
                comment={c}
                postId={id}
                depth={style === 'flat' ? 0 : undefined}
                onRefresh={loadComments}
              />
            ))
        }
      </div>
      </div>
    </div>
  );
}
