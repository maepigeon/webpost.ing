import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

vi.mock('../components/Pages/Posts/BasicTextPostServerApi.js', () => ({
  GET_NOTIFICATIONS: vi.fn(),
  MARK_NOTIFICATION_READ: vi.fn(() => Promise.resolve()),
  MARK_ALL_READ: vi.fn(() => Promise.resolve()),
  DELETE_NOTIFICATION: vi.fn(() => Promise.resolve()),
  CLEAR_NOTIFICATIONS: vi.fn(() => Promise.resolve()),
}));
vi.mock('../components/Dialog/Dialog.jsx', () => ({ useDialog: () => ({ confirm: vi.fn(() => Promise.resolve(true)) }) }));

import { GET_NOTIFICATIONS, MARK_NOTIFICATION_READ } from '../components/Pages/Posts/BasicTextPostServerApi.js';
import InboxPage from '../components/Social/InboxPage.jsx';
import { notifHref, notifExcerpt, isGone, subjectTitle } from '../components/Social/inboxModel.js';

const base = { id: 1, isRead: false, actorUsername: 'test2', postOwner: 'test', postId: 7, postTitle: 'First post', createdAt: new Date().toISOString() };

function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname + l.search + l.hash}</div>; }
function show(items) {
  GET_NOTIFICATIONS.mockResolvedValue(items);
  return render(
    <MemoryRouter initialEntries={['/inbox']}>
      <Routes><Route path="/inbox" element={<InboxPage />} /><Route path="*" element={<Where />} /></Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.IntersectionObserver = class { observe() {} disconnect() {} };
});

describe('inboxModel', () => {
  it('words an empty or missing title as an untitled post, never "your post"', () => {
    expect(subjectTitle({ postTitle: '' })).toBe('an untitled post');
    expect(subjectTitle({ postTitle: '  ' })).toBe('an untitled post');
    expect(subjectTitle({})).toBe('an untitled post');
    expect(subjectTitle({ postTitle: 'Hi' })).toBe('Hi');
  });
  it('treats an absent subjectGone as not gone, and no excerpt as no excerpt', () => {
    expect(isGone({ type: 'comment' })).toBe(false);
    expect(isGone({ type: 'comment', subjectGone: true })).toBe(true);
    expect(notifExcerpt({ type: 'comment' })).toBeNull();
    expect(notifExcerpt({ type: 'comment', commentExcerpt: 'hello' })).toBe('hello');
    expect(notifExcerpt({ type: 'comment', commentExcerpt: 'hello', subjectGone: true })).toBeNull();
  });
  it('points each type at its subject', () => {
    expect(notifHref({ ...base, type: 'comment', commentId: 5 })).toBe('/test/first-post/discussion#comment-5');
    expect(notifHref({ ...base, type: 'reaction' })).toBe('/test/first-post');
    expect(notifHref({ ...base, type: 'new_post', postOwner: undefined })).toBe('/test2/first-post');
    expect(notifHref({ ...base, type: 'follow' })).toBe('/test2');
    expect(notifHref({ ...base, type: 'message' })).toBe('/messages?with=test2');
    expect(notifHref({ ...base, type: 'comment', subjectGone: true })).toBeNull();
    expect(notifHref({ ...base, type: 'comment', postId: null })).toBeNull();
  });
});

describe('InboxPage rows', () => {
  it('names the post as a link to the comment and shows what was said', async () => {
    show([{ ...base, type: 'comment', commentId: 5, commentExcerpt: 'Love the colours' }]);
    const link = await screen.findByRole('link', { name: 'First post' });
    expect(link).toHaveAttribute('href', '/test/first-post/discussion#comment-5');
    expect(screen.getByText('Love the colours')).toHaveClass('inbox-item-excerpt');
    expect(screen.queryByText(/your post/)).toBeNull();
    expect(screen.getByText(/commented on/)).toBeInTheDocument();
  });

  it('reads "an untitled post" as a link when the title is empty', async () => {
    show([{ ...base, type: 'comment', commentId: 5, postTitle: '' }]);
    const link = await screen.findByRole('link', { name: 'an untitled post' });
    expect(link).toHaveAttribute('href', '/test/7/discussion#comment-5');
  });

  it('works against an old server: no excerpt, not gone', async () => {
    const { container } = show([{ ...base, type: 'mention', commentId: 5 }]);
    await screen.findByRole('link', { name: 'First post' });
    expect(container.querySelector('.inbox-item-excerpt')).toBeNull();
    expect(screen.getByText(/mentioned you in a comment on/)).toBeInTheDocument();
  });

  it('says a deleted subject is gone, with no link and no excerpt', async () => {
    const { container } = show([{ ...base, type: 'comment', subjectGone: true, commentExcerpt: 'secret' }]);
    await screen.findByText('a post that is no longer available');
    expect(screen.queryByRole('link', { name: 'First post' })).toBeNull();
    expect(container.querySelector('.inbox-post-link')).toBeNull();
    expect(container.querySelector('.inbox-item-excerpt')).toBeNull();
  });

  it('words a reply, with and without the reaction', async () => {
    show([
      { ...base, id: 1, type: 'reply', commentId: 5 },
      { ...base, id: 2, type: 'reaction', reaction: '👍' },
      { ...base, id: 3, type: 'reaction' },
      { ...base, id: 4, type: 'new_post', postOwner: 'test2' },
    ]);
    await screen.findByText(/replied to your comment on/);
    expect(screen.getByText(/reacted with 👍 to/)).toBeInTheDocument();
    expect(screen.getByText(/reacted to/)).toBeInTheDocument();
    expect(screen.getByText(/published/)).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: 'First post' });
    expect(links.map(l => l.getAttribute('href'))).toEqual([
      '/test/first-post/discussion#comment-5', '/test/first-post', '/test/first-post', '/test2/first-post',
    ]);
  });

  it('shows a message as a link to the conversation with its text under it', async () => {
    show([{ ...base, type: 'message', message: 'See you at six' }]);
    const link = await screen.findByRole('link', { name: 'a message' });
    expect(link).toHaveAttribute('href', '/messages?with=test2');
    expect(screen.getByText('See you at six')).toHaveClass('inbox-item-excerpt');
  });

  it('marks it read, then opens the comment, when the post link is clicked', async () => {
    show([{ ...base, type: 'comment', commentId: 5 }]);
    fireEvent.click(await screen.findByRole('link', { name: 'First post' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/test/first-post/discussion#comment-5'));
    expect(MARK_NOTIFICATION_READ).toHaveBeenCalledWith(1);
  });

  it('opens the same place from the row with the keyboard', async () => {
    const { container } = show([{ ...base, type: 'comment', commentId: 5 }]);
    await screen.findByRole('link', { name: 'First post' });
    const row = container.querySelector('.inbox-item');
    expect(row).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(row, { key: 'Enter' });
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/test/first-post/discussion#comment-5'));
  });

  it('does nothing but mark read when the row has no subject to open', async () => {
    const { container } = show([{ ...base, type: 'comment', subjectGone: true }]);
    await screen.findByText('a post that is no longer available');
    fireEvent.click(container.querySelector('.inbox-item'));
    await waitFor(() => expect(MARK_NOTIFICATION_READ).toHaveBeenCalledWith(1));
    expect(screen.queryByTestId('where')).toBeNull();
  });
});
