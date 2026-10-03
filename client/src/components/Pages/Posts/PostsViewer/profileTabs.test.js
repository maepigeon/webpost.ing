import { describe, it, expect } from 'vitest';
import { tabFromSearch, searchForTab, sectionForTab, visibleTabs, destinationLabel, showTabBar, publicPostCount, hidesDrafts, listedPosts, listRunsOn, profileFromSummary } from './profileTabs.js';

describe('tabFromSearch', () => {
  it('defaults to posts', () => {
    expect(tabFromSearch('')).toBe('posts');
    expect(tabFromSearch('?tab=nonsense', { isOwner: true })).toBe('posts');
  });
  it('reads a public tab for anyone', () => {
    expect(tabFromSearch('?tab=notes')).toBe('notes');
  });
  it('keeps the owner tabs for the owner only', () => {
    expect(tabFromSearch('?tab=drafts', { isOwner: true })).toBe('drafts');
    expect(tabFromSearch('?tab=subscribers', { isOwner: true })).toBe('subscribers');
    expect(tabFromSearch('?tab=drafts')).toBe('posts');
    expect(tabFromSearch('?tab=subscribers')).toBe('posts');
  });
});

describe('searchForTab', () => {
  it('leaves no parameter for the default tab', () => {
    expect(searchForTab('posts')).toBe('');
    expect(searchForTab('posts', '?tab=notes')).toBe('');
  });
  it('sets the tab and keeps other parameters', () => {
    expect(searchForTab('notes')).toBe('?tab=notes');
    expect(searchForTab('drafts', '?x=1&tab=notes')).toBe('?x=1&tab=drafts');
  });
});

describe('sectionForTab', () => {
  it('maps tabs to the server sections', () => {
    expect(sectionForTab('posts')).toBe('profile');
    expect(sectionForTab('notes')).toBe('notes');
    expect(sectionForTab('drafts')).toBe('drafts');
    expect(sectionForTab('subscribers')).toBe('subscribers');
    expect(sectionForTab('x')).toBe('profile');
  });
});

describe('visibleTabs', () => {
  const counts = { profile: 3, notes: 2, drafts: 1, subscribers: 0 };
  it('gives the owner all four with counts', () => {
    const tabs = visibleTabs({ isOwner: true, counts });
    expect(tabs.map(t => t.id)).toEqual(['posts', 'notes', 'drafts', 'subscribers']);
    expect(tabs.map(t => t.count)).toEqual([3, 2, 1, 0]);
  });
  it('gives a visitor Posts, and Notes only when some are public', () => {
    expect(visibleTabs({ isOwner: false, counts: { profile: 3, notes: 0 } }).map(t => t.id)).toEqual(['posts']);
    expect(visibleTabs({ isOwner: false, counts: { profile: 3, notes: 2 } }).map(t => t.id)).toEqual(['posts', 'notes']);
  });
  it('uses the public note count when previewing', () => {
    expect(visibleTabs({ isOwner: false, counts, publicNotes: 0 }).map(t => t.id)).toEqual(['posts']);
    expect(visibleTabs({ isOwner: false, counts, publicNotes: 1 }).map(t => t.id)).toEqual(['posts', 'notes']);
  });
});

describe('destinationLabel', () => {
  it('says where a draft will go', () => {
    expect(destinationLabel('profile')).toBe('Post');
    expect(destinationLabel(undefined)).toBe('Post');
    expect(destinationLabel('notes')).toBe('Note');
    expect(destinationLabel('subscribers')).toBe('Subscribers');
  });
});

describe('showTabBar', () => {
  it('hides a bar of one tab and shows a real choice', () => {
    expect(showTabBar(visibleTabs({ isOwner: false, counts: { profile: 3, notes: 0 } }))).toBe(false);
    expect(showTabBar(visibleTabs({ isOwner: false, counts: { profile: 3, notes: 2 } }))).toBe(true);
    expect(showTabBar(visibleTabs({ isOwner: true, counts: {} }))).toBe(true);
    expect(showTabBar([])).toBe(false);
    expect(showTabBar(undefined)).toBe(false);
  });
});

describe('publicPostCount', () => {
  it('is the Posts tab number, so the header and the tab agree', () => {
    const counts = { profile: 4, notes: 2 };
    expect(publicPostCount(counts, 9)).toBe(4);
    expect(publicPostCount(counts, 9)).toBe(visibleTabs({ isOwner: false, counts })[0].count);
  });
  it('is zero when the reader has no posts, not the banner\'s number', () => {
    expect(publicPostCount({ profile: 0 }, 9)).toBe(0);
  });
  it('falls back to the banner\'s number until the counts arrive', () => {
    expect(publicPostCount({}, 9)).toBe(9);
    expect(publicPostCount(undefined)).toBe(0);
  });
});

