import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  GET_CONVERSATIONS, GET_OR_CREATE_CONVERSATION,
  GET_CONVERSATION_MESSAGES, SEND_CONVERSATION_MESSAGE, MARK_CONVERSATION_READ,
  SEARCH_USERS,
} from '../Pages/Posts/BasicTextPostServerApi.js';
import './MessagesPage.css';

function timeAgo(ts) {
  if (!ts) return '';
  const diff = (Date.now() - new Date(ts)) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}

export default function MessagesPage() {
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId]   = useState(null);
  const [messages, setMessages]           = useState([]);
  const [input, setInput]                 = useState('');
  const [sending, setSending]             = useState(false);
  const [error, setError]                 = useState('');
  const [newTarget, setNewTarget]         = useState('');
  const [showNew, setShowNew]             = useState(false);
  const [suggestions, setSuggestions]     = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mobileView, setMobileView]       = useState('list'); // 'list' | 'thread'
  const bottomRef     = useRef(null);
  const pollRef       = useRef(null);
  const suggestTimer  = useRef(null);
  const navigate   = useNavigate();
  const [searchParams] = useSearchParams();
  const authUser = localStorage.getItem('userName');

  const loadConversations = useCallback(() =>
    GET_CONVERSATIONS().then(setConversations).catch(() => {}), []);

  const openConversation = useCallback(async (convId) => {
    setActiveConvId(convId);
    setMobileView('thread');
    try {
      const msgs = await GET_CONVERSATION_MESSAGES(convId, 100, 0);
      setMessages(msgs);
      await MARK_CONVERSATION_READ(convId);
      setConversations(cs => cs.map(c => c.id === convId ? { ...c, unread_count: 0 } : c));
    } catch {}
  }, []);

  // Open conversation via ?with=username query param
  useEffect(() => {
    const withUser = searchParams.get('with');
    if (!withUser) return;
    GET_OR_CREATE_CONVERSATION(withUser)
      .then(({ id }) => openConversation(id))
      .catch(() => {});
  }, [searchParams, openConversation]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Poll for new messages every 10s while a conversation is open
  useEffect(() => {
    if (!activeConvId) return;
    pollRef.current = setInterval(async () => {
      try {
        const msgs = await GET_CONVERSATION_MESSAGES(activeConvId, 100, 0);
        setMessages(msgs);
      } catch {}
      loadConversations();
    }, 10000);
    return () => clearInterval(pollRef.current);
  }, [activeConvId, loadConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || !activeConvId) return;
    setSending(true);
    setError('');
    try {
      await SEND_CONVERSATION_MESSAGE(activeConvId, input.trim());
      setInput('');
      const msgs = await GET_CONVERSATION_MESSAGES(activeConvId, 100, 0);
      setMessages(msgs);
      loadConversations();
    } catch (e) {
      setError(e.response?.data || 'Failed to send.');
    } finally {
      setSending(false);
    }
  };

  const handleNewTargetChange = (e) => {
    const val = e.target.value;
    setNewTarget(val);
    setSuggestions([]);
    clearTimeout(suggestTimer.current);
    if (!val.trim()) { setShowSuggestions(false); return; }
    suggestTimer.current = setTimeout(() => {
      SEARCH_USERS(val.trim()).then(results => {
        setSuggestions(Array.isArray(results) ? results.slice(0, 6) : []);
        setShowSuggestions(true);
      }).catch(() => {});
    }, 250);
  };

  const startNewConversation = async () => {
    if (!newTarget.trim()) return;
    setShowSuggestions(false);
    setSuggestions([]);
    setError('');
    try {
      const { id } = await GET_OR_CREATE_CONVERSATION(newTarget.trim());
      await loadConversations();
      setShowNew(false);
      setNewTarget('');
      openConversation(id);
    } catch (e) {
      setError(e.response?.data || `User "${newTarget.trim()}" not found.`);
    }
  };

  const activeConv = conversations.find(c => c.id === activeConvId);

  return (
    <div className="messages-page">
      {/* Sidebar: conversation list */}
      <div className={`messages-sidebar${mobileView === 'thread' ? ' messages-sidebar--hidden' : ''}`}>
        <div className="messages-sidebar-header">
          <span className="messages-title">Messages</span>
          <button className="messages-new-btn" onClick={() => setShowNew(s => !s)} title="New conversation">+</button>
        </div>

        {showNew && (
          <div className="messages-new-form">
            <div className="messages-new-input-wrapper">
              <input
                placeholder="Username…"
                value={newTarget}
                onChange={handleNewTargetChange}
                onKeyDown={e => {
                  if (e.key === 'Enter') startNewConversation();
                  if (e.key === 'Escape') { setShowSuggestions(false); setSuggestions([]); }
                }}
                onBlur={() => setTimeout(() => { setShowSuggestions(false); }, 150)}
                autoFocus
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="messages-suggestions">
                  {suggestions.map(u => (
                    <button
                      key={u}
                      className="messages-suggestion-item"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => { setNewTarget(u); setSuggestions([]); setShowSuggestions(false); }}
                    >{u}</button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={startNewConversation}>Start</button>
          </div>
        )}

        {conversations.length === 0
          ? <p className="messages-empty">No conversations yet.</p>
          : conversations.map(c => (
            <button
              key={c.id}
              className={`messages-conv-item${c.id === activeConvId ? ' messages-conv-item--active' : ''}`}
              onClick={() => openConversation(c.id)}
            >
              <div className="messages-conv-name">
                {c.other_username}
                {c.unread_count > 0 && <span className="messages-badge">{c.unread_count}</span>}
              </div>
              <div className="messages-conv-preview">{c.last_message || 'No messages yet'}</div>
              <div className="messages-conv-time">{timeAgo(c.last_message_at)}</div>
            </button>
          ))
        }
      </div>

      {/* Thread view */}
      <div className={`messages-thread${mobileView === 'list' ? ' messages-thread--hidden' : ''}`}>
        {!activeConvId ? (
          <div className="messages-thread-empty">Select a conversation or start a new one.</div>
        ) : (
          <>
            <div className="messages-thread-header">
              <button className="messages-back-btn" onClick={() => setMobileView('list')}>←</button>
              <button
                className="messages-thread-title"
                onClick={() => activeConv && navigate(`/users/${activeConv.other_username}`)}
              >
                {activeConv?.other_username}
              </button>
            </div>

            <div className="messages-thread-body">
              {messages.map(m => (
                <div
                  key={m.id}
                  className={`messages-bubble${m.sender_username === authUser ? ' messages-bubble--mine' : ''}`}
                >
                  <span className="messages-bubble-text">{m.content}</span>
                  <span className="messages-bubble-time">{timeAgo(m.created_at)}</span>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="messages-compose">
              <textarea
                className="messages-input"
                placeholder="Write a message…"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                maxLength={5000}
                rows={2}
              />
              <button className="messages-send-btn" onClick={sendMessage} disabled={sending || !input.trim()}>
                {sending ? '…' : 'Send'}
              </button>
            </div>
            {error && <p className="messages-error">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
