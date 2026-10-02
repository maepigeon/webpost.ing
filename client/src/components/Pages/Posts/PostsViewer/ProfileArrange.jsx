import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext, DragOverlay, KeyboardSensor, MeasuringStrategy, MouseSensor, TouchSensor,
  closestCenter, defaultDropAnimationSideEffects, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Icon from '../../../Icon/Icon.jsx';
import { postDateline } from '../../../../utils/postDate.js';
import {
  toBlocks, toRows, projectPost, dropPost, dropFolder, withoutOwnPosts, snapFolderIndex,
} from './profileOrder.js';
import './ProfileArrange.css';

/**
 * Arranging a profile: every post as one compact row, dragged into order.
 *
 * Dragging full posts was the old way, and a post can be a screen tall, so
 * moving one past a few others meant dragging and scrolling at once while
 * the target kept jumping. Here each post is a single line.
 *
 * Folders: a folder's posts sit indented under it. Where a post is dropped
 * decides its folder: among a folder's posts it joins it, outside it leaves.
 * Just below a folder's last post it stays outside unless dragged a little
 * to the right (the lifted row says "into X" or "out of X"). Dragging a
 * folder moves it with all its posts. Its slot keeps their height, so the
 * list does not jump when it is picked up. It passes other folders whole and
 * never lands inside one.
 *
 * Every drop saves at once through onChange; nothing waits for "Done".
 */

/** The keyboard keys for moving a post, shown as a grid of tiles. */
const KEYS = [
  ['Tab', 'next grip'], ['Space / Enter', 'pick up, drop'], ['↑ ↓', 'move up or down'],
  ['→', 'into the folder above'], ['←', 'out of the folder'], ['Esc', 'cancel, put it back'],
];

/** How far one level of indent is, in pixels: also how far to drag sideways. */
const INDENT = 28;

/**
 * Keyboard moves while a row is lifted. Up and down go to the next row, as
 * dnd-kit's sortable default does; left and right move the row one indent
 * sideways, which is how a post goes into or out of the folder above, the
 * same as dragging it sideways with the pointer.
 */
function arrangeKeyboardCoordinates(event, args) {
  const { currentCoordinates } = args;
  if (event.code === 'ArrowRight') return { ...currentCoordinates, x: currentCoordinates.x + INDENT };
  if (event.code === 'ArrowLeft') return { ...currentCoordinates, x: currentCoordinates.x - INDENT };
  return sortableKeyboardCoordinates(event, args);
}

const CSS_ESCAPE = (value) => (window.CSS?.escape ? window.CSS.escape(value) : value);

const INDENT_TRANSITION = 'margin-left 180ms cubic-bezier(0.34, 1.56, 0.64, 1)';

const dropAnimation = {
  duration: 220,
  easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.35' } } }),
};

function Badges({ post, pinnedId }) {
  return (
    <>
      {post.id === pinnedId && <span className="arrange-badge">Pinned</span>}
      {!post.published && <span className="arrange-badge arrange-badge--draft">Draft</span>}
    </>
  );
}

/** What a row shows, whether in the list or lifted under the pointer. */
function RowBody({ row, pinnedId, handle }) {
  if (row.type === 'folder') {
    return (
      <>
        {handle}
        <span className="arrange-row-icon"><Icon name="folder" size={16} strokeWidth={2} /></span>
        <span className="arrange-row-title arrange-row-title--folder">{row.name}</span>
        <span className="arrange-count">{row.count} {row.count === 1 ? 'post' : 'posts'}</span>
      </>
    );
  }
  const dateline = postDateline(row.post.date);
  return (
    <>
      {handle}
      <span className="arrange-row-title">{row.post.title || 'Untitled'}</span>
      <Badges post={row.post} pinnedId={pinnedId} />
      {dateline.text && <time className="arrange-row-date" dateTime={dateline.iso}>{dateline.text}</time>}
    </>
  );
}

function SortableRow({ row, pinnedId, depth, isSlot, slotHeight }) {
  const {
    attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition,
  } = useSortable({ id: row.id });

  const label = row.type === 'folder'
    ? `Move folder ${row.name}`
    : `Move ${row.post.title || 'untitled post'}`;
  const handle = (
    <button type="button" ref={setActivatorNodeRef} className="arrange-grip"
      aria-label={label} title="Drag to move" {...attributes} {...listeners}>
      <Icon name="grip" size={16} />
    </button>
  );

  return (
    <li ref={setNodeRef} data-row-id={row.id}
      className={`arrange-row arrange-row--${row.type}${isSlot ? ' arrange-row--slot' : ''}`}
      style={{
        transform: CSS.Translate.toString(transform),
        // dnd-kit's transition slides rows aside; the indent springs on its own.
        transition: [transition, INDENT_TRANSITION].filter(Boolean).join(', '),
        '--depth': depth,
        height: slotHeight || undefined,
      }}>
      <RowBody row={row} pinnedId={pinnedId} handle={handle} />
    </li>
  );
}

