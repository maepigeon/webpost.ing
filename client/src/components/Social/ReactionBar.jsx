import { useState, useEffect } from 'react';
import { GET_REACTIONS, SET_REACTION } from '../Pages/Posts/BasicTextPostServerApi.js';
import './Social.css';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

export default function ReactionBar({ postId, isOwner }) {
  const [counts, setCounts] = useState({});
  const [userReactions, setUserReactions] = useState(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const loggedIn = !!localStorage.getItem('userName');

  useEffect(() => {
    GET_REACTIONS(postId)
      .then(data => {
        setCounts(data.counts || {});
        setUserReactions(new Set(data.userReactions || []));
      })
      .catch(() => {});
  }, [postId]);

  const handleReact = async (emoji) => {
    if (!loggedIn) return;
    const isActive = userReactions.has(emoji);
    const prevCounts = { ...counts };
    const prevReactions = new Set(userReactions);

    setCounts(c => {
      const n = { ...c };
      if (isActive) { n[emoji] = (n[emoji] || 1) - 1; if (!n[emoji]) delete n[emoji]; }
      else n[emoji] = (n[emoji] || 0) + 1;
      return n;
    });
    setUserReactions(r => {
      const n = new Set(r);
      if (isActive) n.delete(emoji); else n.add(emoji);
      return n;
    });

    try { await SET_REACTION(postId, emoji); } catch {
      setCounts(prevCounts);
      setUserReactions(prevReactions);
    }
  };

  const activeEmojis = REACTIONS.filter(e => (counts[e] ?? 0) > 0 || userReactions.has(e));
  const pickerEmojis = REACTIONS.filter(e => !activeEmojis.includes(e));

  return (
    <div className="reaction-bar reaction-bar--centered">
      {activeEmojis.map(emoji => (
        <button
          key={emoji}
          className={`reaction-btn${userReactions.has(emoji) ? ' reaction-btn--active' : ''}${isOwner ? ' reaction-btn--readonly' : ''}`}
          onClick={isOwner ? undefined : () => handleReact(emoji)}
          title={isOwner ? emoji : loggedIn ? emoji : 'Log in to react'}
          disabled={!loggedIn && !isOwner}
          style={isOwner ? { cursor: 'default' } : undefined}
        >
          <span className="reaction-emoji">{emoji}</span>
          {counts[emoji] ? <span className="reaction-count">{counts[emoji]}</span> : null}
        </button>
      ))}
      {loggedIn && !isOwner && pickerEmojis.length > 0 && (
        <button
          className="reaction-btn reaction-expand"
          onClick={() => setPickerOpen(o => !o)}
          title={pickerOpen ? 'Close' : 'Add reaction'}
        >
          {pickerOpen ? '×' : '+'}
        </button>
      )}
      {loggedIn && !isOwner && pickerOpen && pickerEmojis.map(emoji => (
        <button
          key={emoji}
          className="reaction-btn reaction-picker-item"
          onClick={() => { handleReact(emoji); setPickerOpen(false); }}
          title={emoji}
        >
          <span className="reaction-emoji">{emoji}</span>
        </button>
      ))}
    </div>
  );
}
