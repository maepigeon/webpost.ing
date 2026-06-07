import { useState, useEffect } from 'react';
import { GET_REACTIONS, SET_REACTION } from '../Pages/Posts/BasicTextPostServerApi.js';
import './Social.css';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

export default function ReactionBar({ postId }) {
  const [counts, setCounts] = useState({});
  const [userReactions, setUserReactions] = useState(new Set());
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

  return (
    <div className="reaction-bar reaction-bar--centered">
      {REACTIONS.map(emoji => (
        <button
          key={emoji}
          className={`reaction-btn${userReactions.has(emoji) ? ' reaction-btn--active' : ''}`}
          onClick={() => handleReact(emoji)}
          title={loggedIn ? emoji : 'Log in to react'}
          disabled={!loggedIn}
        >
          <span className="reaction-emoji">{emoji}</span>
          {counts[emoji] ? <span className="reaction-count">{counts[emoji]}</span> : null}
        </button>
      ))}
    </div>
  );
}
