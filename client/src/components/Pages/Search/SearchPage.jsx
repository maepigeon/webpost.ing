import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
  SEARCH_USERS, SEARCH_POSTS, GET_HASHTAG_POSTS, GET_HASHTAG_SUGGESTIONS,
  GET_RECENTLY_ACTIVE_USERS, GET_USER_AVATAR,
} from '../Posts/BasicTextPostServerApi.js';
import { IMAGES_BASE_URL } from '../../../config.js';
import { usePageTitle } from '../../../utils/usePageTitle.js';
import './SearchPage.css';

function UserMiniCard({ username }) {
  const [avatarSrc, setAvatarSrc] = useState(null);
  useEffect(() => {
    GET_USER_AVATAR(username)
      .then(d => setAvatarSrc(d?.avatarPath ? IMAGES_BASE_URL + d.avatarPath : null))
      .catch(() => {});
  }, [username]);

  return (
    <Link to={`/users/${username}`} className="search-user-card">
      <div className="search-user-avatar">
        {avatarSrc
          ? <img src={avatarSrc} alt={username} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
          : username?.[0]?.toUpperCase()
        }
      </div>
      <span className="search-user-card-name">{username}</span>
    </Link>
  );
}

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tag = searchParams.get('tag') || '';
  const initialQ = searchParams.get('q') || '';
  usePageTitle(tag ? `#${tag}` : initialQ ? `Search: ${initialQ}` : 'Find users');

  const [input, setInput]               = useState(tag ? `#${tag}` : initialQ);
  const [results, setResults]           = useState(null);
  const [postResults, setPostResults]   = useState(null);
  const [hashtagPosts, setHashtagPosts] = useState(null);
  const [loading, setLoading]           = useState(false);
  const [recentlyActive, setRecentlyActive] = useState([]);

  // Hashtag suggestions state
  const [tagSuggestions, setTagSuggestions]   = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSugIdx, setActiveSugIdx]       = useState(-1);

  const debounceRef   = useRef(null);
  const suggestRef    = useRef(null);
  const inputRef      = useRef(null);

  useEffect(() => {
    GET_RECENTLY_ACTIVE_USERS()
      .then(data => setRecentlyActive(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Load hashtag posts when URL tag param changes
  useEffect(() => {
    if (!tag) return;
    setLoading(true);
    GET_HASHTAG_POSTS(tag)
      .then(data => { setHashtagPosts(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setHashtagPosts([]); setLoading(false); });
  }, [tag]);

  // Search on initial q param
  useEffect(() => {
    if (tag || !initialQ) return;
    doSearch(initialQ);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (suggestRef.current && !suggestRef.current.contains(e.target) &&
          inputRef.current && !inputRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Parse "from:username rest query" out of a search string
  function parseSearchInput(raw) {
    const fromMatch = raw.match(/(?:^|\s)from:(\S+)/i);
    const from = fromMatch ? fromMatch[1] : null;
    const q = raw.replace(/(?:^|\s)from:\S+/i, '').trim();
    return { q, from };
  }

  function doSearch(raw) {
    const { q, from } = parseSearchInput(raw);
    if (!q && !from) { setResults([]); setPostResults([]); return; }
    setLoading(true);
    Promise.all([
      q ? SEARCH_USERS(q).catch(() => []) : Promise.resolve([]),
      SEARCH_POSTS(q, from).catch(() => []),
    ]).then(([users, posts]) => {
      setResults(users);
      setPostResults(posts);
      setLoading(false);
    });
  }

  function handleInput(e) {
    const v = e.target.value;
    setInput(v);
    setHashtagPosts(null);
    setPostResults(null);
    setActiveSugIdx(-1);
    clearTimeout(debounceRef.current);

    const trimmed = v.trim();

    // Hashtag suggestions
    if (trimmed.startsWith('#') && trimmed.length > 1) {
      const q = trimmed.slice(1);
      GET_HASHTAG_SUGGESTIONS(q)
        .then(tags => { setTagSuggestions(tags); setShowSuggestions(tags.length > 0); })
        .catch(() => {});
    } else {
      setTagSuggestions([]);
      setShowSuggestions(false);
    }

    if (!trimmed) { setResults(null); setPostResults(null); return; }

    debounceRef.current = setTimeout(() => {
      if (trimmed.startsWith('#')) {
        const t = trimmed.slice(1);
        if (t) navigate(`/search?tag=${encodeURIComponent(t)}`, { replace: true });
      } else {
        navigate(`/search?q=${encodeURIComponent(trimmed)}`, { replace: true });
        doSearch(trimmed);
      }
    }, 300);
  }

  function selectSuggestion(tagStr) {
    setInput(`#${tagStr}`);
    setShowSuggestions(false);
    setTagSuggestions([]);
    navigate(`/search?tag=${encodeURIComponent(tagStr)}`);
  }

  function handleKeyDown(e) {
    if (!showSuggestions || tagSuggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSugIdx(i => Math.min(i + 1, tagSuggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSugIdx(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && activeSugIdx >= 0) {
      e.preventDefault();
      selectSuggestion(tagSuggestions[activeSugIdx]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    setShowSuggestions(false);
    const trimmed = input.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('#')) {
      const t = trimmed.slice(1);
      if (t) navigate(`/search?tag=${encodeURIComponent(t)}`);
    } else {
      navigate(`/search?q=${encodeURIComponent(trimmed)}`);
      doSearch(trimmed);
    }
  }

  // Detect if there's a from: filter active
  const { from: activeFrom } = parseSearchInput(input);

  const isHashtagMode = !!tag;

  return (
    <div className="search-page">
      <div className="search-card">
        <h2 className="search-title">{isHashtagMode ? `#${tag}` : 'Find users'}</h2>
        <form className="search-form" onSubmit={handleSubmit} style={{ position: 'relative' }}>
          <input
            ref={inputRef}
            className="search-input"
            type="text"
            placeholder="Search by username or #hashtag…"
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onFocus={() => tagSuggestions.length > 0 && setShowSuggestions(true)}
            autoFocus
            maxLength={50}
            autoComplete="off"
          />
          <button type="submit" className="search-btn">Search</button>

          {/* Hashtag suggestions dropdown */}
          {showSuggestions && tagSuggestions.length > 0 && (
            <div ref={suggestRef} className="search-hashtag-suggestions">
              {tagSuggestions.map((t, i) => (
                <button
                  key={t}
                  type="button"
                  className={`search-hashtag-suggestion${i === activeSugIdx ? ' search-hashtag-suggestion--active' : ''}`}
                  onMouseDown={e => { e.preventDefault(); selectSuggestion(t); }}
                >
                  <span className="search-hashtag-suggestion-hash">#</span>{t}
                </button>
              ))}
            </div>
          )}
        </form>

        {loading && <p className="search-status">Searching…</p>}

        {/* Hashtag results */}
        {isHashtagMode && !loading && hashtagPosts !== null && hashtagPosts.length === 0 && (
          <p className="search-status">No posts found with #{tag}.</p>
        )}
        {isHashtagMode && !loading && hashtagPosts && hashtagPosts.length > 0 && (
          <ul className="search-results">
            {hashtagPosts.map(p => (
              <li key={p.id} className="search-result-item">
                <Link to={`/users/${p.username}/${p.id}`} className="search-result-link">
                  <span style={{ fontWeight: 600 }}>{p.title}</span>
                  <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>by {p.username}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {/* User search results — top 5 */}
        {!isHashtagMode && !loading && results !== null && results.length > 0 && (
          <>
            <p className="search-section-mini-label">
              Users{results.length > 5 ? ' — top 5' : ''}
            </p>
            <ul className="search-results">
              {results.slice(0, 5).map(username => (
                <li key={username} className="search-result-item">
                  <Link to={`/users/${username}`} className="search-result-link">{username}</Link>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Post search results — top 5 */}
        {!isHashtagMode && !loading && postResults && postResults.length > 0 && (
          <>
            <p className="search-section-mini-label">
              Posts{activeFrom ? ` by ${activeFrom}` : ''}{postResults.length > 5 ? ' — top 5' : ''}
            </p>
            <ul className="search-results">
              {postResults.slice(0, 5).map(p => (
                <li key={p.id} className="search-result-item">
                  <Link to={`/users/${p.username}/${p.id}`} className="search-result-link">
                    <span style={{ fontWeight: 600 }}>{p.title}</span>
                    <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>by {p.username}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Empty state — only shown when both lists are empty */}
        {!isHashtagMode && !loading && results !== null && postResults !== null &&
          results.length === 0 && postResults.length === 0 && (
          <p className="search-status">No results for "{input.replace(/from:\S+/i, '').trim()}".</p>
        )}
      </div>

      {/* Recently online section */}
      {!isHashtagMode && recentlyActive.length > 0 && (
        <div className="search-recently-online">
          <div className="search-section-divider">
            <span className="search-section-line" />
            <span className="search-section-label">Recently online</span>
            <span className="search-section-line" />
          </div>
          <div className={`search-users-grid${recentlyActive.length < 5 ? ' search-users-grid--centered' : ''}`}>
            {recentlyActive.map(u => (
              <UserMiniCard key={u.username} username={u.username} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
