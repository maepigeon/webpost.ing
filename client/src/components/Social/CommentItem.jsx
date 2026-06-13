import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { VOTE_COMMENT, DELETE_COMMENT, EDIT_COMMENT, ADD_COMMENT,
         SET_COMMENT_REACTION, GET_USER_AVATAR } from '../Pages/Posts/BasicTextPostServerApi.js';
import { IMAGES_BASE_URL } from '../../config.js';
import { useDialog } from '../Dialog/Dialog.jsx';
import AvatarPopup from './AvatarPopup.jsx';
import { linkifyText } from '../../utils/linkifyText.jsx';
import './Social.css';

// Module-level cache so avatars aren't re-fetched per render
const _avatarCache = {};

function UserAvatar({ username }) {
  const [src, setSrc] = useState(_avatarCache[username] ?? null);
  const [showPopup, setShowPopup] = useState(false);

  useEffect(() => {
    if (_avatarCache[username] !== undefined) { setSrc(_avatarCache[username]); return; }
    _avatarCache[username] = ''; // mark as pending
    GET_USER_AVATAR(username)
      .then(d => { _avatarCache[username] = d?.avatarPath || ''; setSrc(_avatarCache[username]); })
      .catch(() => { _avatarCache[username] = ''; });
  }, [username]);

  const initials = username?.[0]?.toUpperCase() || '?';
  const fullSrc = src ? IMAGES_BASE_URL + src : null;

  return (
    <>
      {fullSrc
        ? <img src={fullSrc} alt={username} className="comment-avatar" onClick={() => setShowPopup(true)} style={{ cursor: 'pointer' }} />
        : <span className="comment-avatar comment-avatar--fallback">{initials}</span>
      }
      {showPopup && fullSrc && <AvatarPopup src={fullSrc} username={username} onClose={() => setShowPopup(false)} />}
    </>
  );
}

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉'];


function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function CommentItem({ comment, postId, depth = 0, onRefresh }) {
  const { confirm } = useDialog();
  const [score, setScore] = useState(comment.score);
  const [userVote, setUserVote] = useState(comment.userVote);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [replying, setReplying] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [reactions, setReactions] = useState(comment.reactions ?? {});
  const [userReactions, setUserReactions] = useState(new Set(comment.userReactions ?? []));
  const [pickerOpen, setPickerOpen] = useState(false);

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
    if (!(await confirm('Delete this comment?'))) return;
    try { await DELETE_COMMENT(comment.id); onRefresh(); } catch {}
  };

  const submitReply = async () => {
    if (!replyContent.trim()) return;
    try { await ADD_COMMENT(postId, replyContent, comment.id); setReplyContent(''); setReplying(false); onRefresh(); } catch {}
  };

  // Emojis that have at least one reaction (always shown if count > 0)
  const activeEmojis = REACTION_EMOJIS.filter(e => (reactions[e] ?? 0) > 0 || userReactions.has(e));
  // Emojis available in the picker (those not already active)
  const pickerEmojis = REACTION_EMOJIS.filter(e => !activeEmojis.includes(e));

  return (
    <div id={`comment-${comment.id}`} className={`comment-item depth-${Math.min(depth, 4)}`}>
      <div className="comment-votes">
        <button className={`vote-btn${userVote === 1 ? ' vote-up--active' : ''}`} onClick={() => vote(1)} disabled={!loggedIn} title="Upvote">▲</button>
        <span className="comment-score">{score}</span>
        <button className={`vote-btn${userVote === -1 ? ' vote-down--active' : ''}`} onClick={() => vote(-1)} disabled={!loggedIn} title="Downvote">▼</button>
      </div>
      <div className="comment-body">
        <div className="comment-meta">
          <UserAvatar username={comment.authorUsername} />
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
          <p className="comment-content">{linkifyText(comment.content)}</p>
        )}

        <div className="comment-actions">
          {loggedIn && <button onClick={() => setReplying(r => !r)}>Reply</button>}
          {me === comment.authorUsername && !editing && <button onClick={() => setEditing(true)}>Edit</button>}
          {me === comment.authorUsername && <button onClick={del} className="comment-delete-btn">Delete</button>}
          {/* React button inline with reply/edit/delete */}
          {loggedIn && me !== comment.authorUsername && pickerEmojis.length > 0 && (
            <button
              onClick={() => setPickerOpen(o => !o)}
              title={pickerOpen ? 'Close reactions' : 'Add reaction'}
            >
              {pickerOpen ? 'Close' : 'React'}
            </button>
          )}
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

        {(activeEmojis.length > 0 || pickerOpen) && (
          <div className="comment-reaction-bar">
            {activeEmojis.map(emoji => {
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
            {loggedIn && pickerOpen && pickerEmojis.map(emoji => (
              <button
                key={emoji}
                className="comment-reaction-btn comment-reaction-picker-item"
                onClick={() => { react(emoji); setPickerOpen(false); }}
                title={`React with ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
