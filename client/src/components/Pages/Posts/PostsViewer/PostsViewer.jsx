import { useState, useEffect, useRef, useCallback } from 'react';
import {AUTHORIZE_SESSION, READ_POSTS_BY_USER, GET_USER_BACKGROUND, GET_USER_BIO, UPDATE_USER_BIO, GET_USER_BIO_LINKS, UPDATE_USER_BIO_LINKS, GET_USER_STORAGE, GET_FOLLOWERS, GET_FOLLOWING, GET_BLOCK_MESSAGE_STATUS, BLOCK_MESSAGES, UNBLOCK_MESSAGES, EXPORT_MY_DATA, GET_PINNED_POST, GET_USER_AVATAR, POST_USER_AVATAR, GET_USER_ONLINE} from '../BasicTextPostServerApi.js'
import ProfilePostList from './ProfilePostList.jsx';
import { mergePosts, applyChanges } from './profileOrder.js';
import { IMAGES_BASE_URL } from '../../../../config.js';
import BasicTextPost from '../PostRenderer/BasicTextPost/BasicTextPost.jsx';
import FollowButton from '../../../Social/FollowButton.jsx';
import FollowListModal from '../../../Social/FollowListModal.jsx';
import AvatarPopup from '../../../Social/AvatarPopup.jsx';
import { useBodyWallpaper } from '../../../TileArt/wallpaper.js';
import './ProfileEditor.css';
import { useDialog } from '../../../Dialog/Dialog.jsx';
import '../PostWindow.css';
import {useParams, Link, useNavigate} from "react-router-dom";
import { usePageTitle } from '../../../../utils/usePageTitle.js';
import { describeUploadError } from '../../../../utils/responsiveImage.js';
import { GET_PROFILE_HEADER, GET_PROFILE_BANNER } from '../BasicTextPostServerApi.js';
import ProfileBanner from './ProfileBanner.jsx';
import StorageSummary from './StorageSummary.jsx';
import BannerEditor from './BannerEditor.jsx';
import { useAuthorTheme } from '../../../PageTheme/PageTheme.jsx';
import Icon from '../../../Icon/Icon.jsx';
import NewGridPost from '../../../TileArt/NewGridPost.jsx';
import { errorMessage } from '../../../../utils/errorMessage.js';


const URL_REGEX = /https?:\/\/[^\s<>"]+[^\s<>".,;:!?)/]/g;

function confirmExternal(e, url, linkWarningFn) {
  try {
    if (new URL(url).origin === window.location.origin) return;
  } catch { return; }
  e.preventDefault();
  linkWarningFn(url).then(ok => {
    if (ok) window.open(url, '_blank', 'noopener,noreferrer');
  });
}

