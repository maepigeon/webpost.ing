import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { SEARCH_USERS } from '../Posts/BasicTextPostServerApi.js';
import './SearchPage.css';

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialQ = searchParams.get('q') || '';
  const [input, setInput] = useState(initialQ);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!initialQ) return;
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
    clearTimeout(debounceRef.current);
    if (!v.trim()) { setResults(null); return; }
    debounceRef.current = setTimeout(() => {
      navigate(`/search?q=${encodeURIComponent(v.trim())}`, { replace: true });
      doSearch(v.trim());
    }, 300);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!input.trim()) return;
    navigate(`/search?q=${encodeURIComponent(input.trim())}`);
    doSearch(input.trim());
  }

  return (
    <div className="search-page">
      <div className="search-card">
        <h2 className="search-title">Find users</h2>
        <form className="search-form" onSubmit={handleSubmit}>
          <input
            className="search-input"
            type="text"
            placeholder="Search by username…"
            value={input}
            onChange={handleInput}
            autoFocus
            maxLength={50}
          />
          <button type="submit" className="search-btn">Search</button>
        </form>

        {loading && <p className="search-status">Searching…</p>}

        {!loading && results !== null && results.length === 0 && (
          <p className="search-status">No users found for "{input}".</p>
        )}

        {!loading && results && results.length > 0 && (
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
