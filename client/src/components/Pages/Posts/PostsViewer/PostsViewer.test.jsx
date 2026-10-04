import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../BasicTextPostServerApi.js', () => ({
  AUTHORIZE_SESSION: vi.fn(() => Promise.resolve('ok')),
  READ_POSTS_BY_USER: vi.fn(),
  GET_POST_SECTIONS: vi.fn(() => Promise.resolve({})),
  GET_PROFILE_SUMMARY: vi.fn(),
  UPDATE_USER_BIO: vi.fn(), UPDATE_USER_BIO_LINKS: vi.fn(),
  GET_USER_STORAGE: vi.fn(() => Promise.resolve(null)),
  GET_FOLLOWERS: vi.fn(() => Promise.resolve([])), GET_FOLLOWING: vi.fn(() => Promise.resolve([])),
  BLOCK_MESSAGES: vi.fn(), UNBLOCK_MESSAGES: vi.fn(), EXPORT_MY_DATA: vi.fn(),
  SET_PINNED_POST: vi.fn(), UNPIN_POST: vi.fn(), POST_USER_AVATAR: vi.fn(),
}));
// The list is the subject of another test; here it reports what it was given.
vi.mock('./ProfilePostList.jsx', () => ({
  default: (props) => (
    <div data-testid="list" data-hide-drafts={String(props.hideDrafts)}>
      {props.posts.map(p => <span key={p.id} data-testid="post">{p.title}</span>)}
      {props.pinned}
    </div>
  ),
}));
vi.mock('./ProfileBanner.jsx', () => ({ default: (props) => <div data-testid="banner">{props.publicPosts}</div> }));
vi.mock('./ProfileStickies.jsx', () => ({ default: () => null }));
vi.mock('./BannerEditor.jsx', () => ({ default: () => null }));
vi.mock('../../../Social/FollowButton.jsx', () => ({ default: () => null }));
vi.mock('../../../TileArt/NewGridPost.jsx', () => ({ default: () => null }));
vi.mock('../PostRenderer/BasicTextPost/BasicTextPost.jsx', () => ({
  default: ({ postdata }) => <div data-testid="pinned">{postdata.title}</div>,
}));
vi.mock('../../../PageTheme/PageTheme.jsx', () => ({ useAuthorTheme: () => {} }));
vi.mock('../../../TileArt/wallpaper.js', () => ({ useBodyWallpaper: () => {} }));

import { READ_POSTS_BY_USER, GET_PROFILE_SUMMARY, GET_POST_SECTIONS, GET_USER_STORAGE } from '../BasicTextPostServerApi.js';
import PostsViewer from './PostsViewer.jsx';
import { DialogProvider } from '../../../Dialog/Dialog.jsx';

const post = (id, published = true, extra = {}) => ({ id, title: `post ${id}`, published, section: 'profile', ...extra });

function summary(extra = {}) {
  return {
    username: 'mae', bio: 'hello', bioLinks: [], background: '', avatarPath: null,
    header: { headerPath: null, headerInk: 'auto' },
    banner: { joined: null, publicPosts: 2, grid: null },
    counts: { profile: 2, notes: 0, subscribers: 0, drafts: 1 }, publicNotes: 0,
    follows: { followers: 0, following: 0, followsMe: false },
    pinnedPost: null, dm: null, online: false, lastSeen: '',
    ...extra,
  };
}

function open(path = '/users/mae') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DialogProvider>
        <Routes><Route path="/users/:username" element={<PostsViewer />} /></Routes>
      </DialogProvider>
    </MemoryRouter>
  );
}

