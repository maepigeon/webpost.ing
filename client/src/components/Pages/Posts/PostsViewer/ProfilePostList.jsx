import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext, PointerSensor, TouchSensor, useSensor, useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import BasicTextPost from '../PostRenderer/BasicTextPost/BasicTextPost.jsx';
import { UPDATE_POST_ORDER } from '../BasicTextPostServerApi.js';
import './ProfilePostList.css';

// ── Folder popup (horizontal scroll of posts in a folder) ────────────────────

function FolderPopup({ name, posts, canEdit, onClose, onRemoveFromFolder, username, onRefresh }) {
  return createPortal(
    <div className="folder-popup-overlay" onClick={onClose}>
      <div className="folder-popup" onClick={e => e.stopPropagation()}>
        <div className="folder-popup-header">
          <span className="folder-popup-title">📁 {name}</span>
          <span className="folder-popup-count">{posts.length} posts</span>
          <button className="folder-popup-close" onClick={onClose}>✕</button>
        </div>
        <div className="folder-popup-scroll">
          {posts.map(p => (
            <div key={p.id} className="folder-popup-card">
              <BasicTextPost
                postdata={p}
                updatePostsFlagCallback={onRefresh}
                uploaded={true}
                hasModifyPermissions={canEdit}
                ownerUsername={username}
              />
              {canEdit && (
                <button className="folder-popup-remove" onClick={() => onRemoveFromFolder(p.id)}
                  title="Remove from folder">
                  ✕ Remove from folder
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Sortable folder section (glass panel + drag handle in header) ─────────────

function SortableFolderSection({
  id, name, posts, canEdit, collapsed, onToggle, onOpenPopup, isDragOver, children,
}) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? 'none' : transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 100 : undefined,
    boxShadow: isDragging
      ? '0 20px 56px rgba(108,99,255,0.30), 0 6px 16px rgba(0,0,0,0.14)'
      : undefined,
  };

  const previewTitles = posts.slice(0, 3).map(p => p.title || 'Untitled');

  return (
    <div ref={setNodeRef} style={style}
      className={`profile-folder-section${isDragging ? ' profile-folder-section--dragging' : ''}`}>
      <div className={`profile-folder-header${isDragOver ? ' profile-folder-header--dragover' : ''}`}>
        {canEdit && (
          <div className="profile-folder-drag-handle" {...attributes} {...listeners}
            title="Drag to reorder folder">
            <span>⠿</span>
          </div>
        )}
        <div className="profile-folder-header-inner">
          <div className="profile-folder-title-row">
            <span className="profile-folder-icon">📁</span>
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
          <button type="button" className="profile-folder-open-btn" onClick={onOpenPopup}
            title="View all posts in this folder">
            View all ↗
          </button>
          <button type="button" className="profile-folder-toggle-btn" onClick={onToggle}
            title={collapsed ? 'Expand folder' : 'Collapse folder'}>
            <span className="profile-folder-chevron"
              style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
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

// ── Sortable post item ────────────────────────────────────────────────────────

function SortablePost({ post, canEdit, username, onRefresh, isOver, folderNames, onMoveToFolder, onRemoveFromFolder }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(post.id),
  });
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const menuRef = useRef(null);

  useEffect(() => {
    if (!showFolderMenu) return;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowFolderMenu(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showFolderMenu]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? 'none' : transition,
    opacity: isDragging ? 0.7 : 1,
    zIndex: isDragging ? 100 : undefined,
    boxShadow: isDragging ? '0 16px 48px rgba(108,99,255,0.28), 0 4px 14px rgba(0,0,0,0.15)' : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}
      className={`profile-post-item${isDragging ? ' profile-post-item--dragging' : ''}${isOver && !isDragging ? ' profile-post-item--drop-target' : ''}`}>
      <div className={`profile-post-row${canEdit ? ' profile-post-row--editable' : ''}`}>
        {canEdit && (
          <div className="profile-post-drag-handle" {...attributes} {...listeners} title="Hold and drag to reorder">
            <span>⠿</span>
          </div>
        )}
        <div className={canEdit ? 'profile-post-card-wrap' : 'profile-post-card-wrap--view'}>
          <BasicTextPost
            postdata={post}
            updatePostsFlagCallback={onRefresh}
            uploaded={true}
            hasModifyPermissions={canEdit}
            ownerUsername={username}
          />
          {canEdit && (
            <div className="profile-post-folder-btn-wrap" ref={menuRef}>
              <button
                className="profile-post-folder-btn"
                title={post.folder ? `In folder: ${post.folder}` : 'Add to folder'}
                onClick={() => setShowFolderMenu(v => !v)}
              >
                {post.folder ? `📁 ${post.folder}` : '📁'}
              </button>
              {showFolderMenu && (
                <div className="profile-post-folder-menu">
                  {folderNames.length > 0 && (
                    <>
                      <div className="profile-post-folder-menu-label">Move to folder</div>
                      {folderNames.map(name => (
                        <button key={name} className={`profile-post-folder-menu-item${post.folder === name ? ' active' : ''}`}
                          onClick={() => { onMoveToFolder(post.id, name); setShowFolderMenu(false); }}>
                          📁 {name}
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
                      value={newFolderName}
                      onChange={e => setNewFolderName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && newFolderName.trim()) {
                          onMoveToFolder(post.id, newFolderName.trim());
                          setNewFolderName('');
                          setShowFolderMenu(false);
                        }
                        if (e.key === 'Escape') setShowFolderMenu(false);
                      }}
                      autoFocus
                    />
                    <button
                      className="profile-post-folder-new-btn"
                      disabled={!newFolderName.trim()}
                      onClick={() => { if (newFolderName.trim()) { onMoveToFolder(post.id, newFolderName.trim()); setNewFolderName(''); setShowFolderMenu(false); } }}
                    >+</button>
                  </div>
                  {post.folder && (
                    <button className="profile-post-folder-menu-item profile-post-folder-menu-item--remove"
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
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ProfilePostList({ posts, canEdit, username, onRefresh }) {
  const [localPosts, setLocalPosts] = useState(posts);
  const [collapsedFolders, setCollapsedFolders] = useState(new Set());
  const [openFolder, setOpenFolder] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [overId, setOverId] = useState(null);

  // Sync only when the parent's set of post IDs actually changes (post added/deleted),
  // not on every re-render — avoids reverting locally-reordered posts.
  const parentIdsKey = posts.map(p => p.id).join(',');
  const lastParentIdsRef = useRef(parentIdsKey);
  useEffect(() => {
    if (lastParentIdsRef.current === parentIdsKey) return;
    lastParentIdsRef.current = parentIdsKey;
    if (!activeId) setLocalPosts(posts);
  }, [parentIdsKey, posts, activeId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 6 } }),
  );

  // ── Derived data ────────────────────────────────────────────────────────────

  const ungrouped = localPosts.filter(p => !p.folder);
  const folderMap = {};
  for (const p of localPosts) {
    if (p.folder) {
      if (!folderMap[p.folder]) folderMap[p.folder] = [];
      folderMap[p.folder].push(p);
    }
  }
  const folderNames = Object.keys(folderMap);

  // Interleave folder groups and ungrouped posts in sort_order position
  const displayItems = [
    ...folderNames.map(name => ({
      type: 'folder',
      id: 'folder:' + name,
      name,
      posts: folderMap[name],
      sortKey: Math.min(...folderMap[name].map(x => x.sort_order ?? 0)),
    })),
    ...ungrouped.map(p => ({
      type: 'post',
      id: String(p.id),
      post: p,
      sortKey: p.sort_order ?? 0,
    })),
  ].sort((a, b) => a.sortKey - b.sortKey);

  const outerIds = displayItems.map(d => d.id);

  // ── Persist ─────────────────────────────────────────────────────────────────

  // persistOrder: when reorderOnly=true, preserve existing sort_order values (folder change only).
  const persistOrder = useCallback((updatedPosts, reorderOnly = false) => {
    const updates = updatedPosts.map((p, i) => ({
      id: p.id,
      sortOrder: reorderOnly ? (p.sort_order ?? i) : i,
      folder: p.folder || null,
    }));
    UPDATE_POST_ORDER(username, updates).catch(() => {});
  }, [username]);

  // ── Drag handlers ───────────────────────────────────────────────────────────

  const handleDragStart = ({ active }) => setActiveId(active.id);

  const handleDragOver = ({ over }) => {
    setOverId(over?.id ?? null);
  };

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null);
    setOverId(null);
    if (!over || active.id === over.id) return;

    const activeStr = String(active.id);
    const overStr = String(over.id);

    const activeDispIdx = displayItems.findIndex(d => d.id === activeStr);
    let overDispIdx = displayItems.findIndex(d => d.id === overStr);

    // If the active item is from the outer list but over landed on a post inside a folder
    // (inner SortableContext captured it), redirect over to the folder container instead.
    if (activeDispIdx >= 0 && overDispIdx < 0) {
      const overPost = localPosts.find(p => String(p.id) === overStr);
      if (overPost?.folder) {
        overDispIdx = displayItems.findIndex(d => d.type === 'folder' && d.name === overPost.folder);
      }
    }

    // ── Both items in the outer display list: reorder (folder↔post and folder↔folder) ──
    if (activeDispIdx >= 0 && overDispIdx >= 0) {
      if (activeDispIdx === overDispIdx) return;
      const reordered = arrayMove(displayItems, activeDispIdx, overDispIdx);
      const flatPosts = reordered.flatMap(d => d.type === 'folder' ? d.posts : [d.post]);
      setLocalPosts(flatPosts);
      persistOrder(flatPosts);
      return;
    }

    // ── Inner context: reorder within the same folder, or drag a folder post to ungrouped ──
    const activePost = localPosts.find(p => String(p.id) === activeStr);
    const overPost   = localPosts.find(p => String(p.id) === overStr);
    if (!activePost || !overPost) return;

    const sourceFolder = activePost.folder || null;
    const targetFolder = overPost.folder || null;

    if (sourceFolder === targetFolder) {
      const group = sourceFolder
        ? localPosts.filter(p => p.folder === sourceFolder)
        : localPosts.filter(p => !p.folder);
      const oldIdx = group.findIndex(p => String(p.id) === activeStr);
      const newIdx = group.findIndex(p => String(p.id) === overStr);
      if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return;
      const reordered = arrayMove(group, oldIdx, newIdx);
      let i = 0;
      const updated = localPosts.map(p =>
        (sourceFolder ? p.folder === sourceFolder : !p.folder) ? { ...reordered[i++] } : p
      );
      setLocalPosts(updated);
      persistOrder(updated);
    } else {
      // Drag a post from a folder onto an ungrouped post → remove from folder
      const updated = localPosts.map(p =>
        String(p.id) === activeStr ? { ...p, folder: targetFolder } : p
      );
      setLocalPosts(updated);
      persistOrder(updated, true);
    }
  };

  // ── Folder helpers ──────────────────────────────────────────────────────────

  const moveToFolder = (postId, folderName) => {
    const updated = localPosts.map(p =>
      p.id === postId ? { ...p, folder: folderName || null } : p
    );
    setLocalPosts(updated);
    persistOrder(updated, true); // preserve sort_order; only change folder
  };

  const removeFromFolder = (postId) => {
    const updated = localPosts.map(p =>
      p.id === postId ? { ...p, folder: null } : p
    );
    setLocalPosts(updated);
    persistOrder(updated, true); // preserve sort_order; only change folder
  };

  const toggleFolder = (name) => setCollapsedFolders(prev => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        {/* Outer context: folder sections + ungrouped posts */}
        <SortableContext items={outerIds} strategy={verticalListSortingStrategy}>
          {displayItems.map(item => {
            if (item.type === 'folder') {
              const innerIds = item.posts.map(p => String(p.id));
              return (
                <SortableFolderSection
                  key={item.name}
                  id={item.id}
                  name={item.name}
                  posts={item.posts}
                  canEdit={canEdit}
                  collapsed={collapsedFolders.has(item.name)}
                  onToggle={() => toggleFolder(item.name)}
                  onOpenPopup={() => setOpenFolder(item.name)}
                  isDragOver={false}
                >
                  {/* Inner context: posts within this folder */}
                  <SortableContext items={innerIds} strategy={verticalListSortingStrategy}>
                    {item.posts.map(p => (
                      <SortablePost
                        key={p.id}
                        post={p}
                        canEdit={canEdit}
                        username={username}
                        onRefresh={onRefresh}
                        isOver={overId === String(p.id) && activeId !== String(p.id)}
                        folderNames={folderNames}
                        onMoveToFolder={moveToFolder}
                        onRemoveFromFolder={removeFromFolder}
                      />
                    ))}
                  </SortableContext>
                </SortableFolderSection>
              );
            }

            return (
              <SortablePost
                key={item.post.id}
                post={item.post}
                canEdit={canEdit}
                username={username}
                onRefresh={onRefresh}
                isOver={overId === item.id && activeId !== item.id}
                folderNames={folderNames}
                onMoveToFolder={moveToFolder}
                onRemoveFromFolder={removeFromFolder}
              />
            );
          })}
        </SortableContext>

      </DndContext>

      {/* Folder popup */}
      {openFolder && folderMap[openFolder] && (
        <FolderPopup
          name={openFolder}
          posts={folderMap[openFolder]}
          canEdit={canEdit}
          onClose={() => setOpenFolder(null)}
          onRemoveFromFolder={removeFromFolder}
          username={username}
          onRefresh={onRefresh}
        />
      )}
    </>
  );
}
