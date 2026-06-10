import { useState, useEffect, useRef, useCallback, React} from 'react';
import {AUTHORIZE_SESSION, READ_POSTS_BY_USER, GET_USER_BACKGROUND, UPDATE_USER_BACKGROUND, GET_USER_BIO, UPDATE_USER_BIO, GET_USER_BIO_LINKS, UPDATE_USER_BIO_LINKS, GET_USER_STORAGE, SEND_MESSAGE, GET_FOLLOWERS, GET_FOLLOWING, GET_BLOCK_MESSAGE_STATUS, BLOCK_MESSAGES, UNBLOCK_MESSAGES, EXPORT_MY_DATA, GET_PINNED_POST} from '../BasicTextPostServerApi.js'
import BasicTextPost from '../PostRenderer/BasicTextPost/BasicTextPost.jsx';
import PatternPicker from '../../../PatternPicker/PatternPicker.jsx';
import FollowButton from '../../../Social/FollowButton.jsx';
import FollowListModal from '../../../Social/FollowListModal.jsx';
import { patternToStyle } from '../../../PatternPicker/patterns.js';
import '../PostWindow.css';
import {useParams, Link, useNavigate} from "react-router-dom";

function Heading(props) {
 if (props.username != null && props.username != "") {
  return (<h1 className="windowHeader">{props.username}</h1>);
 } else {
  return (<h1 className="windowHeader">Invalid username in URL: "{props.username}"</h1>);
 }
}

function fmtBytes(n) {
  if (!n || n === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0, v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

function StorageBar({ storage }) {
  const uploadLimit = Number(storage.maxStorageBytes ?? -1);
  const uploadUsed = Number(storage.uploadBytes ?? 0);
  const pct = uploadLimit > 0 ? Math.min(100, (uploadUsed / uploadLimit) * 100) : null;
  return (
    <div style={{ marginTop: '12px', fontSize: '12px', color: '#555', textAlign: 'left' }}>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: pct !== null ? '6px' : 0 }}>
        <span>Uploads: <strong>{fmtBytes(uploadUsed)}</strong>{uploadLimit > 0 ? ` / ${fmtBytes(uploadLimit)}` : ''}</span>
        <span>Post text: <strong>{fmtBytes(Number(storage.postTextBytes ?? 0))}</strong></span>
        <span>Posts: <strong>{storage.postCount ?? 0}</strong></span>
        {storage.commentBytes > 0 && <span>Comments: <strong>{fmtBytes(Number(storage.commentBytes ?? 0))}</strong></span>}
        {storage.notificationBytes > 0 && <span>Inbox: <strong>{fmtBytes(Number(storage.notificationBytes ?? 0))}</strong></span>}
        {storage.presetsBytes > 0 && <span>Presets: <strong>{fmtBytes(Number(storage.presetsBytes ?? 0))}</strong></span>}
      </div>
      {pct !== null && (
        <div style={{ height: '4px', borderRadius: '2px', background: '#e0e0e0', overflow: 'hidden', maxWidth: '320px', margin: '0 auto' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: pct > 85 ? '#d32f2f' : '#1a73e8', borderRadius: '2px', transition: 'width 0.3s' }} />
        </div>
      )}
    </div>
  );
}

const URL_REGEX = /https?:\/\/[^\s<>"]+[^\s<>".,;:!?)/]/g;

