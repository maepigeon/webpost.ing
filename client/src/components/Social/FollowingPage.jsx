import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GET_FOLLOWING_FEED } from '../Pages/Posts/BasicTextPostServerApi.js';
import BasicTextPost from '../Pages/Posts/PostRenderer/BasicTextPost/BasicTextPost.jsx';
import { IMAGES_BASE_URL } from '../../config.js';
import { usePageTitle } from '../../utils/usePageTitle.js';
import './FollowingPage.css';

const PAGE = 20;

/**
 * Following: recent posts from the people you follow, newest first, as the
 * same cards their profiles show, each under its author.
 */
export default function FollowingPage() {
  usePageTitle('Following');
  const navigate = useNavigate();
  const signedIn = Boolean(localStorage.getItem('userName'));
  const [posts, setPosts] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState('loading');   // loading | ready | failed

  const load = useCallback(async (offset) => {
    try {
      const page = await GET_FOLLOWING_FEED(PAGE, offset);
      setPosts(prev => (offset ? [...prev, ...page.posts] : page.posts));
      setHasMore(Boolean(page.hasMore));
      setState('ready');
    } catch (err) {
      if (err?.response?.status === 401) { navigate('/routes/Login'); return; }
      setState('failed');
    }
  }, [navigate]);

  useEffect(() => {
    if (!signedIn) { navigate('/routes/Login'); return; }
    load(0);
  }, [signedIn, navigate, load]);

  return (
    <div className="following-page">
      <h1 className="following-title">Following</h1>
      {state === 'loading' && <p className="following-note">Loading…</p>}
      {state === 'failed' && <p className="following-note">Could not load your feed. <button type="button" onClick={() => load(0)}>Try again</button></p>}
      {state === 'ready' && posts.length === 0 && (
        <p className="following-note">
          Nothing yet. Posts from people you follow show up here: find someone on{' '}
          <Link to="/search">Search</Link> and press Follow on their profile.
        </p>
      )}
      <ul className="following-list">
        {posts.map(post => (
          <li key={post.id} className="following-item">
            <Link to={`/${post.username}`} className="following-author">
              {post.avatarPath
                ? <img loading="lazy" decoding="async" width="28" height="28" src={IMAGES_BASE_URL + post.avatarPath} alt="" className="squircle following-avatar" />
                : <span className="squircle following-avatar following-avatar--initial" aria-hidden="true">{post.username[0].toUpperCase()}</span>}
              <span>{post.username}</span>
            </Link>
            <BasicTextPost postdata={post} ownerUsername={post.username} hasModifyPermissions={false}
              updatePostsFlagCallback={() => {}} />
          </li>
        ))}
      </ul>
      {hasMore && (
        <button type="button" className="following-more" onClick={() => load(posts.length)}>Load more</button>
      )}
    </div>
  );
}
