import { useState, useCallback, useRef, useEffect } from 'react';
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
import Icon from '../../../Icon/Icon.jsx';

/**
 * Where a post should land when dropped on a folder header rather than on a
 * specific post: at the end of that folder's contents, or at the end of the
 * ungrouped posts.
 */
function lastIndexOfFolder(posts, folder) {
  let index = -1;
  posts.forEach((p, i) => {
    if ((p.folder || null) === folder) index = i;
  });
  return index === -1 ? posts.length : index + 1;
}

/** How long the pointer must rest over a target before the order previews. */
const PREVIEW_DELAY_MS = 700;

// ── Sortable folder section (glass panel + drag handle in header) ─────────────

function SortableFolderSection({
  id, name, posts, canEdit, collapsed, onToggle, isDragOver, children,
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
          <button type="button" className="profile-folder-toggle-btn" onClick={onToggle}
            title={collapsed ? 'Expand folder' : 'Collapse folder'}>
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
        <div className={canEdit ? 'profile-post-card-wrap' : 'profile-post-card-wrap--view'}>
          {/* The handle lives inside the card so it reads as part of the glass
              panel rather than as a control floating beside it. */}
          {canEdit && (
            <div className="profile-post-drag-handle" {...attributes} {...listeners}
              title="Hold and drag to reorder" aria-label="Reorder post">
              <span aria-hidden="true">⠿</span>
            </div>
          )}
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
                      aria-label="Create folder"
                    ><Icon name="plus" size={14} /></button>
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
  const [activeId, setActiveId] = useState(null);
  const [overId, setOverId] = useState(null);

  /**
   * Drop preview.
   *
   * While dragging, dnd-kit reports what the pointer is over, but the list
   * itself does not change until the drop — so you commit to a position without
   * seeing it. Dwelling over a target for PREVIEW_DELAY_MS applies the reorder
   * visually, letting you check the result before releasing. Nothing is saved
   * until drag end; this is purely what is drawn.
   */
  const [previewOverId, setPreviewOverId] = useState(null);
  const dwellTimerRef = useRef(null);
  const dwellTargetRef = useRef(null);

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

  /**
   * What actually gets rendered. Once the dwell timer has fired, the dragged
   * item is shown in the position it would land in, so the new order is visible
   * before the drop. Falls back to the real order at every other moment.
   */
  const previewItems = (() => {
    if (!activeId || !previewOverId || activeId === previewOverId) return displayItems;
    const from = displayItems.findIndex(d => d.id === String(activeId));
    const to   = displayItems.findIndex(d => d.id === String(previewOverId));
    if (from === -1 || to === -1) return displayItems;
    return arrayMove(displayItems, from, to);
  })();

  const isPreviewing = previewItems !== displayItems;

  /**
   * True when releasing now would file the dragged post into this folder.
   *
   * Covers hovering the folder's header and hovering any post inside it, and is
   * false when the post is already in that folder — highlighting a no-op move
   * suggests something will happen when nothing will. The header's highlight
   * was previously hardcoded to false, so filing a post by dragging gave no
   * feedback at all.
   */
  function folderIsDropTarget(folderName) {
    if (!activeId || !overId) return false;
    const dragged = localPosts.find(p => String(p.id) === String(activeId));
    if (!dragged || (dragged.folder || null) === folderName) return false;

    const overStr = String(overId);
    if (overStr === 'folder:' + folderName) return true;
    const overPost = localPosts.find(p => String(p.id) === overStr);
    return !!overPost && overPost.folder === folderName;
  }

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

  const clearDwell = useCallback(() => {
    if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
    dwellTimerRef.current = null;
    dwellTargetRef.current = null;
  }, []);

  // Never leave a timer running behind an unmounted component.
  useEffect(() => clearDwell, [clearDwell]);

  const handleDragStart = ({ active }) => {
    setActiveId(active.id);
    setPreviewOverId(null);
    clearDwell();
  };

  const handleDragOver = ({ over }) => {
    const id = over?.id ?? null;
    setOverId(id);

    // Restart the clock whenever the target changes, so the preview only fires
    // once the pointer has settled rather than flickering through everything
    // it passes over.
    if (dwellTargetRef.current === id) return;
    clearDwell();
    dwellTargetRef.current = id;
    if (id == null) { setPreviewOverId(null); return; }
    dwellTimerRef.current = setTimeout(() => setPreviewOverId(id), PREVIEW_DELAY_MS);
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setOverId(null);
    setPreviewOverId(null);
    clearDwell();
  };

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null);
    setOverId(null);
    setPreviewOverId(null);
    clearDwell();
    if (!over || active.id === over.id) return;

    const activeStr = String(active.id);
    const overStr = String(over.id);

    const activeDispIdx = displayItems.findIndex(d => d.id === activeStr);
    const overDispIdx = displayItems.findIndex(d => d.id === overStr);

    const draggedPost = localPosts.find(p => String(p.id) === activeStr);
    const droppedOnPost = localPosts.find(p => String(p.id) === overStr);

    /**
     * Which folder, if any, the drop lands in.
     *
     * Dropping on a folder's header, or on any post inside it, means "put this
     * in that folder". Dropping on an ungrouped post means "put it beside that
     * post, outside any folder". Previously a post dragged onto a folder was
     * reordered *next to* the folder instead of going into it, so there was no
     * way to file a post by dragging at all.
     */
    const dropTargetFolder =
      overStr.startsWith('folder:') ? overStr.slice('folder:'.length)
      : droppedOnPost ? (droppedOnPost.folder || null)
      : undefined;

    if (draggedPost && dropTargetFolder !== undefined) {
      const from = draggedPost.folder || null;
      const to = dropTargetFolder || null;

      if (from !== to) {
        // Moving between folders, or in or out of one. The post is placed just
        // after whatever it was dropped on, so the drop position is respected
        // rather than always appending to the end.
        const without = localPosts.filter(p => String(p.id) !== activeStr);
        const moved = { ...draggedPost, folder: to };
        const anchor = droppedOnPost
          ? without.findIndex(p => String(p.id) === overStr) + 1
          : lastIndexOfFolder(without, to);
        const updated = [...without.slice(0, anchor), moved, ...without.slice(anchor)];
        setLocalPosts(updated);
        persistOrder(updated);
        return;
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
        onDragCancel={handleDragCancel}
      >
        {/* Outer context: folder sections + ungrouped posts */}
        <SortableContext items={outerIds} strategy={verticalListSortingStrategy}>
          {isPreviewing && (
            <p className="profile-drop-preview-note" role="status">
              Preview of the new order — release to save, or press Escape to cancel
            </p>
          )}
          {previewItems.map(item => {
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
                  isDragOver={folderIsDropTarget(item.name)}
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

    </>
  );
}
