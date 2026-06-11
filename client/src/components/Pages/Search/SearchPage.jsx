import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { SEARCH_USERS, GET_HASHTAG_POSTS } from '../Posts/BasicTextPostServerApi.js';
import './SearchPage.css';

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tag = searchParams.get('tag') || '';
  const initialQ = searchParams.get('q') || '';
  const [input, setInput] = useState(tag ? `#${tag}` : initialQ);
  const [results, setResults] = useState(null);
  const [hashtagPosts, setHashtagPosts] = useState(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  // Hashtag mode: load posts for the tag
  useEffect(() => {
    if (!tag) return;
    setLoading(true);
    GET_HASHTAG_POSTS(tag)
      .then(data => { setHashtagPosts(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setHashtagPosts([]); setLoading(false); });
  }, [tag]);

  // User search mode
  useEffect(() => {
    if (tag || !initialQ) return;
    doSearch(initialQ);
  }, []);

  function doSearch(q) {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    SEARCH_USERS(q.trim())
      .then(data => { setResults(data); setLoading(false); })
      .catch(() => { setResults([]); setLoading(false); });
  }

  function handleInput(e) {
    const v = e.target.value;
    setInput(v);
    setHashtagPosts(null);
    clearTimeout(debounceRef.current);
    if (!v.trim()) { setResults(null); return; }
    debounceRef.current = setTimeout(() => {
      const trimmed = v.trim();
      if (trimmed.startsWith('#')) {
        const t = trimmed.slice(1);
        if (t) navigate(`/search?tag=${encodeURIComponent(t)}`, { replace: true });
      } else {
        navigate(`/search?q=${encodeURIComponent(trimmed)}`, { replace: true });
        doSearch(trimmed);
      }
    }, 300);
  }

  function handleSubmit(e) {
    e.preventDefault();
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

  const isHashtagMode = !!tag;

  return (
    <div className="search-page">
      <div className="search-card">
        <h2 className="search-title">{isHashtagMode ? `#${tag}` : 'Find users'}</h2>
        <form className="search-form" onSubmit={handleSubmit}>
          <input
            className="search-input"
            type="text"
            placeholder="Search by username or #hashtag…"
            value={input}
            onChange={handleInput}
            autoFocus
            maxLength={50}
          />
          <button type="submit" className="search-btn">Search</button>
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

        {/* User search results */}
        {!isHashtagMode && !loading && results !== null && results.length === 0 && (
          <p className="search-status">No users found for "{input}".</p>
        )}
        {!isHashtagMode && !loading && results && results.length > 0 && (
          <ul className="search-results">
            {results.map(username => (
              <li key={username} className="search-result-item">
                <Link to={`/users/${username}`} className="search-result-link">
                  {username}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
