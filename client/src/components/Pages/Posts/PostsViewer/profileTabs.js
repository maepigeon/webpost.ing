/**
 * The tabs of a profile and how they map to the address (?tab=notes) and to
 * the server's `section` parameter. Pure, so the mapping is tested alone.
 *
 * Posts and Notes are public sections. Drafts (every unpublished post) and
 * Subscribers (private until subscriptions exist) are the owner's alone.
 */
export const TAB_IDS = ['posts', 'notes', 'drafts', 'subscribers'];

const OWNER_ONLY = new Set(['drafts', 'subscribers']);

const SECTION_OF_TAB = { posts: 'profile', notes: 'notes', drafts: 'drafts', subscribers: 'subscribers' };

/** The section a tab asks the server for. */
export function sectionForTab(tab) {
  return SECTION_OF_TAB[tab] || 'profile';
}

/**
 * The tab a query string names, or 'posts'. A tab the reader may not have
 * (the owner's two, for anyone else) falls back to 'posts'.
 */
export function tabFromSearch(search, { isOwner = false } = {}) {
  const raw = new URLSearchParams(search || '').get('tab');
  if (!TAB_IDS.includes(raw)) return 'posts';
  if (OWNER_ONLY.has(raw) && !isOwner) return 'posts';
  return raw;
}

/** The query string for a tab, starting with '?'; empty for the default tab. */
export function searchForTab(tab, search = '') {
  const params = new URLSearchParams(search || '');
  if (!TAB_IDS.includes(tab) || tab === 'posts') params.delete('tab');
  else params.set('tab', tab);
  const text = params.toString();
  return text ? `?${text}` : '';
}

/**
 * The tabs to draw, in order, with their counts. Visitors (and the owner
 * previewing as one) get Posts, and Notes only when there is something public.
 */
export function visibleTabs({ isOwner, counts = {}, publicNotes = null }) {
  const tabs = [{ id: 'posts', label: 'Posts', count: counts.profile }];
  if (isOwner) {
    tabs.push({ id: 'notes', label: 'Notes', count: counts.notes });
    tabs.push({ id: 'drafts', label: 'Drafts', count: counts.drafts });
    tabs.push({ id: 'subscribers', label: 'Subscribers', count: counts.subscribers });
  } else {
    const notes = publicNotes ?? counts.notes ?? 0;
    if (notes > 0) tabs.push({ id: 'notes', label: 'Notes', count: notes });
  }
  return tabs;
}

/** A bar of one tab says nothing: draw it only when there is a choice. */
export function showTabBar(tabs) {
  return Array.isArray(tabs) && tabs.length > 1;
}

/**
 * The number the header's "public posts" and the Posts tab both show: the
 * Posts tab's count for this reader. Until the counts arrive, the number the
 * banner brought.
 */
export function publicPostCount(counts, fallback = 0) {
  return typeof counts?.profile === 'number' ? counts.profile : fallback;
}

/** Where a draft will go once published. */
export function destinationLabel(section) {
  if (section === 'notes') return 'Note';
  if (section === 'subscribers') return 'Subscribers';
  return 'Post';
}

/**
 * Whether the normal (not arranging) list drops unpublished posts. The owner's
 * Posts and Notes tabs list what is published, so the list is as long as the
 * tab's count; a draft lives under Drafts. The arrange view is not asked: it
 * needs the drafts, for Make public and for the order.
 */
export function hidesDrafts(tab, canEdit) {
  return Boolean(canEdit) && (tab === 'posts' || tab === 'notes');
}

/** The posts the normal view of this tab lists. */
export function listedPosts(posts, { tab, canEdit }) {
  if (!Array.isArray(posts) || !hidesDrafts(tab, canEdit)) return posts;
  return posts.filter(p => p && p.published);
}

/**
 * True when what is loaded has nothing to show but the list goes on: a page
 * made only of drafts. The profile then asks for the next page itself rather
 * than leaving the owner looking at an empty tab with more to load.
 */
export function listRunsOn({ listedCount, loadedCount, hasMore }) {
  return listedCount === 0 && loadedCount > 0 && Boolean(hasMore);
}

const NO_BANNER = { joined: null, publicPosts: 0, grid: null };

/**
 * The profile's state, read from one profile-summary answer. Every field has
 * the shape the page already keeps, with its empty value when the answer
 * lacks it (an older server, a missing part).
 */
export function profileFromSummary(data) {
  const d = data || {};
  const bioLinks = Array.isArray(d.bioLinks) ? d.bioLinks : [];
  return {
    bgPattern: d.background || '',
    header: { headerPath: d.header?.headerPath || null, headerInk: d.header?.headerInk || 'auto' },
    bio: d.bio || '',
    bioLinks,
    avatar: d.avatarPath || '',
    onlineStatus: d.online === undefined ? null : { online: Boolean(d.online), lastSeen: d.lastSeen || '' },
    banner: d.banner
      ? { joined: d.banner.joined || null, publicPosts: d.banner.publicPosts || 0, grid: d.banner.grid || null }
      : NO_BANNER,
    counts: d.counts || {},
    publicNotes: typeof d.publicNotes === 'number' ? d.publicNotes : null,
    followCounts: { followers: d.follows?.followers || 0, following: d.follows?.following || 0 },
    followsMe: Boolean(d.follows?.followsMe),
    pinnedPost: d.pinnedPost || null,
    dmBlocked: Boolean(d.dm?.blocked),
    dmBlockedByThem: Boolean(d.dm?.blockedByThem),
  };
}
