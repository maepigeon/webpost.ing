import { useEffect, useState } from 'react';
import { GET_STICKIES } from '../BasicTextPostServerApi.js';
import { StickyArt } from './ProfileStickies.jsx';
import './ProfileStickies.css';

/**
 * The stickers its author stuck on a post, shown on the post's own page as
 * on its card: across as a share of the width, down from the top. Look only;
 * they are arranged from the author's profile.
 */
export default function PostStickies({ username, postId }) {
  const [stickies, setStickies] = useState([]);
  useEffect(() => {
    if (!username || !postId) return;
    GET_STICKIES(username)
      .then(list => setStickies((Array.isArray(list) ? list : []).filter(t => String(t.postId) === String(postId))))
      .catch(() => {});
  }, [username, postId]);
  if (!stickies.length) return null;
  return (
    <div className="stickies-layer" aria-hidden="true">
      {stickies.map(t => (
        <div key={t.id} className="sticky" style={{ left: `${t.x * 100}%`, top: t.y }}>
          <StickyArt grid={t.grid} size={t.size} name={t.name} />
        </div>
      ))}
    </div>
  );
}
