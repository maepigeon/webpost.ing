import { useState, useRef, useEffect } from 'react';
import BasicTextPost from '../PostRenderer/BasicTextPost/BasicTextPost.jsx';
import { UPDATE_POST_ORDER, SET_POST_VISIBILITY, DELETE_POST } from '../BasicTextPostServerApi.js';
import { useDialog } from '../../../Dialog/Dialog.jsx';
import ProfileArrange from './ProfileArrange.jsx';
import { toBlocks, moveToFolder, removeFromFolder } from './profileOrder.js';
import { errorMessage } from '../../../../utils/errorMessage.js';
import { destinationLabel } from './profileTabs.js';
import './ProfilePostList.css';
import './ProfileTabs.css';
import Icon from '../../../Icon/Icon.jsx';

/**
 * The posts on a profile, in the author's order, grouped into folders.
 *
 * Reordering happens in the arrange view (ProfileArrange), where each post is
 * one line. Here the author can still file a post into a folder from its menu.
 *
 * Every change is saved at once, one request after another. If one fails, the
 * ones queued behind it are dropped and the list goes back to the last order
 * the server confirmed, so what is on screen is never an order that was not
 * saved.
 */

// ── Folder section ────────────────────────────────────────────────────────────

function FolderSection({ name, posts, collapsed, onToggle, children }) {
  const previewTitles = posts.slice(0, 3).map(p => p.title || 'Untitled');

  return (
    <div className="profile-folder-section">
      <div className="profile-folder-header">
        <div className="profile-folder-header-inner">
          <div className="profile-folder-title-row">
            <span className="profile-folder-icon"><Icon name="folder" size={15} /></span>
            <span className="profile-folder-name">{name}</span>
            <span className="profile-folder-badge">{posts.length}</span>
          </div>
          {previewTitles.length > 0 && (
            <div className="profile-folder-preview">
              {previewTitles.map((t, i) => (
                <span key={i} className="profile-folder-preview-chip">{t}</span>
              ))}
              {posts.length > 3 && (
                <span className="profile-folder-preview-more">+{posts.length - 3} more</span>
              )}
            </div>
          )}
        </div>
        <div className="profile-folder-header-actions">
          <button type="button" className="profile-folder-toggle-btn" onClick={onToggle}
            title={collapsed ? 'Expand folder' : 'Collapse folder'} aria-expanded={!collapsed}>
            <span className="profile-folder-chevron"
              style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}><Icon name="chevronDown" size={16} /></span>
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="profile-folder-posts">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Post, with the author's folder menu ───────────────────────────────────────

function ProfilePost({ post, canEdit, username, onRefresh, folderNames, onMoveToFolder, onRemoveFromFolder, folderMenu, showDestination }) {
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const menuRef = useRef(null);

  useEffect(() => {
    if (!showFolderMenu) return;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowFolderMenu(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showFolderMenu]);

  const createFolder = () => {
    if (!newFolderName.trim()) return;
    onMoveToFolder(post.id, newFolderName.trim());
    setNewFolderName('');
    setShowFolderMenu(false);
  };

  return (
    <div className="profile-post-item">
      {showDestination && <span className="profile-post-destination">{destinationLabel(post.section)}</span>}
      <div className="profile-post-card-wrap">
        <BasicTextPost
          postdata={post}
          updatePostsFlagCallback={onRefresh}
          uploaded={true}
          hasModifyPermissions={canEdit}
          ownerUsername={username}
        />
        {canEdit && folderMenu && (
          // Raised while its menu is open: every post's button sits at the same
          // level, and the next post's would otherwise paint over this menu.
          <div className={`profile-post-folder-btn-wrap${showFolderMenu ? ' is-open' : ''}`} ref={menuRef}>
            <button
              type="button"
              className="profile-post-folder-btn"
              title={post.folder ? `In folder: ${post.folder}` : 'Add to folder'}
              onClick={() => setShowFolderMenu(v => !v)}
            >
              <Icon name="folder" size={13} />{post.folder ? ` ${post.folder}` : ''}
            </button>
            {showFolderMenu && (
              <div className="profile-post-folder-menu">
                {folderNames.length > 0 && (
                  <>
                    <div className="profile-post-folder-menu-label">Move to folder</div>
                    {folderNames.map(name => (
                      <button key={name} type="button"
                        className={`profile-post-folder-menu-item${post.folder === name ? ' active' : ''}`}
                        onClick={() => { onMoveToFolder(post.id, name); setShowFolderMenu(false); }}>
                        <Icon name="folder" size={13} /> {name}
                      </button>
                    ))}
                    <div className="profile-post-folder-menu-divider" />
                  </>
                )}
                <div className="profile-post-folder-menu-label">New folder</div>
                <div className="profile-post-folder-new-row">
                  <input
                    className="profile-post-folder-new-input"
                    placeholder="Folder name…"
                    maxLength={100}
                    value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') createFolder();
                      if (e.key === 'Escape') setShowFolderMenu(false);
                    }}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="profile-post-folder-new-btn"
                    disabled={!newFolderName.trim()}
                    onClick={createFolder}
                    aria-label="Create folder"
                  ><Icon name="plus" size={14} /></button>
                </div>
                {post.folder && (
                  <button type="button" className="profile-post-folder-menu-item profile-post-folder-menu-item--remove"
                    onClick={() => { onRemoveFromFolder(post.id); setShowFolderMenu(false); }}>
                    ✕ Remove from folder
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * @param posts     every post loaded so far, including the pinned one
 * @param pinnedId  the pinned post, shown above the list rather than in it;
 *                  it keeps its place in the order for when it is unpinned
 * @param onArrange takes changed posts and shows them at once
 * @param loadAll   loads the posts not yet shown, before arranging
 * @param leading   shown at the start of the owner bar (the New grid post button)
 * @param pinned    the pinned post's block, drawn under the bar, above the rest
 * @param arrangeable      false hides Arrange and the folder menu (every tab but Posts)
 * @param showDestination  true labels each post with where it will go (Drafts)
 * @param hideDrafts       true leaves unpublished posts out of the list (arranging still shows them)
 */
export default function ProfilePostList({
  posts, pinnedId, canEdit, username, onRefresh, onArrange, hasMore, loadAll, leading = null, pinned = null, onPin,
  arrangeable = true, showDestination = false, hideDrafts = false,
}) {
  const [collapsedFolders, setCollapsedFolders] = useState(new Set());
  const [arranging, setArranging] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [status, setStatus] = useState({ state: 'idle', text: '' });
  const { confirm } = useDialog();

  // ── Saving ──────────────────────────────────────────────────────────────────

  const queue = useRef(Promise.resolve());
  const pending = useRef(0);
  const generation = useRef(0);   // moves on when a save fails, dropping those queued behind it
  const confirmed = useRef(null); // the posts as last saved, while saves are pending

  const save = (next) => {
    if (!confirmed.current) confirmed.current = posts;
    onArrange(next);
    pending.current += 1;
    setStatus({ state: 'saving', text: 'Saving…' });

    const gen = generation.current;
    // The order shown, top first: the server numbers posts from it.
    // sortOrder is ignored by the current server, and read by the one before
    // it, so the two halves need not go live at the same moment.
    const updates = next.map((p, i) => ({ id: p.id, folder: p.folder || null, sortOrder: i }));
    queue.current = queue.current.then(async () => {
      if (gen !== generation.current) return;
      try {
        await UPDATE_POST_ORDER(username, updates);
        pending.current -= 1;
        confirmed.current = pending.current ? next : null;
        if (!pending.current) setStatus({ state: 'saved', text: 'Saved' });
      } catch (err) {
        generation.current += 1;
        pending.current = 0;
        onArrange(confirmed.current);
        confirmed.current = null;
        setStatus({ state: 'error', text: `${errorMessage(err, 'Could not save the new order.')} It has been put back.` });
      }
    });
  };

  /** Public or private from the arrange list: shown at once, put back if the server says no. */
  const setVisibility = async (post, published) => {
    onArrange(posts.map(p => (p.id === post.id ? { ...p, published } : p)));
    setStatus({ state: 'saving', text: 'Saving…' });
    try {
      await SET_POST_VISIBILITY(post.id, published);
      setStatus({ state: 'saved', text: published ? 'Made public' : 'Made private' });
      onRefresh?.();
    } catch (err) {
      onArrange(posts.map(p => (p.id === post.id ? { ...p, published: post.published } : p)));
      setStatus({ state: 'error', text: `${errorMessage(err, 'Could not change that post.')} It has been put back.` });
    }
  };

  /** Deleting from the arrange list asks first: it cannot be undone. */
  const removePost = async (post) => {
    if (!(await confirm(`Delete "${post.title || 'Untitled'}"? This cannot be undone.`, 'Delete post', 'Delete'))) return;
    setStatus({ state: 'saving', text: 'Deleting…' });
    try {
      await DELETE_POST(post.id);
      onArrange(posts.filter(p => p.id !== post.id));
      setStatus({ state: 'saved', text: 'Deleted' });
      onRefresh?.();
    } catch (err) {
      setStatus({ state: 'error', text: errorMessage(err, 'Could not delete that post.') });
    }
  };

  const moveToFolderAndSave = (postId, folderName) => {
    const next = moveToFolder(posts, postId, folderName);
    if (next !== posts) save(next);
  };
  const removeFromFolderAndSave = (postId) => {
    const next = removeFromFolder(posts, postId);
    if (next !== posts) save(next);
  };

  // ── Arrange view ────────────────────────────────────────────────────────────

  const startArranging = async () => {
    setArranging(true);
    setStatus({ state: 'idle', text: '' });
    if (!hasMore) return;
    setLoadingAll(true);
    try {
      await loadAll();
    } catch (err) {
      setStatus({ state: 'error', text: errorMessage(err, 'Could not load all your posts. Try again.') });
      setArranging(false);
    } finally {
      setLoadingAll(false);
    }
  };

  const toggleFolder = (name) => setCollapsedFolders(prev => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });

  // ── Render ──────────────────────────────────────────────────────────────────

  // Arranging numbers the author's whole profile and files posts into folders;
  // that is only right for the Posts tab, so other tabs do not offer it.
  const canArrange = canEdit && arrangeable && posts.length > 1;

  if (arranging) {
    return loadingAll
      ? <p className="profile-arrange-loading" role="status">Loading all your posts…</p>
      : <ProfileArrange posts={posts} pinnedId={pinnedId} onChange={save}
          onDone={() => setArranging(false)} status={status}
          onVisibility={setVisibility} onDelete={removePost} onPin={onPin} />;
  }

  // The arrange view above keeps every post, drafts and their badges included.
  const listed = hideDrafts ? posts.filter(p => p.published) : posts;
  const blocks = toBlocks(listed.filter(p => p.id !== pinnedId));
  const folderNames = toBlocks(listed).filter(b => b.type === 'folder').map(b => b.name);
  const renderPost = (post) => (
    <ProfilePost key={post.id} post={post} canEdit={canEdit} username={username} onRefresh={onRefresh}
      folderNames={folderNames} folderMenu={arrangeable} showDestination={showDestination} onMoveToFolder={moveToFolderAndSave} onRemoveFromFolder={removeFromFolderAndSave} />
  );

  return (
    <>
      {(leading || canArrange || status.state === 'error') && (
        <div className="profile-list-bar">
          {leading}
          {status.state === 'error' && <span className="profile-list-error" role="alert">{status.text}</span>}
          <span className="profile-list-bar-gap" />
          {canArrange && (
            <button type="button" className="profile-owner-btn" onClick={startArranging}>
              <Icon name="grip" size={14} /> Arrange posts
            </button>
          )}
        </div>
      )}
      {pinned}
      {blocks.map(block => (block.type === 'post'
        ? renderPost(block.post)
        : (
          <FolderSection key={block.id} name={block.name} posts={block.posts}
            collapsed={collapsedFolders.has(block.name)} onToggle={() => toggleFolder(block.name)}>
            {block.posts.map(renderPost)}
          </FolderSection>
        )))}
    </>
  );
}
