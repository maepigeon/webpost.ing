import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { GET_POST_CARD } from '../Pages/Posts/BasicTextPostServerApi.js';
import { cardGridOf } from '../../utils/gridPost.js';
import { postPath } from '../../utils/postUrl.js';
import TileGrid from '../Pages/Posts/PostRenderer/RichTextPost/TileGrid/TileGrid.jsx';
import './PostMessageCard.css';

/**
 * A post shared in a message: its title, its author and, if it holds a grid,
 * the first grid, read-only and cut off at half its width like a profile card.
 *
 * The server decides what this reader may see. A draft or a deleted post both
 * come back as "not found", and the card then says only that the post isn't
 * available, never anything about it.
 */
export default function PostMessageCard({ id }) {
  const [post, setPost] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let live = true;
    setPost(null);
    setMissing(false);
    GET_POST_CARD(id).then(p => { if (live) setPost(p); }).catch(() => { if (live) setMissing(true); });
    return () => { live = false; };
  }, [id]);

  const grid = useMemo(() => cardGridOf(post), [post]);

  if (missing) return <div className="post-msg-card post-msg-card--missing">This post isn&apos;t available.</div>;
  if (!post) return <div className="post-msg-card post-msg-card--loading">Loading post…</div>;

  const cropped = grid && grid.rows / grid.cols > 0.5;
  return (
    <Link to={postPath(post.username, post)} className="post-msg-card" onClick={e => e.stopPropagation()}>
      <span className="post-msg-card-title">{post.title || 'Untitled'}</span>
      <span className="post-msg-card-author">by @{post.username}{post.published ? '' : ' · draft'}</span>
      {grid && (
        <div className="post-msg-card-grid">
          <div className={`post-msg-card-window${cropped ? ' is-cropped' : ''}`}>
            <TileGrid data={grid} editable={false} onChange={() => {}} linksActive={false} />
          </div>
        </div>
      )}
    </Link>
  );
}