describe('hidesDrafts and listedPosts', () => {
  const posts = [{ id: 1, published: true }, { id: 2, published: false }, { id: 3, published: true }];

  it('drops drafts from the owner\'s Posts and Notes lists only', () => {
    expect(hidesDrafts('posts', true)).toBe(true);
    expect(hidesDrafts('notes', true)).toBe(true);
    expect(hidesDrafts('drafts', true)).toBe(false);
    expect(hidesDrafts('subscribers', true)).toBe(false);
    expect(hidesDrafts('posts', false)).toBe(false);
  });
  it('lists as many posts as the tab counts', () => {
    expect(listedPosts(posts, { tab: 'posts', canEdit: true }).map(p => p.id)).toEqual([1, 3]);
    expect(listedPosts(posts, { tab: 'posts', canEdit: true })).toHaveLength(2);
  });
  it('leaves other lists whole, and anything that is not a list alone', () => {
    expect(listedPosts(posts, { tab: 'drafts', canEdit: true })).toBe(posts);
    expect(listedPosts(posts, { tab: 'posts', canEdit: false })).toBe(posts);
    expect(listedPosts(undefined, { tab: 'posts', canEdit: true })).toBeUndefined();
  });
});

describe('listRunsOn', () => {
  it('is true for a loaded page with nothing to show while more remains', () => {
    expect(listRunsOn({ listedCount: 0, loadedCount: 20, hasMore: true })).toBe(true);
  });
  it('is false when something shows, when the list ended, or when nothing has loaded yet', () => {
    expect(listRunsOn({ listedCount: 1, loadedCount: 20, hasMore: true })).toBe(false);
    expect(listRunsOn({ listedCount: 0, loadedCount: 20, hasMore: false })).toBe(false);
    expect(listRunsOn({ listedCount: 0, loadedCount: 0, hasMore: true })).toBe(false);
  });
});

describe('profileFromSummary', () => {
  it('reads one summary into the state the page keeps', () => {
    const p = profileFromSummary({
      username: 'mae', joined: '2025-01-01T00:00:00Z', online: true, lastSeen: '2026-01-01T00:00:00Z',
      bio: 'hi', bioLinks: [{ label: 'Site', url: 'https://example.com' }], avatarPath: '/uploads/a.png',
      header: { headerPath: '/h.png', headerInk: 'light' }, background: '{"w":1}',
      banner: { joined: '2025-01-01T00:00:00Z', publicPosts: 3, cols: 32, grid: { rows: 1 } },
      counts: { profile: 3, notes: 1 }, publicNotes: 1,
      follows: { followers: 5, following: 7, followsMe: true },
      pinnedPost: { id: 9, title: 'Pinned' }, dm: { blocked: true, blockedByThem: false },
    });
    expect(p.bio).toBe('hi');
    expect(p.bioLinks).toHaveLength(1);
    expect(p.avatar).toBe('/uploads/a.png');
    expect(p.header).toEqual({ headerPath: '/h.png', headerInk: 'light' });
    expect(p.bgPattern).toBe('{"w":1}');
    expect(p.banner).toEqual({ joined: '2025-01-01T00:00:00Z', publicPosts: 3, grid: { rows: 1 } });
    expect(p.counts).toEqual({ profile: 3, notes: 1 });
    expect(p.publicNotes).toBe(1);
    expect(p.followCounts).toEqual({ followers: 5, following: 7 });
    expect(p.followsMe).toBe(true);
    expect(p.pinnedPost.id).toBe(9);
    expect(p.onlineStatus).toEqual({ online: true, lastSeen: '2026-01-01T00:00:00Z' });
    expect(p.dmBlocked).toBe(true);
    expect(p.dmBlockedByThem).toBe(false);
  });
  it('gives empty values for nothing, so a failed or older answer draws an empty profile', () => {
    const p = profileFromSummary(null);
    expect(p.bio).toBe('');
    expect(p.bioLinks).toEqual([]);
    expect(p.avatar).toBe('');
    expect(p.header).toEqual({ headerPath: null, headerInk: 'auto' });
    expect(p.banner).toEqual({ joined: null, publicPosts: 0, grid: null });
    expect(p.counts).toEqual({});
    expect(p.publicNotes).toBeNull();
    expect(p.followCounts).toEqual({ followers: 0, following: 0 });
    expect(p.pinnedPost).toBeNull();
    expect(p.onlineStatus).toBeNull();
    expect(p.dmBlocked).toBe(false);
  });
});
