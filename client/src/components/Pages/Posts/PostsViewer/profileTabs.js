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

/** Where a draft will go once published. */
export function destinationLabel(section) {
  if (section === 'notes') return 'Note';
  if (section === 'subscribers') return 'Subscribers';
  return 'Post';
}