function signInAs(name) {
  vi.stubGlobal('localStorage', { getItem: (k) => (k === 'userName' ? name : null), setItem() {}, removeItem() {} });
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
  GET_PROFILE_SUMMARY.mockResolvedValue(summary());
  READ_POSTS_BY_USER.mockResolvedValue([post(1), post(2), post(3, false)]);
});

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('the profile on load', () => {
  it('asks for one summary and one page of posts, not a dozen requests', async () => {
    signInAs(null);
    open();
    await screen.findByTestId('list');
    expect(GET_PROFILE_SUMMARY).toHaveBeenCalledTimes(1);
    expect(GET_PROFILE_SUMMARY).toHaveBeenCalledWith('mae');
    expect(READ_POSTS_BY_USER).toHaveBeenCalledTimes(1);
    // The counts came with the summary; they are asked for again only after a change.
    expect(GET_POST_SECTIONS).not.toHaveBeenCalled();
    // Storage use is the owner's and an admin's alone.
    expect(GET_USER_STORAGE).not.toHaveBeenCalled();
  });

  it('says in one line that an unknown profile does not exist', async () => {
    signInAs(null);
    GET_PROFILE_SUMMARY.mockRejectedValue({ response: { status: 404 } });
    open('/users/nobody');
    expect(await screen.findByText('This profile does not exist.')).toBeInTheDocument();
    expect(screen.queryByTestId('banner')).toBeNull();
  });

  it('draws the pinned card from the summary', async () => {
    signInAs(null);
    GET_PROFILE_SUMMARY.mockResolvedValue(summary({ pinnedPost: post(9, true, { title: 'Pinned card' }) }));
    open();
    expect(await screen.findByTestId('pinned')).toHaveTextContent('Pinned card');
  });

  it('shows the header number the Posts tab shows', async () => {
    signInAs(null);
    GET_PROFILE_SUMMARY.mockResolvedValue(summary({
      counts: { profile: 4, notes: 0 }, banner: { joined: null, publicPosts: 99, grid: null },
    }));
    open();
    await waitFor(() => expect(screen.getByTestId('banner')).toHaveTextContent('4'));
  });
});

describe('drafts live in Drafts', () => {
  it('has the owner\'s Posts list drop drafts in the normal view, and hands over every post for arranging', async () => {
    signInAs('mae');
    open();
    const list = await screen.findByTestId('list');
    expect(list).toHaveAttribute('data-hide-drafts', 'true');
    // The list is given all three; it is the list that shows the published two and arranges all three.
    expect(screen.getAllByTestId('post')).toHaveLength(3);
  });

  it('does not hide drafts in Drafts, or from a visitor', async () => {
    signInAs('mae');
    open('/users/mae?tab=drafts');
    expect(await screen.findByTestId('list')).toHaveAttribute('data-hide-drafts', 'false');
    cleanup();
    signInAs('someone-else');
    open();
    expect(await screen.findByTestId('list')).toHaveAttribute('data-hide-drafts', 'false');
  });
});

describe('paging past a page of drafts', () => {
  it('goes on to the next page when the first has nothing to show', async () => {
    signInAs('mae');
    const drafts = Array.from({ length: 20 }, (_, i) => post(100 + i, false));
    READ_POSTS_BY_USER
      .mockResolvedValueOnce(drafts)
      .mockResolvedValueOnce([post(1), post(2)]);
    open();
    await waitFor(() => expect(READ_POSTS_BY_USER).toHaveBeenCalledTimes(2));
    // The second request starts after the 20 already loaded.
    expect(READ_POSTS_BY_USER.mock.calls[1][2]).toBe(20);
    expect(await screen.findByTestId('list')).toBeInTheDocument();
    expect(screen.queryByText(/No posts yet/)).toBeNull();
  });

  it('does not show "No posts yet" while the next page is on its way', async () => {
    signInAs('mae');
    const drafts = Array.from({ length: 20 }, (_, i) => post(100 + i, false));
    let release;
    READ_POSTS_BY_USER
      .mockResolvedValueOnce(drafts)
      .mockReturnValueOnce(new Promise(r => { release = r; }));
    open();
    await waitFor(() => expect(READ_POSTS_BY_USER).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/No posts yet/)).toBeNull();
    release([]);
    expect(await screen.findByText(/No posts yet/)).toBeInTheDocument();
  });

  it('stops when the list ends: only drafts, nothing more', async () => {
    signInAs('mae');
    READ_POSTS_BY_USER.mockResolvedValue([post(5, false)]);
    open();
    expect(await screen.findByText(/No posts yet/)).toBeInTheDocument();
    expect(READ_POSTS_BY_USER).toHaveBeenCalledTimes(1);
  });
});
