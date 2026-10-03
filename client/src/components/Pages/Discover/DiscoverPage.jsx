import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { GET_DISCOVER_FEED, GET_DISCOVER_PEOPLE } from '../Posts/BasicTextPostServerApi.js';
import BasicTextPost from '../Posts/PostRenderer/BasicTextPost/BasicTextPost.jsx';
import FollowButton from '../../Social/FollowButton.jsx';
import { IMAGES_BASE_URL } from '../../../config.js';
import { usePageTitle } from '../../../utils/usePageTitle.js';
import '../../Social/FollowingPage.css';
import './DiscoverPage.css';

const PAGE = 20;

function Avatar({ username, avatarPath, className, size }) {
  return avatarPath
    ? <img loading="lazy" decoding="async" width={size} height={size} src={IMAGES_BASE_URL + avatarPath} alt="" className={`squircle ${className}`} />
    : <span className={`squircle ${className} discover-avatar--initial`} aria-hidden="true">{username[0].toUpperCase()}</span>;
}

/** The "before" value for the next page: the last post's date as an ISO time. */
export function nextBefore(posts) {
  const last = posts[posts.length - 1];
  return last ? new Date(last.date).toISOString() : undefined;
}

function PostsTab() {
  const [posts, setPosts] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState('loading');   // loading | ready | failed

  const load = useCallback(async (before) => {
    try {
      const page = await GET_DISCOVER_FEED(before, PAGE);
      setPosts(prev => (before ? [...prev, ...page.posts] : page.posts));
      setHasMore(Boolean(page.hasMore));
      setState('ready');
    } catch {
      setState('failed');
    }
  }, []);

  useEffect(() => { load(undefined); }, [load]);

  return (
    <>
      {state === 'loading' && <p className="following-note">Loading…</p>}
      {state === 'failed' && <p className="following-note">Could not load posts. <button type="button" onClick={() => load(nextBefore(posts))}>Try again</button></p>}
      {state === 'ready' && posts.length === 0 && (
        <p className="following-note">No posts from other members yet. Come back soon.</p>
      )}
      <ul className="following-list">
        {posts.map(post => (
          <li key={post.id} className="following-item">
            <Link to={`/${post.username}`} className="following-author">
              <Avatar username={post.username} avatarPath={post.avatarPath} className="following-avatar" size={28} />
              <span>{post.username}</span>
            </Link>
            <BasicTextPost postdata={post} ownerUsername={post.username} hasModifyPermissions={false}
              updatePostsFlagCallback={() => {}} />
          </li>
        ))}
      </ul>
      {hasMore && (
        <button type="button" className="following-more" onClick={() => load(nextBefore(posts))}>Load more</button>
      )}
    </>
  );
}

function PeopleTab() {
  const [people, setPeople] = useState([]);
  const [state, setState] = useState('loading');

  const load = useCallback(() => {
    setState('loading');
    GET_DISCOVER_PEOPLE()
      .then(list => { setPeople(Array.isArray(list) ? list : []); setState('ready'); })
      .catch(() => setState('failed'));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      {state === 'loading' && <p className="following-note">Loading…</p>}
      {state === 'failed' && <p className="following-note">Could not load people. <button type="button" onClick={load}>Try again</button></p>}
      {state === 'ready' && people.length === 0 && (
        <p className="following-note">Nobody else has posted yet.</p>
      )}
      <ul className="discover-people">
        {people.map(p => (
          <li key={p.username} className="discover-person">
            <Link to={`/${p.username}`} className="discover-person-main">
              <Avatar username={p.username} avatarPath={p.avatarPath} className="discover-person-avatar" size={44} />
              <span className="discover-person-text">
                <strong>{p.username}</strong>
                {p.bio && <span className="discover-person-bio">{p.bio}</span>}
              </span>
            </Link>
            <FollowButton username={p.username} />
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * Discover: recent public posts from everyone, and the people behind them, for
 * a member who does not follow anyone yet. Open to visitors too.
 */
export default function DiscoverPage() {
  usePageTitle('Discover');
  const [tab, setTab] = useState('posts');

  return (
    <div className="following-page">
      <h1 className="following-title">Discover</h1>
      <div className="discover-tabs" role="tablist" aria-label="Discover">
        {[['posts', 'Posts'], ['people', 'People']].map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key}
            className={`discover-tab${tab === key ? ' is-active' : ''}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'posts' ? <PostsTab /> : <PeopleTab />}
      </div>
    </div>
  );
}
