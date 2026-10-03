import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../components/Pages/Posts/BasicTextPostServerApi.js', () => ({ GET_USER_ACTIVITY: vi.fn() }));
import { GET_USER_ACTIVITY } from '../components/Pages/Posts/BasicTextPostServerApi.js';
import ActivityPage from '../components/Pages/Activity/ActivityPage.jsx';
import { activityTabs, nextTabId } from '../components/Pages/Activity/activityTabs.js';

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: (k) => (k === 'userName' ? 'test' : null), setItem() {}, removeItem() {} });
  GET_USER_ACTIVITY.mockResolvedValue({
    posts: [{ id: 1, title: 'A', date: Date.now(), published: true }, { id: 2, title: 'B', date: Date.now(), published: true }],
    comments: [], uploads: [{ id: 1, filename: 'f.png', size_bytes: 5, uploaded_at: Date.now() }],
  });
});

const open = () => render(
  <MemoryRouter initialEntries={['/activity/test']}>
    <Routes><Route path="/activity/:username" element={<ActivityPage />} /></Routes>
  </MemoryRouter>
);

describe('activityTabs', () => {
  it('names the tabs plainly and carries the counts', () => {
    const tabs = activityTabs({ posts: 4, deletions: 42 });
    expect(tabs.map(t => t.label)).toEqual(['Posts', 'Comments', 'Reactions', 'Uploads', 'Deletions']);
    expect(tabs.map(t => t.count)).toEqual([4, 0, 0, 0, 42]);
  });
  it('moves with the arrow keys, wrapping, and ignores other keys', () => {
    const tabs = activityTabs();
    expect(nextTabId(tabs, 'posts', 'ArrowLeft')).toBe('deletions');
    expect(nextTabId(tabs, 'deletions', 'ArrowRight')).toBe('posts');
    expect(nextTabId(tabs, 'comments', 'End')).toBe('deletions');
    expect(nextTabId(tabs, 'comments', 'Home')).toBe('posts');
    expect(nextTabId(tabs, 'comments', 'a')).toBeNull();
  });
});

describe('ActivityPage tabs', () => {
  it('reads "Posts" with a small count, hides zero counts, and switches', async () => {
    const { container } = open();
    const posts = await screen.findByRole('tab', { name: /^Posts\s*2$/ });
    expect(posts).toHaveAttribute('aria-selected', 'true');
    expect(posts.querySelector('.profile-tab-count')).toHaveTextContent('2');
    const comments = screen.getByRole('tab', { name: 'Comments' });
    expect(comments.querySelector('.profile-tab-count')).toBeNull();
    expect(container.textContent).not.toMatch(/\(\d+\)/);
    fireEvent.click(comments);
    expect(comments).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('No comments yet.')).toBeInTheDocument();
    fireEvent.keyDown(comments, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Reactions' })).toHaveAttribute('aria-selected', 'true');
  });
});