function BioText({ text, onConfirmExternal }) {
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
        style={{ color: '#333333' }}
        onClick={e => confirmExternal(e, url, onConfirmExternal)}>{url}</a>
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
    const { confirm, alert, linkWarning } = useDialog();
    const [postsArray, setPostsArray] = useState([]);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const offsetRef = useRef(0);
    const PAGE_SIZE = 20;
    const [bgPattern, setBgPattern] = useState('');
    // Banner image behind the header card, and how text over it is coloured.
    const [header, setHeader] = useState({ headerPath: null, headerInk: 'auto' });
    const [bio, setBio] = useState('');
    const [editingBio, setEditingBio] = useState(false);
    const [bioInput, setBioInput] = useState('');
    const [bioError, setBioError] = useState('');
    const [bioLinks, setBioLinks] = useState([]);
    const [editingLinks, setEditingLinks] = useState(false);
    // A list the user grows and shrinks, rather than three fixed slots. Ten is
    // the server's cap.
    const MAX_BIO_LINKS = 10;
    const [linksInput, setLinksInput] = useState([{ label: '', url: '' }]);
    const [linksError, setLinksError] = useState('');
    const [storage, setStorage] = useState(null);
    const [followModal, setFollowModal] = useState(null); // 'followers' | 'following' | null
    const [followList, setFollowList] = useState([]);
    const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
    // The banner's join date, public post count and the owner's own rows.
    const [banner, setBanner] = useState({ joined: null, publicPosts: 0, grid: null });
    const [editingBanner, setEditingBanner] = useState(false);
    const [dmBlocked, setDmBlocked] = useState(false);
    const [dmBlockedByThem, setDmBlockedByThem] = useState(false);
    const [followsMe, setFollowsMe] = useState(false);
    const [pinnedPost, setPinnedPost] = useState(null);
    const [avatar, setAvatar] = useState('');
    const [onlineStatus, setOnlineStatus] = useState(null); // { online, lastSeen }
    const [showAvatarPopup, setShowAvatarPopup] = useState(false);
    const avatarInputRef = useRef(null);
    const sentinelRef = useRef(null);
    const { username } = useParams();
    useAuthorTheme(username);
    usePageTitle(username ? `${username}'s profile` : null);
    const navigate = useNavigate();
    const canEdit = hasModifyPermissions(username);
    const loggedIn = !!localStorage.getItem('userName');

    // Each request remembers the generation it was made in. Opening another
    // profile, or starting the list over, moves the generation on, so a late
    // reply for the old list is dropped rather than added to the new one.
    const generationRef = useRef(0);
    // Set synchronously, unlike loadingMore: the scroll observer can fire
    // before a re-render, and a second request for the same offset is how the
    // first page used to appear twice.
    const loadingRef = useRef(null);   // the page request in flight, if any

    const loadPosts = useCallback((reset = false) => {
      if (reset) generationRef.current += 1;
      else if (loadingRef.current) return loadingRef.current;
      const generation = generationRef.current;
      const offset = reset ? 0 : offsetRef.current;
      setLoadingMore(true);
      const request = READ_POSTS_BY_USER(username, PAGE_SIZE, offset).then(data => {
        if (generation !== generationRef.current) return;
        const page = Array.isArray(data) ? data : [];
        setPostsArray(prev => mergePosts(reset ? [] : prev, page));
        offsetRef.current = offset + page.length;
        setHasMore(page.length === PAGE_SIZE);
      }).catch(() => {}).finally(() => {
        if (loadingRef.current === request) loadingRef.current = null;
        if (generation === generationRef.current) setLoadingMore(false);
      });
      loadingRef.current = request;
      return request;
    }, [username]);

    /**
     * Loads every post not yet shown, so the whole profile can be arranged at
     * once. Resolves false if the list was started over meanwhile; rejects if
     * a page fails to load.
     */
    const loadAllPosts = useCallback(async () => {
      const ALL_PAGE = 50;   // the server's largest page
      while (loadingRef.current) await loadingRef.current;
      const generation = generationRef.current;
      setLoadingMore(true);
      const request = (async () => {
        for (;;) {
          const offset = offsetRef.current;
          const data = await READ_POSTS_BY_USER(username, ALL_PAGE, offset);
          if (generation !== generationRef.current) return false;
          const page = Array.isArray(data) ? data : [];
          setPostsArray(prev => mergePosts(prev, page));
          offsetRef.current = offset + page.length;
          if (page.length < ALL_PAGE) break;
        }
        setHasMore(false);
        return true;
      })();
      // Registered as the request in flight, so scrolling cannot start a page
      // alongside it.
      loadingRef.current = request;
      try {
        return await request;
      } finally {
        if (loadingRef.current === request) loadingRef.current = null;
        if (generation === generationRef.current) setLoadingMore(false);
      }
    }, [username]);

    /** A new arrangement, already saving: shown at once. */
    const arrangePosts = useCallback((changed) => {
      setPostsArray(prev => applyChanges(prev, changed));
    }, []);

    useEffect(() => {
      setPostsArray([]);
      offsetRef.current = 0;
      setHasMore(true);
      loadPosts(true);
      GET_USER_BACKGROUND(username).then(p => setBgPattern(p || '')).catch(() => {});
      GET_PROFILE_HEADER(username)
        .then(d => setHeader({ headerPath: d.headerPath || null, headerInk: d.headerInk || 'auto' }))
        .catch(() => {});
      setBanner({ joined: null, publicPosts: 0, grid: null });
      GET_PROFILE_BANNER(username)
        .then(d => setBanner({ joined: d.joined || null, publicPosts: d.publicPosts || 0, grid: d.grid || null }))
        .catch(() => {});
      GET_USER_BIO(username).then(b => setBio(b || '')).catch(() => {});
      GET_USER_BIO_LINKS(username).then(d => {
        const links = Array.isArray(d) ? d : (typeof d === 'string' ? JSON.parse(d) : []);
        setBioLinks(links);
      }).catch(() => {});
      // Only the owner and admins may see how much space a profile uses.
      if (canEdit || localStorage.getItem('isAdmin') === '1') GET_USER_STORAGE(username).then(setStorage).catch(() => {});
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
      GET_USER_AVATAR(username).then(d => setAvatar(d?.avatarPath || '')).catch(() => {});
      GET_USER_ONLINE(username).then(setOnlineStatus).catch(() => {});
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


    // The author's wallpaper, behind the whole page.
    useBodyWallpaper(bgPattern);




    async function openFollowModal(type) {
      try {
        const list = type === 'followers' ? await GET_FOLLOWERS(username) : await GET_FOLLOWING(username);
        setFollowList(list);
        setFollowModal(type);
      } catch { setFollowList([]); setFollowModal(type); }
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
        .catch(err => setLinksError(errorMessage(err, 'Failed to save links.')));
    }

    function saveBio() {
      const trimmed = bioInput.trim();
      setBioError('');
      UPDATE_USER_BIO(username, trimmed)
        .then(() => { setBio(trimmed); setEditingBio(false); })
        .catch(err => setBioError(errorMessage(err, 'Failed to save bio. Try again.')));
    }

    const visiblePosts = postsArray;

    // Drawn by the post list, under its owner bar and above the other posts.
    const pinnedBlock = pinnedPost ? (
      <div className="PostContainer profile-pinned">
        {/* A label above the card, not laid over it: on the card it covered
            the date and the title. */}
        <div className="profile-pinned-label">📌 Pinned</div>
        <BasicTextPost postdata={pinnedPost} updatePostsFlagCallback={() => loadPosts(true)}
          uploaded={true} hasModifyPermissions={canEdit} ownerUsername={username}/>
      </div>
    ) : null;

    return (
      <div className="window th-scope" style={{ minHeight: '100vh' }}>
        {followModal && (
          <FollowListModal
            title={followModal === 'followers' ? `Followers` : `Following`}
            users={followList}
            onClose={() => setFollowModal(null)}
          />
        )}
        <div className="postsViewerContainer">
          <div
            className={`profile-header-card${header.headerPath ? ' profile-header-card--image' : ''}${
              header.headerPath ? ` profile-header-card--ink-${header.headerInk}` : ''}`}
            style={header.headerPath ? { backgroundImage: `url(${IMAGES_BASE_URL}${header.headerPath})` } : undefined}
          >
            {/* A scrim under the text, not over the image as a whole: it keeps
                the photo legible while guaranteeing the name and bio stay
                readable whatever the image behind them. */}
            {header.headerPath && <span className="profile-header-scrim" aria-hidden="true" />}
            {/* The banner: the site's rows (who, counts, joined, posts) beside the
                avatar, then the owner's own rows. */}
            <ProfileBanner
              username={username}
              followers={followCounts.followers}
              following={followCounts.following}
              joined={banner.joined}
              publicPosts={banner.publicPosts}
              grid={banner.grid}
              avatarSrc={avatar ? IMAGES_BASE_URL + avatar : null}
              online={Boolean(onlineStatus?.online)}
              onAvatarClick={() => setShowAvatarPopup(true)}
              onFollowers={() => openFollowModal('followers')}
              onFollowing={() => openFollowModal('following')}
              underAvatar={(onlineStatus || canEdit) ? (
                <>
                  {onlineStatus && (
                    <span style={{ color: onlineStatus.online ? '#2ecc71' : '#999', fontWeight: onlineStatus.online ? 600 : 400 }}>
                      {onlineStatus.online
                        ? 'Online'
                        : onlineStatus.lastSeen ? `Last seen ${new Date(onlineStatus.lastSeen).toLocaleDateString()}` : null}
                    </span>
                  )}
                  {canEdit && (
                    <>
                      <input type="file" accept="image/*" ref={avatarInputRef} style={{ display: 'none' }}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const fd = new FormData();
                          fd.append('file', file);
                          try {
                            const path = await POST_USER_AVATAR(username, fd);
                            const relativePath = typeof path === 'string' ? path : path?.avatarPath || '';
                            setAvatar(relativePath);
                          } catch (err) {
                            alert(describeUploadError(err), 'Upload failed');
                          }
                          e.target.value = '';
                        }}
                      />
                      <button type="button" className="edit-bio-btn" onClick={() => avatarInputRef.current?.click()}>
                        Set profile picture
                      </button>
                    </>
                  )}
                </>
              ) : null}
              editor={editingBanner ? (
                <BannerEditor username={username} saved={banner.grid}
                  onSaved={grid => setBanner(b => ({ ...b, grid }))} onClose={() => setEditingBanner(false)} />
              ) : null}
            />
            {showAvatarPopup && (
              <AvatarPopup
                src={avatar ? IMAGES_BASE_URL + avatar : undefined}
                username={username}
                profileUrl={`${window.location.origin}/users/${username}`}
                onClose={() => setShowAvatarPopup(false)}
              />
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <FollowButton username={username} onFollowChange={delta => setFollowCounts(c => ({ ...c, followers: c.followers + delta }))} />
              {!canEdit && followsMe && <span style={{ fontSize: '12px', color: '#333', fontStyle: 'italic' }}>follows you</span>}
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
              bio && <div style={{ marginTop: '8px' }}><BioText text={bio} onConfirmExternal={confirm} /></div>
            )}

            {/* Bio links display / edit form */}
            {editingLinks ? (
              <div className="profile-links-editor">
                {linksInput.map((l, i) => (
                  <div key={i} className="profile-link-row">
                    <input
                      className="profile-link-input profile-link-input--label"
                      value={l.label}
                      onChange={e => setLinksInput(prev => prev.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                      placeholder="Personal website, Instagram…"
                      maxLength={50}
                      aria-label={`Link ${i + 1} label`}
                    />
                    <input
                      className="profile-link-input"
                      value={l.url}
                      onChange={e => setLinksInput(prev => prev.map((x, j) => j === i ? { ...x, url: e.target.value } : x))}
                      placeholder="https://..."
                      maxLength={500}
                      aria-label={`Link ${i + 1} address`}
                    />
                    <button
                      type="button"
                      className="profile-link-remove"
                      title="Remove this link"
                      aria-label={`Remove link ${i + 1}`}
                      onClick={() => setLinksInput(prev =>
                        // Never leave zero rows: an empty editor gives the user
                        // nothing to type into and no obvious way forward.
                        prev.length === 1 ? [{ label: '', url: '' }] : prev.filter((_, j) => j !== i))}
                    ><Icon name="close" size={12} /></button>
                  </div>
                ))}

                <div className="profile-links-actions">
                  <button
                    type="button"
                    className="profile-link-add"
                    disabled={linksInput.length >= MAX_BIO_LINKS}
                    onClick={() => setLinksInput(prev => [...prev, { label: '', url: '' }])}
                  >
                    + Add link
                  </button>
                  <span className="profile-links-count">
                    {linksInput.length} of {MAX_BIO_LINKS}
                  </span>
                  <span className="profile-links-spacer" />
                  <button type="button" className="edit-bio-btn" onClick={saveLinks}>Save</button>
                  <button type="button" className="edit-bio-btn"
                          onClick={() => { setEditingLinks(false); setLinksError(''); }}>Cancel</button>
                </div>
                {linksError && <p className="profile-inline-error">{linksError}</p>}
              </div>
            ) : (
              bioLinks.length > 0 && (
                <div className="profile-bio-links">
                  {bioLinks.map((l, i) => (
                    <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
                      className="profile-bio-link"
                      onClick={e => confirmExternal(e, l.url, linkWarning)}>
                      {l.label || l.url}
                    </a>
                  ))}
                </div>
              )
            )}

            {/* Owner action row: two groups separated by a divider */}
            {canEdit && !editingBio && !editingLinks && (
              <div className="profile-owner-actions">
                {/* Group 1: content */}
                <div className="profile-owner-group">
                  <button type="button" className="edit-bio-btn" disabled={editingBanner} onClick={() => setEditingBanner(true)}>
                    {banner.grid ? 'Edit banner' : '+ Banner'}
                  </button>
                  <button type="button" className="edit-bio-btn" onClick={() => { setBioInput(bio); setEditingBio(true); }}>
                    {bio ? 'Edit bio' : '+ Bio'}
                  </button>
                  <button type="button" className="edit-bio-btn" onClick={() => {
                    // Open on what they have, plus one empty row to type into.
                    setLinksInput(bioLinks.length ? [...bioLinks] : [{ label: '', url: '' }]);
                    setEditingLinks(true);
                  }}>
                    {bioLinks.length > 0 ? 'Edit links' : '+ Links'}
                  </button>
                </div>
                <div className="profile-owner-divider" />
                {/* Group 2: appearance + export */}
                <div className="profile-owner-group">
                  {/* Header, wallpaper, theme and fonts have a page of
                      their own, apart from account settings. */}
                  <Link to="/customize" className="edit-bio-btn profile-appearance-link">
                    Customize
                  </Link>
                  <button
                    type="button"
                    className="edit-bio-btn"
                    onClick={async () => {
                      try { await EXPORT_MY_DATA(username); }
                      catch { alert('Export failed. Please try again.', 'Export failed'); }
                    }}
                  >
                    Export data
                  </button>
                </div>
              </div>
            )}


            {/* Followers / Following + Message / Block DMs — combined row */}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
              {!canEdit && loggedIn && (
                <>
                  {!dmBlockedByThem && (
                    <button type="button" onClick={() => navigate(`/messages?with=${username}`)}>Send message</button>
                  )}
                  <button
                    type="button"
                    className={dmBlocked ? 'btn-unblock-dm' : 'btn-block-dm'}
                    onClick={async () => {
                      try {
                        if (dmBlocked) { await UNBLOCK_MESSAGES(username); setDmBlocked(false); }
                        else { await BLOCK_MESSAGES(username); setDmBlocked(true); }
                      } catch { /* the button reflects the server state on reload */ }
                    }}
                  >
                    {dmBlocked ? 'Unblock DMs' : 'Block DMs'}
                  </button>
                </>
              )}
            </div>

            {storage && <StorageSummary storage={storage} />}
          </div>
          {/* With posts, the button lives in the list's owner bar beside
              "Arrange posts"; without, on its own. */}
          {canEdit && (!Array.isArray(visiblePosts) || !visiblePosts.length) && <NewGridPost />}
          {(!Array.isArray(visiblePosts) || !visiblePosts.length) && !loadingMore
            ? <p>{canEdit ? 'There are no posts, yet. Create one to get started.' : `${username} hasn't posted anything yet.`}</p>
            : <ProfilePostList
                posts={visiblePosts}
                pinnedId={pinnedPost?.id ?? null}
                canEdit={canEdit}
                username={username}
                onRefresh={() => loadPosts(true)}
                onArrange={arrangePosts}
                hasMore={hasMore}
                loadAll={loadAllPosts}
                leading={canEdit ? <NewGridPost /> : null}
                pinned={pinnedBlock}
              />
          }
          <div ref={sentinelRef} style={{ height: '1px' }} />
          {loadingMore && <p style={{ textAlign: 'center', color: '#888', fontSize: '14px' }}>Loading…</p>}
        </div>
      </div>
    );
}

export default PostsViewer;