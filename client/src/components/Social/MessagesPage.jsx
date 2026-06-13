import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  GET_CONVERSATIONS, GET_OR_CREATE_CONVERSATION,
  GET_CONVERSATION_MESSAGES, SEND_CONVERSATION_MESSAGE, MARK_CONVERSATION_READ,
  TOGGLE_DM_REACTION, GET_CONV_REACTIONS,
  GET_GROUPS, CREATE_GROUP, GET_GROUP_MESSAGES, SEND_GROUP_MESSAGE, MARK_GROUP_READ,
  GET_GROUP_MEMBERS, ADD_GROUP_MEMBER, REMOVE_GROUP_MEMBER, RENAME_GROUP,
  TOGGLE_GROUP_REACTION, GET_GROUP_REACTIONS, TRANSFER_GROUP_OWNERSHIP,
  SEARCH_USERS,
} from '../Pages/Posts/BasicTextPostServerApi.js';
import { linkifyText } from '../../utils/linkifyText.jsx';
import { IMAGES_BASE_URL } from '../../config.js';
import './MessagesPage.css';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉'];

function timeAgo(ts) {
  if (!ts) return '';
  const diff = (Date.now() - new Date(ts)) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function truncate(text, n = 80) {
  if (!text) return '';
  return text.length > n ? text.slice(0, n) + '…' : text;
}

export default function MessagesPage() {
  const [conversations, setConversations] = useState([]);
  const [groups, setGroups]               = useState([]);
  const [activeConvId, setActiveConvId]   = useState(null);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [messages, setMessages]           = useState([]);
  const [input, setInput]                 = useState('');
  const [sending, setSending]             = useState(false);
  const [error, setError]                 = useState('');
  const [newTarget, setNewTarget]         = useState('');
  const [showNew, setShowNew]             = useState(false);
  const [showNewGroup, setShowNewGroup]   = useState(false);
  const [groupName, setGroupName]         = useState('');
  const [groupMembers, setGroupMembers]   = useState('');
  const [suggestions, setSuggestions]     = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mobileView, setMobileView]       = useState('list');
  const [replyTo, setReplyTo]             = useState(null);
  const [hoveredMsg, setHoveredMsg]       = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(null); // msgId
  const [dmReactions, setDmReactions]     = useState({}); // { [msgId]: { counts, userReactions } }
  const [groupReactions, setGroupReactions] = useState({}); // { [msgId]: { counts, userReactions } }
  const [transferTarget, setTransferTarget] = useState(null); // username to confirm ownership transfer to
  const [groupMembersInfo, setGroupMembersInfo] = useState([]);
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [addMemberInput, setAddMemberInput] = useState('');
  const [addMemberSuggestions, setAddMemberSuggestions] = useState([]);
  const [showAddMemberSuggestions, setShowAddMemberSuggestions] = useState(false);
  const [groupMembersSuggestions, setGroupMembersSuggestions] = useState([]);
  const [showGroupMembersSuggestions, setShowGroupMembersSuggestions] = useState(false);
  const [editingGroupName, setEditingGroupName] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const addMemberTimer = useRef(null);
  const groupMembersTimer = useRef(null);

  const bottomRef    = useRef(null);
  const pollRef      = useRef(null);
  const suggestTimer = useRef(null);
  const inputRef     = useRef(null);
  const navigate     = useNavigate();
  const [searchParams] = useSearchParams();
  const authUser = localStorage.getItem('userName');

  const isGroup = activeGroupId !== null;

  // ── Load conversation lists ───────────────────────────────────────────────

  const loadConversations = useCallback(() =>
    GET_CONVERSATIONS().then(setConversations).catch(() => {}), []);

  const loadGroups = useCallback(() =>
    GET_GROUPS().then(setGroups).catch(() => {}), []);

  const loadAll = useCallback(() => {
    loadConversations();
    loadGroups();
  }, [loadConversations, loadGroups]);

  // ── Open DM ───────────────────────────────────────────────────────────────

  const openConversation = useCallback(async (convId) => {
    setActiveConvId(convId);
    setActiveGroupId(null);
    setMobileView('thread');
    setShowMembersPanel(false);
    try {
      const [msgs] = await Promise.all([
        GET_CONVERSATION_MESSAGES(convId, 100, 0),
        MARK_CONVERSATION_READ(convId).catch(() => {}),
      ]);
      setMessages(msgs);
      setConversations(cs => cs.map(c => c.id === convId ? { ...c, unread_count: 0 } : c));
      // Load reactions
      GET_CONV_REACTIONS(convId).then(r => setDmReactions(r)).catch(() => {});
    } catch {}
  }, []);

  // ── Open Group ────────────────────────────────────────────────────────────

  const openGroup = useCallback(async (groupId) => {
    setActiveGroupId(groupId);
    setActiveConvId(null);
    setMobileView('thread');
    setShowMembersPanel(false);
    setGroupReactions({});
    try {
      const [msgs] = await Promise.all([
        GET_GROUP_MESSAGES(groupId, 100, 0),
        MARK_GROUP_READ(groupId).catch(() => {}),
      ]);
      setMessages(msgs);
      setGroups(gs => gs.map(g => g.id === groupId ? { ...g, unread_count: 0 } : g));
      GET_GROUP_MEMBERS(groupId).then(setGroupMembersInfo).catch(() => {});
      GET_GROUP_REACTIONS(groupId).then(r => setGroupReactions(r)).catch(() => {});
    } catch {}
  }, []);

  // ── ?with= query param ────────────────────────────────────────────────────

  useEffect(() => {
    const withUser = searchParams.get('with');
    if (!withUser) return;
    GET_OR_CREATE_CONVERSATION(withUser)
      .then(({ id }) => openConversation(id))
      .catch(() => {});
  }, [searchParams, openConversation]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Polling ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!activeConvId && !activeGroupId) return;
    pollRef.current = setInterval(async () => {
      try {
        if (activeConvId) {
          const msgs = await GET_CONVERSATION_MESSAGES(activeConvId, 100, 0);
          setMessages(msgs);
          GET_CONV_REACTIONS(activeConvId).then(r => setDmReactions(r)).catch(() => {});
        } else if (activeGroupId) {
          const msgs = await GET_GROUP_MESSAGES(activeGroupId, 100, 0);
          setMessages(msgs);
          GET_GROUP_REACTIONS(activeGroupId).then(r => setGroupReactions(r)).catch(() => {});
        }
      } catch {}
      loadAll();
    }, 10000);
    return () => clearInterval(pollRef.current);
  }, [activeConvId, activeGroupId, loadAll]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Send message ──────────────────────────────────────────────────────────

  const sendMessage = async () => {
    if (!input.trim() || (!activeConvId && !activeGroupId)) return;
    setSending(true);
    setError('');
    let content = input.trim();
    if (replyTo) {
      content = `> @${replyTo.sender_username}: ${truncate(replyTo.content, 100)}\n\n${content}`;
    }
    try {
      if (activeConvId) {
        await SEND_CONVERSATION_MESSAGE(activeConvId, content);
        const msgs = await GET_CONVERSATION_MESSAGES(activeConvId, 100, 0);
        setMessages(msgs);
      } else {
        await SEND_GROUP_MESSAGE(activeGroupId, content);
        const msgs = await GET_GROUP_MESSAGES(activeGroupId, 100, 0);
        setMessages(msgs);
      }
      setInput('');
      setReplyTo(null);
      loadAll();
    } catch (e) {
      setError(e.response?.data || 'Failed to send.');
    } finally {
      setSending(false);
    }
  };

  const startReply = (msg) => { setReplyTo(msg); inputRef.current?.focus(); };

  // ── DM reactions ─────────────────────────────────────────────────────────

  const toggleReaction = async (msgId, emoji) => {
    setShowEmojiPicker(null);
    try {
      if (isGroup) {
        await TOGGLE_GROUP_REACTION(activeGroupId, msgId, emoji);
        GET_GROUP_REACTIONS(activeGroupId).then(r => setGroupReactions(r)).catch(() => {});
      } else {
        await TOGGLE_DM_REACTION(activeConvId, msgId, emoji);
        GET_CONV_REACTIONS(activeConvId).then(r => setDmReactions(r)).catch(() => {});
      }
    } catch {}
  };

  const confirmTransferOwnership = async () => {
    if (!transferTarget || !activeGroupId) return;
    try {
      await TRANSFER_GROUP_OWNERSHIP(activeGroupId, transferTarget);
      setTransferTarget(null);
      GET_GROUP_MEMBERS(activeGroupId).then(setGroupMembersInfo).catch(() => {});
    } catch (e) {
      setError(e.response?.data || 'Could not transfer ownership.');
      setTransferTarget(null);
    }
  };

  // ── New DM ────────────────────────────────────────────────────────────────

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
      await loadAll();
      setShowNew(false);
      setNewTarget('');
      openConversation(id);
    } catch (e) {
      setError(e.response?.data || `User "${newTarget.trim()}" not found.`);
    }
  };

  // ── New Group ─────────────────────────────────────────────────────────────

  const createGroup = async () => {
    const name = groupName.trim() || 'Group';
    const members = groupMembers.split(',').map(m => m.trim()).filter(Boolean);
    try {
      const { id } = await CREATE_GROUP(name, members);
      await loadAll();
      setShowNewGroup(false);
      setGroupName('');
      setGroupMembers('');
      openGroup(id);
    } catch (e) {
      setError(e.response?.data || 'Failed to create group.');
    }
  };

  // ── Group member management ───────────────────────────────────────────────

  const handleAddMemberInputChange = (e) => {
    const val = e.target.value;
    setAddMemberInput(val);
    clearTimeout(addMemberTimer.current);
    if (!val.trim()) { setShowAddMemberSuggestions(false); setAddMemberSuggestions([]); return; }
    addMemberTimer.current = setTimeout(() => {
      SEARCH_USERS(val.trim()).then(r => {
        setAddMemberSuggestions(Array.isArray(r) ? r.slice(0, 6) : []);
        setShowAddMemberSuggestions(true);
      }).catch(() => {});
    }, 220);
  };

  const handleGroupMembersInputChange = (e) => {
    const val = e.target.value;
    setGroupMembers(val);
    const lastPart = val.split(',').pop().trim();
    clearTimeout(groupMembersTimer.current);
    if (!lastPart) { setShowGroupMembersSuggestions(false); setGroupMembersSuggestions([]); return; }
    groupMembersTimer.current = setTimeout(() => {
      SEARCH_USERS(lastPart).then(r => {
        setGroupMembersSuggestions(Array.isArray(r) ? r.slice(0, 5) : []);
        setShowGroupMembersSuggestions(true);
      }).catch(() => {});
    }, 220);
  };

  const addMember = async (username) => {
    const name = username || addMemberInput.trim();
    if (!name || !activeGroupId) return;
    setShowAddMemberSuggestions(false);
    setAddMemberSuggestions([]);
    try {
      await ADD_GROUP_MEMBER(activeGroupId, name);
      setAddMemberInput('');
      GET_GROUP_MEMBERS(activeGroupId).then(setGroupMembersInfo).catch(() => {});
    } catch (e) {
      setError(e.response?.data || 'Could not add member.');
    }
  };

  const removeMember = async (username) => {
    if (!activeGroupId) return;
    try {
      await REMOVE_GROUP_MEMBER(activeGroupId, username);
      GET_GROUP_MEMBERS(activeGroupId).then(setGroupMembersInfo).catch(() => {});
      if (username === authUser) { setActiveGroupId(null); loadAll(); }
    } catch (e) {
      setError(e.response?.data || 'Could not remove member.');
    }
  };

  const saveGroupName = async () => {
    if (!activeGroupId || !groupNameDraft.trim()) return;
    try {
      await RENAME_GROUP(activeGroupId, groupNameDraft.trim());
      setEditingGroupName(false);
      loadGroups();
    } catch {}
  };

  // ── Computed ──────────────────────────────────────────────────────────────

  const activeConv  = conversations.find(c => c.id === activeConvId);
  const activeGroup = groups.find(g => g.id === activeGroupId);

  function parseMessage(content) {
    if (!content) return { quote: null, body: content };
    const lines = content.split('\n');
    const quoteLines = [];
    let i = 0;
    while (i < lines.length && lines[i].startsWith('> ')) {
      quoteLines.push(lines[i].slice(2));
      i++;
    }
    if (i < lines.length && lines[i].trim() === '') i++;
    const body = lines.slice(i).join('\n');
    return { quote: quoteLines.length ? quoteLines.join('\n') : null, body };
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="messages-page">
      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <div className={`messages-sidebar${mobileView === 'thread' ? ' messages-sidebar--hidden' : ''}`}>
        <div className="messages-sidebar-header">
          <span className="messages-title">Messages</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="messages-new-btn" onClick={() => { setShowNew(s => !s); setShowNewGroup(false); }} title="New DM">+</button>
            <button className="messages-new-btn" onClick={() => { setShowNewGroup(s => !s); setShowNew(false); }} title="New group" style={{ fontSize: 13, borderRadius: 6, width: 'auto', padding: '0 7px' }}>Group</button>
          </div>
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
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                autoFocus
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="messages-suggestions">
                  {suggestions.map(u => (
                    <button key={u} className="messages-suggestion-item"
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

        {showNewGroup && (
          <div className="messages-new-form" style={{ flexDirection: 'column', gap: 6 }}>
            <input placeholder="Group name…" value={groupName} onChange={e => setGroupName(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
            <div className="messages-new-input-wrapper">
              <input
                placeholder="Members (comma-separated)…"
                value={groupMembers}
                onChange={handleGroupMembersInputChange}
                onBlur={() => setTimeout(() => setShowGroupMembersSuggestions(false), 150)}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
              {showGroupMembersSuggestions && groupMembersSuggestions.length > 0 && (
                <div className="messages-suggestions">
                  {groupMembersSuggestions.map(u => (
                    <button key={u} className="messages-suggestion-item"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => {
                        const parts = groupMembers.split(',');
                        parts[parts.length - 1] = u;
                        setGroupMembers(parts.join(', ') + ', ');
                        setShowGroupMembersSuggestions(false);
                      }}>{u}</button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={createGroup} style={{ alignSelf: 'flex-end' }}>Create</button>
          </div>
        )}

        {/* DM conversations */}
        {conversations.length > 0 && (
          <div className="messages-conv-section-label">Direct</div>
        )}
        {conversations.map(c => (
          <button key={c.id}
            className={`messages-conv-item${c.id === activeConvId ? ' messages-conv-item--active' : ''}`}
            onClick={() => openConversation(c.id)}
          >
            <div className="messages-conv-avatar">
              {c.other_avatar
                ? <img src={IMAGES_BASE_URL + c.other_avatar} alt={c.other_username} className="messages-conv-avatar-img" />
                : <span className="messages-conv-avatar-fallback">{c.other_username?.[0]?.toUpperCase()}</span>
              }
            </div>
            <div className="messages-conv-info">
              <div className="messages-conv-name">
                {c.other_username}
                {c.unread_count > 0 && <span className="messages-badge">{c.unread_count}</span>}
              </div>
              <div className="messages-conv-preview">{c.last_message || 'No messages yet'}</div>
            </div>
            <div className="messages-conv-time">{timeAgo(c.last_message_at)}</div>
          </button>
        ))}

        {/* Group conversations */}
        {groups.length > 0 && (
          <div className="messages-conv-section-label">Groups</div>
        )}
        {groups.map(g => (
          <button key={`g:${g.id}`}
            className={`messages-conv-item${g.id === activeGroupId ? ' messages-conv-item--active' : ''}`}
            onClick={() => openGroup(g.id)}
          >
            <div className="messages-conv-name">
              <span className="messages-group-icon">⬡</span>
              {g.name}
              {g.unread_count > 0 && <span className="messages-badge">{g.unread_count}</span>}
            </div>
            <div className="messages-conv-preview">{g.last_message || 'No messages yet'}</div>
            <div className="messages-conv-time">{timeAgo(g.last_message_at)}</div>
          </button>
        ))}

        {conversations.length === 0 && groups.length === 0 && (
          <p className="messages-empty">No conversations yet.</p>
        )}
      </div>

      {/* ── Thread view ────────────────────────────────────────────────── */}
      <div className={`messages-thread${mobileView === 'list' ? ' messages-thread--hidden' : ''}`}>
        {(!activeConvId && !activeGroupId) ? (
          <div className="messages-thread-empty">Select a conversation or start a new one.</div>
        ) : (
          <>
            <div className="messages-thread-header">
              <button className="messages-back-btn" onClick={() => setMobileView('list')}>←</button>
              {isGroup ? (
                editingGroupName ? (
                  <div style={{ display: 'flex', gap: 6, flex: 1, alignItems: 'center' }}>
                    <input className="messages-group-name-edit" value={groupNameDraft}
                      onChange={e => setGroupNameDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveGroupName(); if (e.key === 'Escape') setEditingGroupName(false); }}
                      autoFocus />
                    <button onClick={saveGroupName} style={{ fontSize: 12 }}>Save</button>
                    <button onClick={() => setEditingGroupName(false)} style={{ fontSize: 12 }}>✕</button>
                  </div>
                ) : (
                  <button className="messages-thread-title" onDoubleClick={() => { setGroupNameDraft(activeGroup?.name || ''); setEditingGroupName(true); }}>
                    ⬡ {activeGroup?.name}
                  </button>
                )
              ) : (
                <button className="messages-thread-title"
                  onClick={() => activeConv && navigate(`/users/${activeConv.other_username}`)}>
                  {activeConv?.other_username}
                </button>
              )}
              {isGroup && (
                <button className="messages-members-btn"
                  onClick={() => setShowMembersPanel(s => !s)}
                  title="Members">
                  👥 {groupMembersInfo.length}
                </button>
              )}
            </div>

            {/* Group members panel */}
            {isGroup && showMembersPanel && (
              <div className="messages-members-panel">
                <div className="messages-members-panel-title">Members</div>
                {groupMembersInfo.map(m => {
                  const isSelf = m.username === authUser;
                  const iAmOwner = groupMembersInfo.find(x => x.username === authUser)?.is_admin;
                  const isOwner = m.is_admin;
                  return (
                    <div key={m.username} className="messages-member-row">
                      <span className="messages-member-name">
                        {m.username}
                        {isOwner && <span className="messages-owner-badge">owner</span>}
                      </span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {iAmOwner && !isSelf && !isOwner && (
                          <button className="messages-member-transfer"
                            onClick={() => setTransferTarget(m.username)}
                            title="Transfer ownership">
                            ⇌
                          </button>
                        )}
                        {(isSelf && !isOwner) && (
                          <button className="messages-member-remove"
                            onClick={() => removeMember(m.username)}>
                            Leave
                          </button>
                        )}
                        {!isSelf && iAmOwner && !isOwner && (
                          <button className="messages-member-remove"
                            onClick={() => removeMember(m.username)}>
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {groupMembersInfo.find(m => m.username === authUser)?.is_admin && (
                  <div style={{ position: 'relative', marginTop: 6 }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input className="messages-member-add-input" placeholder="Add username…"
                        value={addMemberInput}
                        onChange={handleAddMemberInputChange}
                        onBlur={() => setTimeout(() => setShowAddMemberSuggestions(false), 150)}
                        onKeyDown={e => e.key === 'Enter' && addMember()} />
                      <button onClick={() => addMember()} style={{ fontSize: 12, padding: '4px 10px' }}>Add</button>
                    </div>
                    {showAddMemberSuggestions && addMemberSuggestions.length > 0 && (
                      <div className="messages-suggestions" style={{ top: '100%', position: 'absolute', width: '100%', zIndex: 50 }}>
                        {addMemberSuggestions.map(u => (
                          <button key={u} className="messages-suggestion-item"
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => addMember(u)}>{u}</button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="messages-thread-body" onClick={() => setShowEmojiPicker(null)}>
              {messages.map(m => {
                const isMine = m.sender_username === authUser;
                const { quote, body } = parseMessage(m.content);
                const reactionMap = isGroup ? groupReactions : dmReactions;
                const msgReactions = reactionMap[m.id] || { counts: {}, userReactions: [] };
                const hasReactions = Object.keys(msgReactions.counts).length > 0;
                return (
                  <div key={m.id}
                    className={`messages-bubble-wrap${isMine ? ' messages-bubble-wrap--mine' : ''}`}
                    onMouseEnter={() => setHoveredMsg(m.id)}
                    onMouseLeave={() => { setHoveredMsg(null); }}
                  >
                    {hoveredMsg === m.id && (
                      <div className={`messages-actions${isMine ? ' messages-actions--mine' : ''}`}>
                        <button className="messages-reply-btn" onClick={() => startReply(m)} title="Reply">↩</button>
                        <button className="messages-reply-btn" title="React"
                          onClick={e => { e.stopPropagation(); setShowEmojiPicker(p => p === m.id ? null : m.id); }}>
                          😊
                        </button>
                      </div>
                    )}
                    {showEmojiPicker === m.id && (
                      <div className={`messages-emoji-picker${isMine ? ' messages-emoji-picker--mine' : ''}`}
                        onClick={e => e.stopPropagation()}>
                        {REACTION_EMOJIS.map(e => (
                          <button key={e} className="messages-emoji-btn"
                            onClick={() => toggleReaction(m.id, e)}>{e}</button>
                        ))}
                      </div>
                    )}
                    {isGroup && !isMine && (
                      <div className="messages-group-sender-row">
                        <div className="messages-group-sender-avatar">
                          {m.avatar_path
                            ? <img src={IMAGES_BASE_URL + m.avatar_path} alt={m.sender_username} className="messages-group-sender-avatar-img" />
                            : <span>{m.sender_username?.[0]?.toUpperCase()}</span>
                          }
                        </div>
                        <span className="messages-sender-name">{m.sender_username}</span>
                      </div>
                    )}
                    <div className={`messages-bubble${isMine ? ' messages-bubble--mine' : ''}`}>
                      {quote && <div className="messages-bubble-quote">{quote}</div>}
                      <span className={`messages-bubble-text${quote ? ' messages-bubble-text--has-quote' : ''}`}>{linkifyText(body || m.content)}</span>
                      <span className="messages-bubble-time">{timeAgo(m.created_at)}</span>
                      {hasReactions && (
                        <div className="messages-reaction-chips">
                          {Object.entries(msgReactions.counts).map(([emoji, count]) => (
                            <button key={emoji}
                              className={`messages-reaction-chip${msgReactions.userReactions.includes(emoji) ? ' messages-reaction-chip--active' : ''}`}
                              onClick={() => toggleReaction(m.id, emoji)}>
                              {emoji} <span>{count}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {replyTo && (
              <div className="messages-reply-preview">
                <div className="messages-reply-preview-inner">
                  <span className="messages-reply-preview-label">↩ Replying to @{replyTo.sender_username}</span>
                  <span className="messages-reply-preview-text">{truncate(replyTo.content, 60)}</span>
                </div>
                <button className="messages-reply-preview-dismiss" onClick={() => setReplyTo(null)}>✕</button>
              </div>
            )}

            <div className="messages-compose">
              <textarea ref={inputRef} className="messages-input"
                placeholder={replyTo ? `Reply to @${replyTo.sender_username}…` : (isGroup ? `Message ${activeGroup?.name}…` : 'Write a message…')}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                maxLength={5000} rows={2} />
              <button className="messages-send-btn" onClick={sendMessage} disabled={sending || !input.trim()}>
                {sending ? '…' : 'Send'}
              </button>
            </div>
            {error && <p className="messages-error">{error}</p>}
          </>
        )}
      </div>

      {/* ── Ownership transfer confirmation dialog ──────────────────────── */}
      {transferTarget && (
        <div className="messages-dialog-backdrop" onClick={() => setTransferTarget(null)}>
          <div className="messages-dialog" onClick={e => e.stopPropagation()}>
            <div className="messages-dialog-title">Transfer ownership?</div>
            <p className="messages-dialog-body">
              Transfer group ownership to <strong>{transferTarget}</strong>?
              You will remain a member but will no longer be the owner.
            </p>
            <div className="messages-dialog-actions">
              <button className="messages-dialog-cancel" onClick={() => setTransferTarget(null)}>Cancel</button>
              <button className="messages-dialog-confirm" onClick={confirmTransferOwnership}>Transfer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
