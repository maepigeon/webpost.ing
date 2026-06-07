import { useState, useEffect, useCallback } from 'react';
import {
  GET_POST_FEATURES, SET_DISCUSSION_ENABLED, SET_DISCUSSION_STYLE,
  GET_COMMENTS, ADD_COMMENT
} from '../Pages/Posts/BasicTextPostServerApi.js';
import CommentItem from './CommentItem.jsx';
import './Social.css';

function flattenTree(comments) {
  const result = [];
  const walk = (list) => { for (const c of list) { result.push(c); if (c.replies?.length) walk(c.replies); } };
  walk(comments);
  return result;
}

export default function DiscussionSection({ postId, postAuthor }) {
  const [enabled, setEnabled] = useState(false);
  const [style, setStyle] = useState('threaded');
  const [loaded, setLoaded] = useState(false);
  const [comments, setComments] = useState([]);
  const [sort, setSort] = useState('recent');
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loggedIn = !!localStorage.getItem('userName');
  const me = localStorage.getItem('userName');
  const isAuthor = me === postAuthor;

  useEffect(() => {
    GET_POST_FEATURES(postId)
      .then(d => {
        setEnabled(d.discussionEnabled);
        setStyle(d.discussionStyle || 'threaded');
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [postId]);

  const loadComments = useCallback(() => {
    if (!enabled) return;
    GET_COMMENTS(postId, sort).then(setComments).catch(() => {});
  }, [postId, sort, enabled]);

  useEffect(() => { loadComments(); }, [loadComments]);

  const toggleDiscussion = async () => {
    const next = !enabled;
    try { await SET_DISCUSSION_ENABLED(postId, next); setEnabled(next); } catch {}
  };

  const toggleStyle = async () => {
    const next = style === 'threaded' ? 'flat' : 'threaded';
    try { await SET_DISCUSSION_STYLE(postId, next); setStyle(next); } catch {}
  };

  const submitComment = async () => {
    if (!newComment.trim() || submitting) return;
    setSubmitting(true);
    try {
      await ADD_COMMENT(postId, newComment);
      setNewComment('');
      loadComments();
    } catch {}
    setSubmitting(false);
  };

  if (!loaded) return null;

  const displayComments = style === 'flat'
    ? [...flattenTree(comments)].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    : comments;

  return (
    <div className="discussion-section">
      <div className="discussion-header">
        <h3 className="discussion-title">
          Discussion
          {enabled && (
            <span className="discussion-style-badge" style={{ marginLeft: 8 }}>
              {style === 'flat' ? 'Flat' : 'Threaded'}
            </span>
          )}
        </h3>
        <div style={{ display: 'flex', gap: 6 }}>
          {isAuthor && enabled && (
            <button className="discussion-toggle-btn" onClick={toggleStyle}>
              {style === 'flat' ? 'Threaded' : 'Flat'}
            </button>
          )}
          {isAuthor && (
            <button className="discussion-toggle-btn" onClick={toggleDiscussion}>
              {enabled ? 'Disable' : 'Enable'}
            </button>
          )}
        </div>
      </div>

      {!enabled && (
        <p className="discussion-disabled">Discussion is not enabled for this post.</p>
      )}

      {enabled && (
        <>
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
                placeholder="Add to the discussion..."
                rows={3}
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
                    postId={postId}
                    depth={style === 'flat' ? 0 : undefined}
                    onRefresh={loadComments}
                  />
                ))
            }
          </div>
        </>
      )}
    </div>
  );
}
