import { useState } from 'react';
import { Link } from 'react-router-dom';
import { VOTE_COMMENT, DELETE_COMMENT, EDIT_COMMENT, ADD_COMMENT,
         SET_COMMENT_REACTION } from '../Pages/Posts/BasicTextPostServerApi.js';
import './Social.css';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉'];

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function CommentItem({ comment, postId, depth = 0, onRefresh }) {
  const [score, setScore] = useState(comment.score);
  const [userVote, setUserVote] = useState(comment.userVote);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [replying, setReplying] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [reactions, setReactions] = useState(comment.reactions ?? {});
  const [userReactions, setUserReactions] = useState(new Set(comment.userReactions ?? []));

  const loggedIn = !!localStorage.getItem('userName');
  const me = localStorage.getItem('userName');

  const vote = async (v) => {
    if (!loggedIn) return;
    const next = userVote === v ? 0 : v;
    const delta = next - userVote;
    setScore(s => s + delta);
    setUserVote(next);
    try { await VOTE_COMMENT(comment.id, next); } catch { setScore(s => s - delta); setUserVote(userVote); }
  };

  const react = async (emoji) => {
    if (!loggedIn) return;
    const isActive = userReactions.has(emoji);
    const prevReactions = { ...reactions };
    const prevUserReactions = new Set(userReactions);

    setReactions(r => {
      const next = { ...r };
      if (isActive) { next[emoji] = (next[emoji] ?? 1) - 1; if (!next[emoji]) delete next[emoji]; }
      else next[emoji] = (next[emoji] ?? 0) + 1;
      return next;
    });
    setUserReactions(r => {
      const next = new Set(r);
      if (isActive) next.delete(emoji); else next.add(emoji);
      return next;
    });

    try { await SET_COMMENT_REACTION(comment.id, emoji); } catch {
      setReactions(prevReactions);
      setUserReactions(prevUserReactions);
    }
  };

  const saveEdit = async () => {
    if (!editContent.trim()) return;
    try { await EDIT_COMMENT(comment.id, editContent); setEditing(false); onRefresh(); } catch {}
  };

  const del = async () => {
    if (!window.confirm('Delete this comment?')) return;
    try { await DELETE_COMMENT(comment.id); onRefresh(); } catch {}
  };

  const submitReply = async () => {
    if (!replyContent.trim()) return;
    try { await ADD_COMMENT(postId, replyContent, comment.id); setReplyContent(''); setReplying(false); onRefresh(); } catch {}
  };

  const visibleReactions = REACTION_EMOJIS.filter(e => loggedIn || (reactions[e] ?? 0) > 0);

  return (
    <div className={`comment-item depth-${Math.min(depth, 4)}`}>
      <div className="comment-votes">
        <button className={`vote-btn${userVote === 1 ? ' vote-up--active' : ''}`} onClick={() => vote(1)} disabled={!loggedIn} title="Upvote">▲</button>
        <span className="comment-score">{score}</span>
        <button className={`vote-btn${userVote === -1 ? ' vote-down--active' : ''}`} onClick={() => vote(-1)} disabled={!loggedIn} title="Downvote">▼</button>
      </div>
      <div className="comment-body">
        <div className="comment-meta">
          <Link to={`/users/${comment.authorUsername}`} className="comment-author" style={{ textDecoration: 'none' }}>{comment.authorUsername}</Link>
          <span className="comment-time">{timeAgo(comment.createdAt)}</span>
          {comment.editedAt && <span className="comment-edited">(edited)</span>}
          {comment.replies?.length > 0 && (
            <button className="comment-collapse" onClick={() => setCollapsed(c => !c)}>
              {collapsed ? `[+${comment.replies.length}]` : '[-]'}
            </button>
          )}
        </div>

        {editing ? (
          <div className="comment-edit-form">
            <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={3} />
            <div className="comment-edit-actions">
              <button onClick={saveEdit}>Save</button>
              <button onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <p className="comment-content">{comment.content}</p>
        )}

        <div className="comment-actions">
          {loggedIn && <button onClick={() => setReplying(r => !r)}>Reply</button>}
          {me === comment.authorUsername && !editing && <button onClick={() => setEditing(true)}>Edit</button>}
          {me === comment.authorUsername && <button onClick={del} className="comment-delete-btn">Delete</button>}
        </div>

        {replying && (
          <div className="comment-reply-form">
            <textarea
              value={replyContent}
              onChange={e => setReplyContent(e.target.value)}
              placeholder="Write a reply..."
              rows={3}
            />
            <div className="comment-edit-actions">
              <button onClick={submitReply}>Post reply</button>
              <button onClick={() => setReplying(false)}>Cancel</button>
            </div>
          </div>
        )}

        {!collapsed && comment.replies?.length > 0 && (
          <div className="comment-replies">
            {comment.replies.map(r => (
              <CommentItem key={r.id} comment={r} postId={postId} depth={depth + 1} onRefresh={onRefresh} />
            ))}
          </div>
        )}

        {visibleReactions.length > 0 && (
          <div className="comment-reaction-bar comment-reaction-bar--centered">
            {visibleReactions.map(emoji => {
              const count = reactions[emoji] ?? 0;
              return (
                <button
                  key={emoji}
                  className={`comment-reaction-btn${userReactions.has(emoji) ? ' comment-reaction-btn--active' : ''}`}
                  onClick={() => react(emoji)}
                  disabled={!loggedIn}
                  title={loggedIn ? `React with ${emoji}` : 'Log in to react'}
                >
                  {emoji}{count > 0 && <span className="comment-reaction-count">{count}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
