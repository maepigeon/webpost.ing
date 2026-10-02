import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  GET_CONVERSATIONS, GET_GROUPS, GET_OR_CREATE_CONVERSATION,
  SEND_CONVERSATION_MESSAGE, SEND_GROUP_MESSAGE, SEARCH_USERS,
} from '../Pages/Posts/BasicTextPostServerApi.js';
import { errorMessage } from '../../utils/errorMessage.js';
import { postMessage } from '../../utils/postMessage.js';
import GridButton from '../Pages/Posts/PostRenderer/RichTextPost/TileGrid/GridButton.jsx';
import PixelText from '../Pages/Posts/PostRenderer/RichTextPost/TileGrid/PixelText.jsx';
import '../Pages/Posts/PostRenderer/RichTextPost/TileGrid/TileGrid.css';
import './PostMessageCard.css';

/**
 * Send a post in a message: pick one of your conversations or groups, or find
 * a person by name, add a note if you like, and send. The message carries only
 * the post's id (see postMessage.js), so the reader sees the post only if they
 * are allowed to.
 *
 * Rendered into <body> so no ancestor's styling can trap the fixed overlay.
 * Focus moves in on open, stays in while it is open, and goes back to whatever
 * opened it on close.
 */
export default function SharePostDialog({ post, onClose, onSent }) {
  const [convs, setConvs] = useState(null);
  const [groups, setGroups] = useState(null);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState([]);
  const [target, setTarget] = useState(null);   // {kind: 'conv'|'group'|'user', id?, username?, label}
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    GET_CONVERSATIONS().then(c => setConvs(Array.isArray(c) ? c : [])).catch(() => setConvs([]));
    GET_GROUPS().then(g => setGroups(Array.isArray(g) ? g : [])).catch(() => setGroups([]));
    return () => clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    const opener = document.activeElement;
    dialogRef.current?.querySelector('input')?.focus();
    return () => { if (opener && document.contains(opener)) opener.focus(); };
  }, []);

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll('button:not(:disabled), input, textarea')];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!dialogRef.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onQuery = (e) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(timer.current);
    if (!val.trim()) { setFound([]); return; }
    timer.current = setTimeout(() => {
      SEARCH_USERS(val.trim()).then(r => setFound(Array.isArray(r) ? r.slice(0, 5) : [])).catch(() => {});
    }, 250);
  };

  const send = async () => {
    if (!target || busy) return;
    setBusy(true);
    setError('');
    try {
      const content = postMessage(post.title, post.id, note);
      if (target.kind === 'group') {
        await SEND_GROUP_MESSAGE(target.id, content);
      } else {
        const convId = target.kind === 'conv' ? target.id : (await GET_OR_CREATE_CONVERSATION(target.username)).id;
        await SEND_CONVERSATION_MESSAGE(convId, content);
      }
      onSent?.(target.label);
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Could not send that post.'));
    } finally {
      setBusy(false);
    }
  };

  const same = (a, b) => a && a.kind === b.kind && a.id === b.id && a.username === b.username;
  const choice = (t) => (
    <button key={`${t.kind}:${t.id ?? t.username}`} type="button" className={`share-post-choice${same(target, t) ? ' is-on' : ''}`}
      aria-label={t.label} aria-pressed={same(target, t)} onClick={() => setTarget(t)}>
      <PixelText text={t.label.slice(0, 28)} px={1.5} />
    </button>
  );

  const loading = convs === null || groups === null;
  const nothing = !loading && convs.length === 0 && groups.length === 0;

  return createPortal(
    <div className="share-post-backdrop" onClick={onClose}>
      <div className="share-post-dialog" role="dialog" aria-modal="true" aria-label="Send in a message" ref={dialogRef}
        onClick={e => e.stopPropagation()}>
        <div className="share-post-title"><PixelText text="Send in a message" px={2} /></div>
        <p className="share-post-what">&ldquo;{post.title || 'Untitled'}&rdquo;</p>

        <label className="share-post-label" htmlFor="share-post-find">Find a person</label>
        <input id="share-post-find" className="share-post-input" value={query} onChange={onQuery}
          placeholder="Username" autoComplete="off" />
        {found.length > 0 && (
          <div className="share-post-list">
            {found.map(u => choice({ kind: 'user', username: u, label: `@${u}` }))}
          </div>
        )}

        <span className="share-post-label">Or a conversation</span>
        {loading ? <p className="share-post-hint">Loading…</p>
          : nothing ? <p className="share-post-hint">No conversations yet. Find a person above.</p>
          : (
            <div className="share-post-list">
              {convs.map(c => choice({ kind: 'conv', id: c.id, label: `@${c.other_username}` }))}
              {groups.map(g => choice({ kind: 'group', id: g.id, label: g.name }))}
            </div>
          )}

        <label className="share-post-label" htmlFor="share-post-note">Add a note (optional)</label>
        <input id="share-post-note" className="share-post-input" value={note} maxLength={500}
          onChange={e => setNote(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send(); }} />

        {error && <p className="share-post-error" role="alert">{error}</p>}
        <div className="share-post-actions">
          <GridButton label="Cancel" onClick={onClose} />
          <GridButton label={busy ? 'Sending…' : 'Send'} disabled={!target || busy} onClick={send} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