export default function ProfileArrange({ posts, pinnedId, onChange, onDone, status }) {
  const [activeId, setActiveId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [dx, setDx] = useState(0);
  // A lifted folder's slot keeps the height of the folder and its posts.
  const [folderSlotHeight, setFolderSlotHeight] = useState(0);

  // Folders made here that no post is in yet.
  const [emptyFolders, setEmptyFolders] = useState([]);
  const [naming, setNaming] = useState(false);
  const [folderName, setFolderName] = useState('');
  const takenNames = useMemo(() => new Set([...posts.map(p => p.folder).filter(Boolean), ...emptyFolders]), [posts, emptyFolders]);
  const nameError = !folderName.trim() ? '' : takenNames.has(folderName.trim()) ? 'You already have a folder with that name.' : '';
  const addFolder = () => {
    const name = folderName.trim();
    if (!name || takenNames.has(name)) return;
    setEmptyFolders(list => [name, ...list]);
    setFolderName('');
    setNaming(false);
  };

  const blocks = useMemo(() => toBlocks(posts, emptyFolders), [posts, emptyFolders]);
  const rows = useMemo(() => toRows(blocks), [blocks]);

  const activeRow = activeId ? rows.find(r => r.id === activeId) : null;
  const movingFolder = activeRow?.type === 'folder';
  // A moving folder's posts travel with it, so they leave the list; its slot
  // keeps their space, so nothing else moves when the folder is picked up.
  const shown = movingFolder ? withoutOwnPosts(rows, activeId) : rows;

  // The rows make way where the folder will really land: past another folder
  // whole, never between its posts.
  const strategy = useMemo(() => (movingFolder
    ? (args) => verticalListSortingStrategy({
      ...args,
      overIndex: args.overIndex < 0 ? args.overIndex : snapFolderIndex(shown, args.activeIndex, args.overIndex),
    })
    : verticalListSortingStrategy), [movingFolder, shown]);

  const projection = activeRow && !movingFolder && overId
    ? projectPost(rows, activeId, overId, dx, INDENT)
    : null;

  // A lifted folder is compared with its own slot by the slot's top, a
  // header's height: the whole slot is as tall as the folder, and its centre
  // would sit so low that the row above looked closer the moment it lifted.
  const collisionDetection = useCallback((args) => {
    if (!movingFolder) return closestCenter(args);
    const rects = new Map(args.droppableRects);
    const slot = rects.get(activeId);
    const headerHeight = args.active?.rect.current.initial?.height;
    if (slot && headerHeight) rects.set(activeId, { ...slot, height: headerHeight, bottom: slot.top + headerHeight });
    return closestCenter({ ...args, droppableRects: rects });
  }, [movingFolder, activeId]);

  const sensors = useSensors(
    // Mouse and touch separately: a pointer sensor also takes touches and
    // starts at once, so a quick swipe over a grip reordered posts instead of
    // scrolling. A finger has to rest on the grip a moment to lift the row.
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: arrangeKeyboardCoordinates }),
  );

  const [showKeys, setShowKeys] = useState(false);

  // While arranging, the page's scroll-to-top button would sit over the
  // last rows, exactly where a thumb needs to drop.
  useEffect(() => {
    document.body.classList.add('is-arranging');
    return () => document.body.classList.remove('is-arranging');
  }, []);

  /** How a row is named to a screen reader: its title, not its internal id. */
  const nameOf = (id) => {
    const row = rows.find(r => r.id === id);
    if (!row) return 'the item';
    return row.type === 'folder' ? `folder ${row.name}` : `post ${row.post.title || 'Untitled'}`;
  };
  const accessibility = {
    screenReaderInstructions: {
      draggable: 'To move this, press Space or Enter. Up and down arrows move it; right and left put a post '
        + 'into or out of the folder above; Space or Enter drops it; Escape cancels.',
    },
    announcements: {
      onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}.`,
      onDragOver: ({ active, over }) => (over && over.id !== active.id
        ? `${nameOf(active.id)} is at ${nameOf(over.id)}.` : `${nameOf(active.id)} is back where it started.`),
      onDragEnd: ({ active }) => `Dropped ${nameOf(active.id)}.`,
      onDragCancel: ({ active }) => `Cancelled. ${nameOf(active.id)} is back where it was.`,
    },
  };

  const reset = () => { setActiveId(null); setOverId(null); setDx(0); setFolderSlotHeight(0); };

  const handleDragStart = ({ active }) => {
    const row = rows.find(r => r.id === active.id);
    if (row?.type === 'folder') {
      // Measured before its posts leave the list: header top to last post bottom.
      const own = rows.filter(r => r.type === 'post' && r.depth === 1 && r.post.folder === row.name);
      const top = document.querySelector(`[data-row-id="${CSS_ESCAPE(row.id)}"]`);
      const last = own.length && document.querySelector(`[data-row-id="${CSS_ESCAPE(own[own.length - 1].id)}"]`);
      if (top && last) setFolderSlotHeight(last.getBoundingClientRect().bottom - top.getBoundingClientRect().top);
    }
    setActiveId(active.id);
    setOverId(active.id);
  };

  const handleDragEnd = ({ active, over }) => {
    const from = activeRow;
    const depth = projection?.depth;
    reset();
    if (!over || !from) return;
    const next = from.type === 'folder'
      ? dropFolder(rows, active.id, over.id)
      : dropPost(rows, active.id, over.id, depth ?? from.depth);
    if (changed(posts, next)) onChange(next);
  };

  /**
   * What the lifted row says when dropping would change the post's folder.
   * On the lifted row, not the slot: the row sits right over the slot and
   * would hide it.
   */
  let dropNote = null;
  if (projection && activeRow) {
    const was = activeRow.post.folder || null;
    if (projection.folder !== was) dropNote = projection.folder ? `into ${projection.folder}` : `out of ${was}`;
  }

  return (
    <section className="arrange" aria-label="Arrange posts">
      <header className="arrange-head">
        <div className="arrange-head-text">
          <h2 className="arrange-title">Arrange posts</h2>
        </div>
        <div className="arrange-head-side">
          <span className={`arrange-status arrange-status--${status.state}`} role="status">{status.text}</span>
          <button type="button" className="arrange-new-folder" onClick={() => setNaming(v => !v)} aria-expanded={naming}>
            <Icon name="plus" size={12} /> New folder
          </button>
          <button type="button" className={`arrange-info${showKeys ? ' is-on' : ''}`}
            aria-expanded={showKeys} aria-controls="arrange-keys" title="Keyboard keys"
            onClick={() => setShowKeys(v => !v)}>
            <span aria-hidden="true">i</span><span className="visually-hidden">Keyboard keys</span>
          </button>
          <button type="button" className="arrange-done" onClick={onDone}>Done</button>
        </div>
      </header>

      {naming && (
        <form className="arrange-folder-form" onSubmit={e => { e.preventDefault(); addFolder(); }}>
          <input type="text" value={folderName} onChange={e => setFolderName(e.target.value)} maxLength={60}
            placeholder="Folder name" aria-label="Folder name" autoFocus
            onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); setNaming(false); } }} />
          <button type="submit" className="arrange-done" disabled={!folderName.trim() || Boolean(nameError)}>Add</button>
          {nameError && <span className="arrange-folder-error" role="alert">{nameError}</span>}
        </form>
      )}

      {showKeys && (
        <div id="arrange-keys" className="arrange-keys" role="region" aria-label="Keyboard keys">
          {KEYS.map(([key, what]) => (
            <div key={key} className="arrange-key"><kbd>{key}</kbd><span>{what}</span></div>
          ))}
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        // Scroll only with the pointer right at the window's edge. The default
        // (a fifth of the window) scrolled the list away while aiming at rows
        // near the top or bottom.
        // Gentle: near an edge the list creeps rather than racing past the
        // row being aimed at, which matters most for a thumb at the bottom.
        autoScroll={{ threshold: { x: 0, y: 0.08 }, acceleration: 4 }}
        accessibility={accessibility}
        onDragStart={handleDragStart}
        onDragMove={({ delta }) => setDx(delta.x)}
        onDragOver={({ over }) => setOverId(over?.id ?? null)}
        onDragEnd={handleDragEnd}
        onDragCancel={reset}
      >
        <SortableContext items={shown.map(r => r.id)} strategy={strategy}>
          <ol className="arrange-list">
            {shown.map(row => {
              const isSlot = row.id === activeId;
              const depth = isSlot && projection ? projection.depth : row.depth;
              return (
                <SortableRow key={row.id} row={row} pinnedId={pinnedId} depth={depth} isSlot={isSlot}
                  slotHeight={isSlot && movingFolder ? folderSlotHeight : 0} />
              );
            })}
          </ol>
        </SortableContext>

        {/* In a portal on <body>: the page's container carries a transform,
            which would make it, not the viewport, the frame the fixed
            overlay is placed in, so the lifted row would appear far from the
            pointer and dnd-kit, which measures it, would see no row under it. */}
        {createPortal(
          <DragOverlay dropAnimation={dropAnimation}>
            {activeRow && (
              <div className={`arrange-row arrange-row--${activeRow.type} arrange-row--lifted`}>
                <RowBody row={activeRow} pinnedId={pinnedId}
                  handle={<span className="arrange-grip" aria-hidden="true"><Icon name="grip" size={16} /></span>} />
                {dropNote && <span key={dropNote} className="arrange-drop-note">{dropNote}</span>}
              </div>
            )}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>
    </section>
  );
}

/**
 * True when a drop moved something, so dropping a post back where it was
 * saves nothing. `after` is in display order, as every drop returns it.
 */
function changed(before, after) {
  const shownBefore = toRows(toBlocks(before)).filter(r => r.type === 'post').map(r => r.post.id);
  const folderBefore = new Map(before.map(p => [p.id, p.folder || null]));
  return after.some((p, i) => p.id !== shownBefore[i] || (p.folder || null) !== folderBefore.get(p.id));
}
