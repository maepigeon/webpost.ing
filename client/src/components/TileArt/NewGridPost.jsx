import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CREATE_POST } from '../Pages/Posts/BasicTextPostServerApi.js';
import { gridPostContent } from '../../utils/gridPost.js';
import './NewGridPost.css';

/**
 * Starts a grid post: a post whose content is one tile grid. It is created as
 * a draft and opened in the editor; once published it sits on the profile like
 * any post — dragged into order, filed in folders, pinned — with its grid drawn
 * on the card.
 */
export default function NewGridPost() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const id = await CREATE_POST(1, 'Grid', gridPostContent(), false, null, null, null);
      navigate(`/editor/${id}`);
    } catch (err) {
      setError(typeof err?.response?.data === 'string' ? err.response.data : 'Could not start a grid post.');
      setBusy(false);
    }
  };

  return (
    <div className="new-grid-post">
      <button type="button" onClick={start} disabled={busy}>{busy ? 'Starting…' : '+ New grid post'}</button>
      {error && <span className="new-grid-post-error" role="alert">{error}</span>}
    </div>
  );
}