function confirmExternal(e, url) {
  try {
    if (new URL(url).origin === window.location.origin) return;
  } catch { return; }
  e.preventDefault();
  if (window.confirm(`You are leaving this site.\n\n${url}\n\nContinue?`)) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

function BioText({ text }) {
  if (!text) return null;
  const parts = [];
  let last = 0;
  let match;
  const re = new RegExp(URL_REGEX.source, 'g');
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const url = match[0];
    parts.push(
      <a key={match.index} href={url} target="_blank" rel="noopener noreferrer"
        style={{ color: '#1a73e8' }}
        onClick={e => confirmExternal(e, url)}>{url}</a>
    );
    last = match.index + url.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <p style={{ margin: '0', fontSize: '14px', color: '#111', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{parts}</p>;
}

function hasModifyPermissions(viewedUser) {
  const username = localStorage.getItem("userName");
  if (username != viewedUser) {return false;}
  return (username != null && username != "" && AUTHORIZE_SESSION());
}


// Loads a view of title cards for all posts by the user specified in the url
function PostsViewer() {
    const [postsArray, setPostsArray] = useState([]);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const offsetRef = useRef(0);
    const PAGE_SIZE = 20;
    const [bgPattern, setBgPattern] = useState('');
    const [showBgPicker, setShowBgPicker] = useState(false);
    const [bgSaveError, setBgSaveError] = useState('');
    const [bio, setBio] = useState('');
    const [editingBio, setEditingBio] = useState(false);
    const [bioInput, setBioInput] = useState('');
    const [bioError, setBioError] = useState('');
    const [bioLinks, setBioLinks] = useState([]);
    const [editingLinks, setEditingLinks] = useState(false);
    const [linksInput, setLinksInput] = useState([{ label: '', url: '' }, { label: '', url: '' }, { label: '', url: '' }]);
    const [linksError, setLinksError] = useState('');
    const [storage, setStorage] = useState(null);
    const [showMessageForm, setShowMessageForm] = useState(false);
    const [messageText, setMessageText] = useState('');
    const [followModal, setFollowModal] = useState(null); // 'followers' | 'following' | null
    const [followList, setFollowList] = useState([]);
    const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
    const [dmBlocked, setDmBlocked] = useState(false);
    const [dmBlockedByThem, setDmBlockedByThem] = useState(false);
    const [followsMe, setFollowsMe] = useState(false);
    const [pinnedPost, setPinnedPost] = useState(null);
    const bgPickerRef = useRef(null);
    const sentinelRef = useRef(null);
    const { username } = useParams();
    const navigate = useNavigate();
    const canEdit = hasModifyPermissions(username);
    const loggedIn = !!localStorage.getItem('userName');

    const loadPosts = useCallback((reset = false) => {
      const offset = reset ? 0 : offsetRef.current;
      setLoadingMore(true);
      READ_POSTS_BY_USER(username, PAGE_SIZE, offset).then(data => {
        const page = Array.isArray(data) ? data : [];
        setPostsArray(prev => reset ? page : [...prev, ...page]);
        offsetRef.current = offset + page.length;
        setHasMore(page.length === PAGE_SIZE);
        setLoadingMore(false);
      }).catch(() => setLoadingMore(false));
    }, [username]);

    useEffect(() => {
      setPostsArray([]);
      offsetRef.current = 0;
      setHasMore(true);
      loadPosts(true);
      GET_USER_BACKGROUND(username).then(p => setBgPattern(p || '')).catch(() => {});
      GET_USER_BIO(username).then(b => setBio(b || '')).catch(() => {});
      GET_USER_BIO_LINKS(username).then(d => {
        const links = Array.isArray(d) ? d : (typeof d === 'string' ? JSON.parse(d) : []);
        setBioLinks(links);
      }).catch(() => {});
      if (loggedIn) GET_USER_STORAGE(username).then(setStorage).catch(() => {});
      const me = localStorage.getItem('userName');
      Promise.all([GET_FOLLOWERS(username), GET_FOLLOWING(username)])
        .then(([followers, following]) => {
          setFollowCounts({ followers: followers.length, following: following.length });
          if (me && !canEdit) setFollowsMe(following.includes(me));
        })
        .catch(() => {});
      if (loggedIn && !canEdit) {
        GET_BLOCK_MESSAGE_STATUS(username).then(d => {
          setDmBlocked(d.blocked);
          setDmBlockedByThem(d.blockedByThem ?? false);
        }).catch(() => {});
      }
      GET_PINNED_POST(username).then(setPinnedPost).catch(() => setPinnedPost(null));
    }, [username]);

    // IntersectionObserver for infinite scroll
    useEffect(() => {
      if (!sentinelRef.current) return;
      const observer = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadPosts(false);
        }
      }, { rootMargin: '200px' });
      observer.observe(sentinelRef.current);
      return () => observer.disconnect();
    }, [hasMore, loadingMore, loadPosts]);

    // Close wallpaper picker when clicking outside
    useEffect(() => {
      if (!showBgPicker) return;
      const handleOutside = (e) => {
        if (bgPickerRef.current && !bgPickerRef.current.contains(e.target)) setShowBgPicker(false);
      };
      document.addEventListener('mousedown', handleOutside);
      return () => document.removeEventListener('mousedown', handleOutside);
    }, [showBgPicker]);

    // Apply profile page background to body
    useEffect(() => {
      const style = patternToStyle(bgPattern);
      document.body.style.backgroundImage = style.backgroundImage || '';
      document.body.style.backgroundSize = style.backgroundSize || 'auto';
      document.body.style.backgroundPosition = style.backgroundPosition || 'initial';
      document.documentElement.style.backgroundColor = style._bgColor || '';
      return () => {
        document.body.style.backgroundImage = '';
        document.body.style.backgroundSize = '';
        document.body.style.backgroundPosition = '';
        document.documentElement.style.backgroundColor = '';
      };
    }, [bgPattern]);

    async function openFollowModal(type) {
      try {
        const list = type === 'followers' ? await GET_FOLLOWERS(username) : await GET_FOLLOWING(username);
        setFollowList(list);
        setFollowModal(type);
      } catch { setFollowList([]); setFollowModal(type); }
    }

    function handleBgChange(pattern) {
      setBgPattern(pattern);
      setBgSaveError('');
      UPDATE_USER_BACKGROUND(username, pattern).catch(err => {
        const msg = err?.response?.data || err?.message || 'Unknown error';
        setBgSaveError(`Wallpaper save failed: ${msg}`);
        console.error('Failed to save background:', err);
      });
    }

    async function sendMessage() {
      const text = messageText.trim();
      if (!text) return;
      try {
        await SEND_MESSAGE(username, text);
        setMessageText('');
        setShowMessageForm(false);
      } catch { alert('Failed to send message.'); }
    }

    function saveLinks() {
      setLinksError('');
      const filtered = linksInput.filter(l => l.url.trim());
      for (const l of filtered) {
        if (!l.url.startsWith('http://') && !l.url.startsWith('https://')) {
          setLinksError('URLs must start with http:// or https://');
          return;
        }
      }
      UPDATE_USER_BIO_LINKS(username, filtered)
        .then(() => { setBioLinks(filtered); setEditingLinks(false); })
        .catch(err => setLinksError(err?.response?.data || 'Failed to save links.'));
    }

    function saveBio() {
      const trimmed = bioInput.trim();
      setBioError('');
      UPDATE_USER_BIO(username, trimmed)
        .then(() => { setBio(trimmed); setEditingBio(false); })
        .catch(err => setBioError(err?.response?.data || 'Failed to save bio. Try again.'));
    }

    const visiblePosts = postsArray;
    const [collapsedFolders, setCollapsedFolders] = useState(new Set());

    const nonPinnedPosts = visiblePosts.filter(p => !pinnedPost || p.id !== pinnedPost.id);
    const ungroupedPosts = nonPinnedPosts.filter(p => !p.folder);
    const folderMap = {};
    for (const p of nonPinnedPosts) {
      if (p.folder) {
        if (!folderMap[p.folder]) folderMap[p.folder] = [];
        folderMap[p.folder].push(p);
      }
    }
    const folderNames = Object.keys(folderMap).sort();

    function toggleFolder(name) {
      setCollapsedFolders(prev => {
        const next = new Set(prev);
        if (next.has(name)) next.delete(name); else next.add(name);
        return next;
      });
    }

    return (
      <div className="window" style={{ minHeight: '100vh' }}>
        {followModal && (
          <FollowListModal
            title={followModal === 'followers' ? `Followers` : `Following`}
            users={followList}
            onClose={() => setFollowModal(null)}
          />
        )}
        <div className="postsViewerContainer">
          <div className="profile-header-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <Heading username={username}/>
              <FollowButton username={username} onFollowChange={delta => setFollowCounts(c => ({ ...c, followers: c.followers + delta }))} />
              {followsMe && <span style={{ fontSize: '12px', color: '#333', fontStyle: 'italic' }}>follows you</span>}
            </div>

            {/* Bio display / edit form */}
            {editingBio ? (
              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <textarea
                  value={bioInput}
                  onChange={e => setBioInput(e.target.value)}
                  maxLength={500}
                  rows={3}
                  style={{ width: '100%', maxWidth: '480px', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', fontFamily: 'inherit', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box' }}
                  placeholder="Write a short bio..."
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" onClick={saveBio}>Save</button>
                  <button type="button" onClick={() => { setEditingBio(false); setBioError(''); }}>Cancel</button>
                </div>
                {bioError && <p style={{ margin: '4px 0 0', color: '#d32f2f', fontSize: '12px' }}>{bioError}</p>}
              </div>
            ) : (
              bio && <div style={{ marginTop: '8px' }}><BioText text={bio} /></div>
            )}

            {/* Bio links display / edit form */}
            {editingLinks ? (
              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                {linksInput.map((l, i) => (
                  <div key={i} style={{ display: 'flex', gap: '6px', width: '100%', maxWidth: '480px' }}>
                    <input
                      value={l.label}
                      onChange={e => setLinksInput(prev => prev.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                      placeholder="Personal website, Instagram…"
                      maxLength={50}
                      style={{ flex: '0 0 160px', padding: '5px 8px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                    <input
                      value={l.url}
                      onChange={e => setLinksInput(prev => prev.map((x, j) => j === i ? { ...x, url: e.target.value } : x))}
                      placeholder="https://..."
                      maxLength={500}
                      style={{ flex: 1, padding: '5px 8px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>
                ))}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" onClick={saveLinks}>Save</button>
                  <button type="button" onClick={() => { setEditingLinks(false); setLinksError(''); }}>Cancel</button>
                </div>
                {linksError && <p style={{ margin: '4px 0 0', color: '#d32f2f', fontSize: '12px' }}>{linksError}</p>}
              </div>
            ) : (
              bioLinks.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginTop: '6px' }}>
                  {bioLinks.map((l, i) => (
                    <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: '13px', color: '#1a73e8', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', border: '1px solid #93c5fd', borderRadius: '12px', background: 'rgba(219,234,254,0.5)' }}
                      onClick={e => confirmExternal(e, l.url)}>
                      {l.label || l.url}
                    </a>
                  ))}
                </div>
              )
            )}

            {/* Owner action row: Edit bio | Edit links | Wallpaper | Download my data */}
            {canEdit && !editingBio && !editingLinks && (
              <div style={{ marginTop: '10px', display: 'flex', gap: '6px', justifyContent: 'space-evenly', flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="button" className="edit-bio-btn" onClick={() => { setBioInput(bio); setEditingBio(true); }}>
                  {bio ? 'Edit bio' : '+ Add bio'}
                </button>
                <button type="button" className="edit-bio-btn" onClick={() => {
                  const padded = [...bioLinks];
                  while (padded.length < 3) padded.push({ label: '', url: '' });
                  setLinksInput(padded);
                  setEditingLinks(true);
                }}>
                  {bioLinks.length > 0 ? 'Edit links' : '+ Add links'}
                </button>
                <span ref={bgPickerRef} style={{ position: 'relative', display: 'inline-block' }}>
                  <button type="button" className="edit-bio-btn" onClick={() => setShowBgPicker(o => !o)}>
                    {showBgPicker ? 'Hide wallpaper' : 'Wallpaper'}
                  </button>
                </span>
                <button
                  type="button"
                  className="edit-bio-btn"
                  onClick={async () => {
                    try { await EXPORT_MY_DATA(username); }
                    catch { alert('Export failed. Please try again.'); }
                  }}
                >
                  Download my data
                </button>
              </div>
            )}
            {canEdit && showBgPicker && (
              <div style={{ background: '#fff', border: '1px solid #ccc', borderRadius: '8px', padding: '12px', marginTop: '6px' }}>
                {bgSaveError && <p style={{ margin: '0 0 6px', color: '#d32f2f', fontSize: '12px' }}>{bgSaveError}</p>}
                <PatternPicker value={bgPattern} onChange={handleBgChange} username={username} />
              </div>
            )}

            {/* Followers / Following + Message / Block DMs — combined row */}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" className="follow-count-btn" onClick={() => openFollowModal('followers')}>
                <span className="follow-count-num">{followCounts.followers}</span>&nbsp;followers
              </button>
              <button type="button" className="follow-count-btn" onClick={() => openFollowModal('following')}>
                <span className="follow-count-num">{followCounts.following}</span>&nbsp;following
              </button>
              {!canEdit && loggedIn && (
                <>
                  {!dmBlockedByThem && (
                    <button type="button" onClick={() => setShowMessageForm(o => !o)}>Message</button>
                  )}
                  <button
                    type="button"
                    className={dmBlocked ? 'btn-unblock-dm' : 'btn-block-dm'}
                    onClick={async () => {
                      try {
                        if (dmBlocked) { await UNBLOCK_MESSAGES(username); setDmBlocked(false); }
                        else { await BLOCK_MESSAGES(username); setDmBlocked(true); }
                      } catch {}
                    }}
                  >
                    {dmBlocked ? 'Unblock DMs' : 'Block DMs'}
                  </button>
                </>
              )}
            </div>


            {/* Message form — expands below the social row */}
            {showMessageForm && (
              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <textarea
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                  maxLength={1000}
                  rows={3}
                  style={{ width: '100%', maxWidth: '480px', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', fontFamily: 'inherit', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box' }}
                  placeholder="Write a message..."
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" onClick={sendMessage}>Send</button>
                  <button type="button" onClick={() => { setShowMessageForm(false); setMessageText(''); }}>Cancel</button>
                </div>
              </div>
            )}

            {storage && <StorageBar storage={storage} />}
          </div>
          {pinnedPost && (
            <div className="PostContainer" style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', top: '8px', left: '12px', zIndex: 1, fontSize: '11px', fontWeight: 700, color: '#888', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                📌 Pinned
              </div>
              <BasicTextPost postdata={pinnedPost} updatePostsFlagCallback={() => loadPosts(true)}
                uploaded={true} hasModifyPermissions={canEdit} ownerUsername={username}/>
            </div>
          )}
          {(!Array.isArray(visiblePosts) || !visiblePosts.length) && !loadingMore
            ? <p>There are no posts, yet. Create one to get started.</p>
            : <>
                {folderNames.map(name => (
                  <div key={name} style={{ marginBottom: '8px' }}>
                    <button
                      type="button"
                      onClick={() => toggleFolder(name)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 12px', fontSize: '14px', fontWeight: 600, color: '#444', display: 'flex', alignItems: 'center', gap: '6px', width: '100%', textAlign: 'left' }}
                    >
                      <span style={{ fontSize: '12px', transition: 'transform 0.15s', transform: collapsedFolders.has(name) ? 'rotate(-90deg)' : 'rotate(0deg)', display: 'inline-block' }}>▼</span>
                      {name}
                      <span style={{ fontSize: '12px', fontWeight: 400, color: '#888', marginLeft: '4px' }}>({folderMap[name].length})</span>
                    </button>
                    {!collapsedFolders.has(name) && folderMap[name].map((record, index) => (
                      <div className="PostContainer" key={record.id ?? index}>
                        <BasicTextPost postdata={record} updatePostsFlagCallback={() => loadPosts(true)}
                          uploaded={true} hasModifyPermissions={canEdit} ownerUsername={username}/>
                      </div>
                    ))}
                  </div>
                ))}
                {ungroupedPosts.map((record, index) => (
                  <div className="PostContainer" key={record.id ?? index}>
                    <BasicTextPost postdata={record} updatePostsFlagCallback={() => loadPosts(true)}
                      uploaded={true} hasModifyPermissions={canEdit} ownerUsername={username}/>
                  </div>
                ))}
              </>
          }
          <div ref={sentinelRef} style={{ height: '1px' }} />
          {loadingMore && <p style={{ textAlign: 'center', color: '#888', fontSize: '14px' }}>Loading…</p>}
        </div>
      </div>
    );
}

export default PostsViewer;