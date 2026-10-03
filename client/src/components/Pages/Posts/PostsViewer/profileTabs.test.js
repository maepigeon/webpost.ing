import { describe, it, expect } from 'vitest';
import { tabFromSearch, searchForTab, sectionForTab, visibleTabs, destinationLabel } from './profileTabs.js';

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
