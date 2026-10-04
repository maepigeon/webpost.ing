import { useState, useEffect, useRef, useCallback } from 'react';
import { visiblePostsFor } from '../../../../utils/viewAs.js';
import {AUTHORIZE_SESSION, READ_POSTS_BY_USER, GET_POST_SECTIONS, GET_PROFILE_SUMMARY, UPDATE_USER_BIO, UPDATE_USER_BIO_LINKS, GET_USER_STORAGE, GET_FOLLOWERS, GET_FOLLOWING, BLOCK_MESSAGES, UNBLOCK_MESSAGES, EXPORT_MY_DATA, SET_PINNED_POST, UNPIN_POST, POST_USER_AVATAR} from '../BasicTextPostServerApi.js'
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
import {useParams, Link, useNavigate, useSearchParams} from "react-router-dom";
import { usePageTitle } from '../../../../utils/usePageTitle.js';
import { usePageMeta } from '../../../../utils/pageMeta.js';
import { describeUploadError } from '../../../../utils/responsiveImage.js';
import ProfileBanner from './ProfileBanner.jsx';
import ProfileTabs from './ProfileTabs.jsx';
import { tabFromSearch, searchForTab, sectionForTab, visibleTabs, showTabBar, publicPostCount, hidesDrafts, listedPosts, listRunsOn, profileFromSummary } from './profileTabs.js';
import StorageSummary from './StorageSummary.jsx';
import ProfileStickies from './ProfileStickies.jsx';
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
        onClick={e => confirmExternal(e, url, onConfirmExternal)}>{url}</a>
    );
    last = match.index + url.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <p style={{ margin: '0', fontSize: '14px', color: 'var(--th-ink, #111)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{parts}</p>;
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
    const [arrangingStickies, setArrangingStickies] = useState(false);
    const [stickiesSlot, setStickiesSlot] = useState(null);
    const [stickiesRoot, setStickiesRoot] = useState(null);
    const [dmBlocked, setDmBlocked] = useState(false);
    const [dmBlockedByThem, setDmBlockedByThem] = useState(false);
    const [followsMe, setFollowsMe] = useState(false);
    const [pinnedPost, setPinnedPost] = useState(null);
    const [avatar, setAvatar] = useState('');
    const [onlineStatus, setOnlineStatus] = useState(null); // { online, lastSeen }
    const [showAvatarPopup, setShowAvatarPopup] = useState(false);
    const [previewing, setPreviewing] = useState(false);   // owner viewing as a visitor
    // How many posts each tab holds, as this reader may see them, and (while
    // previewing) how many notes a visitor would see.
    const [counts, setCounts] = useState({});
    const [publicNotes, setPublicNotes] = useState(null);
    // The server says there is no such user: one plain line instead of an empty profile.
    const [notFound, setNotFound] = useState(false);
    const avatarInputRef = useRef(null);
    const sentinelRef = useRef(null);
    const { username } = useParams();
    useAuthorTheme(username);
    usePageTitle(username ? `${username}'s profile` : null);
    usePageMeta(username ? { title: username, description: bio, type: 'profile', canonicalPath: `/${username}` } : null);
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const isOwner = hasModifyPermissions(username);
    // Owner controls follow `canEdit`; previewing switches them all off at once.
    const canEdit = isOwner && !previewing;
    const loggedIn = !!localStorage.getItem('userName');

    // The tab lives in the address (?tab=notes) so links and reloads land on
    // it. A visitor, or the owner previewing as one, only has the public tabs.
    const tab = tabFromSearch(searchParams.toString(), { isOwner: canEdit });
    const section = sectionForTab(tab);
    const selectTab = (id) => setSearchParams(
      new URLSearchParams(searchForTab(id, searchParams.toString())), { replace: true });

    // Not kept across profiles or reloads; Escape leaves the preview.
    useEffect(() => { setPreviewing(false); }, [username]);
    useEffect(() => {
      if (!previewing) return;
      const onKey = e => { if (e.key === 'Escape') setPreviewing(false); };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [previewing]);

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
      const request = READ_POSTS_BY_USER(username, PAGE_SIZE, offset, section).then(data => {
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
    }, [username, section]);

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
          const data = await READ_POSTS_BY_USER(username, ALL_PAGE, offset, section);
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
    }, [username, section]);

    /** A new arrangement, already saving: shown at once. */
    const arrangePosts = useCallback((changed) => {
      setPostsArray(prev => applyChanges(prev, changed));
    }, []);

    // Switching tab (or profile) starts the list over with that section.
    const autoLoadedAtRef = useRef(-1);   // the offset a drafts-only page was already followed up from
    useEffect(() => {
      setPostsArray([]);
      offsetRef.current = 0;
      autoLoadedAtRef.current = -1;
      setHasMore(true);
      loadPosts(true);
    }, [loadPosts]);

    // Tab counts. They arrive with the summary below; this refreshes them
    // after the owner changes a post from the list.
    const loadCounts = useCallback(() => {
      GET_POST_SECTIONS(username).then(c => {
        setCounts(c || {});
        // With counts as published posts, a visitor's note count is the same number.
        if (typeof c?.notes === 'number') setPublicNotes(c.notes);
      }).catch(() => {});
    }, [username]);

    // Everything the profile draws besides the posts, the theme and the
    // storage figure comes in this one request.
    useEffect(() => {
      let current = true;
      const empty = profileFromSummary(null);
      setNotFound(false);
      setBgPattern(empty.bgPattern); setHeader(empty.header); setBio(empty.bio); setBioLinks(empty.bioLinks);
      setAvatar(empty.avatar); setOnlineStatus(empty.onlineStatus); setBanner(empty.banner);
      setCounts(empty.counts); setPublicNotes(empty.publicNotes); setFollowCounts(empty.followCounts);
      setFollowsMe(empty.followsMe); setPinnedPost(empty.pinnedPost);
      setDmBlocked(empty.dmBlocked); setDmBlockedByThem(empty.dmBlockedByThem);
      GET_PROFILE_SUMMARY(username).then(data => {
        if (!current) return;
        const p = profileFromSummary(data);
        setBgPattern(p.bgPattern); setHeader(p.header); setBio(p.bio); setBioLinks(p.bioLinks);
        setAvatar(p.avatar); setOnlineStatus(p.onlineStatus); setBanner(p.banner);
        setCounts(p.counts); setPublicNotes(p.publicNotes); setFollowCounts(p.followCounts);
        setFollowsMe(p.followsMe); setPinnedPost(p.pinnedPost);
        setDmBlocked(p.dmBlocked); setDmBlockedByThem(p.dmBlockedByThem);
      }).catch(err => { if (current && err?.response?.status === 404) setNotFound(true); });
      return () => { current = false; };
    }, [username]);

    // Only the owner and admins may see how much space a profile uses.
    useEffect(() => {
      if (isOwner || localStorage.getItem('isAdmin') === '1') GET_USER_STORAGE(username).then(setStorage).catch(() => {});
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

    const visiblePosts = visiblePostsFor(postsArray, { previewing });
    // The owner's Posts and Notes list what is published, so a list is as long
    // as its tab's count; drafts are under Drafts. The arrange view gets every
    // post (ProfilePostList, which is told to hide drafts only outside it).
    const hideDrafts = hidesDrafts(tab, canEdit);
    const listed = listedPosts(visiblePosts, { tab, canEdit });
    const nothingListed = !Array.isArray(listed) || listed.length === 0;
    const listRunsOnPast = listRunsOn({ listedCount: listed?.length ?? 0, loadedCount: postsArray.length, hasMore });

    // A page made only of drafts: go on to the next one rather than leave an
    // empty tab with more behind it. Once per offset, so a failed page is not
    // retried in a loop.
    useEffect(() => {
      if (!listRunsOnPast || loadingMore || autoLoadedAtRef.current === offsetRef.current) return;
      autoLoadedAtRef.current = offsetRef.current;
      loadPosts(false);
    }, [listRunsOnPast, loadingMore, loadPosts, postsArray]);
    const baseTabs = visibleTabs({ isOwner: canEdit, counts, publicNotes });
    // A visitor who follows a link to ?tab=notes on a profile with no public
    // notes still lands on that tab (empty) rather than on a different list.
    const tabs = baseTabs.some(t => t.id === tab) ? baseTabs : [...baseTabs, { id: 'notes', label: 'Notes', count: 0 }];
    const emptyText = {
      posts: canEdit ? 'No posts yet. Make one to get started.' : `${username} hasn't posted anything yet.`,
      notes: canEdit ? 'No notes yet. Notes are a quieter place for things you write down.' : `${username} has no notes yet.`,
      drafts: 'No drafts. Anything you save without publishing shows up here.',
      subscribers: 'Nothing here yet.',
    }[tab];

    // Posts are loaded, though maybe all drafts: the list (with Arrange) is drawn.
    const hasLoadedPosts = Array.isArray(visiblePosts) && visiblePosts.length > 0;

    // Nothing to list, and nothing more coming: one quiet panel.
    const showEmptyPanel = nothingListed && !loadingMore && !listRunsOnPast;

    // Drawn by the post list, under its owner bar and above the other posts.
    // Only on the Posts tab: pinning is part of arranging the profile.
    const pinnedBlock = tab === 'posts' && pinnedPost && !(previewing && !pinnedPost.published) ? (
      <div className="PostContainer profile-pinned">
        {/* A label above the card, not laid over it: on the card it covered
            the date and the title. */}
        <div className="profile-pinned-label">Pinned</div>
        <BasicTextPost postdata={pinnedPost} updatePostsFlagCallback={() => loadPosts(true)}
          uploaded={true} hasModifyPermissions={canEdit} ownerUsername={username}/>
      </div>
    ) : null;

    if (notFound) {
      return (
        <div className="window th-scope" style={{ minHeight: '100vh', justifyContent: 'flex-start' }}>
          <div className="postsViewerContainer">
            <p className="profile-tab-empty" role="status">This profile does not exist.</p>
          </div>
        </div>
      );
    }

    // Top-aligned: the window centres its children, which moved the header
    // down whenever the list was short.
    return (
      <div className="window th-scope" style={{ minHeight: '100vh', justifyContent: 'flex-start' }}>
        {previewing && (
          <div className="view-as-bar" role="status">
            <span>Viewing your profile as a visitor</span>
            <button type="button" className="view-as-bar-btn" onClick={() => setPreviewing(false)}>Back to editing</button>
          </div>
        )}
        {followModal && (
          <FollowListModal
            title={followModal === 'followers' ? `Followers` : `Following`}
            users={followList}
            onClose={() => setFollowModal(null)}
          />
        )}
        <div className="postsViewerContainer" ref={setStickiesRoot}>
          <ProfileStickies username={username} canEdit={canEdit} editing={arrangingStickies}
            onEditingChange={setArrangingStickies} barSlot={stickiesSlot} root={stickiesRoot} />
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
              publicPosts={publicPostCount(counts, banner.publicPosts)}
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
              {previewing
                // FollowButton draws nothing on your own profile, so show a stand-in.
                ? <button type="button" className="follow-btn" disabled title="Shown as a visitor sees it">Follow</button>
                : <FollowButton username={username} onFollowChange={delta => setFollowCounts(c => ({ ...c, followers: c.followers + delta }))} />}
              {!isOwner && followsMe && <span style={{ fontSize: '12px', color: '#333', fontStyle: 'italic' }}>follows you</span>}
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
                  <button type="button" className="edit-bio-btn" onClick={saveBio}>Save</button>
                  <button type="button" className="edit-bio-btn" onClick={() => { setEditingBio(false); setBioError(''); }}>Cancel</button>
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
                  <button type="button" className="edit-bio-btn" onClick={() => setPreviewing(true)}>
                    View as visitor
                  </button>
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
              {(!isOwner || previewing) && loggedIn && (
                <>
                  {!dmBlockedByThem && (
                    <button type="button" className="edit-bio-btn" disabled={previewing} title={previewing ? 'Shown as a visitor sees it' : undefined} onClick={() => navigate(`/messages?with=${username}`)}>Send message</button>
                  )}
                  <button
                    type="button"
                    className={dmBlocked ? 'btn-unblock-dm' : 'btn-block-dm'}
                    disabled={previewing}
                    title={previewing ? 'Shown as a visitor sees it' : undefined}
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

            {/* The owner's sticker buttons (Add sticker, Arrange) go here. */}
            {canEdit && <div ref={setStickiesSlot} />}
            {canEdit && storage && <StorageSummary storage={storage} />}
          </div>
          <ProfileTabs tabs={tabs} active={tab} onSelect={selectTab} />
          <div id="profile-tabpanel" {...(showTabBar(tabs) ? { role: 'tabpanel', 'aria-labelledby': `profile-tab-${tab}` } : {})}>
          {/* An empty tab is one quiet panel: what this place is, then what
              you can do here, side by side. A tab with posts keeps only its
              "new" button above the list. */}
          {showEmptyPanel && (
            <div className="profile-tab-panel">
              <p className="profile-tab-empty">{emptyText}</p>
              {tab === 'subscribers' && (
                <p className="profile-tab-sub">Only you can see these for now. Subscriptions are coming later.</p>
              )}
              {canEdit && tab !== 'drafts' && !hasLoadedPosts && (
                <div className="profile-tab-actions">
                  <Link className="profile-owner-btn" to={tab === 'posts' ? '/editor' : `/editor?section=${tab}`}>
                    {tab === 'notes' ? '+ New note' : '+ New post'}
                  </Link>
                  <NewGridPost section={tab === 'notes' || tab === 'subscribers' ? tab : 'profile'} />
                </div>
              )}
            </div>
          )}
          {(!showEmptyPanel || hasLoadedPosts) && (
            <>
              {tab === 'subscribers' && (
                <p className="profile-tab-sub profile-tab-sub--bar">Only you can see these for now. Subscriptions are coming later.</p>
              )}
              {canEdit && (tab === 'notes' || tab === 'subscribers') && (
                <div className="profile-list-bar">
                  <Link className="profile-owner-btn" to={`/editor?section=${tab}`}>
                    {tab === 'notes' ? '+ New note' : '+ New post'}
                  </Link>
                </div>
              )}
            </>
          )}
          {!hasLoadedPosts && !loadingMore
            ? null
            : <ProfilePostList
                key={tab}
                posts={visiblePosts}
                hideDrafts={hideDrafts}
                pinnedId={tab === 'posts' ? (pinnedPost?.id ?? null) : null}
                canEdit={canEdit}
                arrangeable={tab === 'posts'}
                showDestination={tab === 'drafts'}
                username={username}
                onRefresh={() => { loadPosts(true); loadCounts(); }}
                onArrange={arrangePosts}
                onPin={async (post, pin) => {
                  // Pinning is done here, on the profile it changes, from Arrange posts.
                  try {
                    if (pin) { await SET_PINNED_POST(username, post.id); setPinnedPost(post); }
                    else { await UNPIN_POST(username); setPinnedPost(null); }
                  } catch { alert('Could not change the pinned post.', 'Pin'); }
                }}
                hasMore={hasMore}
                loadAll={loadAllPosts}
                leading={canEdit ? <NewGridPost section={tab === 'notes' || tab === 'subscribers' ? tab : 'profile'} /> : null}
                pinned={pinnedBlock}
              />
          }
          </div>
          <div ref={sentinelRef} style={{ height: '1px' }} />
          {loadingMore && <p style={{ textAlign: 'center', color: '#888', fontSize: '14px' }}>Loading…</p>}
        </div>
      </div>
    );
}

export default PostsViewer;