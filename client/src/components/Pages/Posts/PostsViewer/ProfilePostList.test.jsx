import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('../BasicTextPostServerApi.js', () => ({
  UPDATE_POST_ORDER: vi.fn(() => Promise.resolve()),
  SET_POST_VISIBILITY: vi.fn(() => Promise.resolve()),
  DELETE_POST: vi.fn(() => Promise.resolve()),
}));
vi.mock('../PostRenderer/BasicTextPost/BasicTextPost.jsx', () => ({
  default: ({ postdata }) => <div data-testid="card">{postdata.title}</div>,
}));
vi.mock('../../../Dialog/Dialog.jsx', () => ({ useDialog: () => ({ confirm: vi.fn(() => Promise.resolve(true)) }) }));

import ProfilePostList from './ProfilePostList.jsx';

afterEach(cleanup);

const post = (id, published) => ({ id, title: `post ${id}`, published, section: 'profile', folder: null });
const posts = [post(1, true), post(2, false), post(3, true)];

const show = (props = {}) => render(
  <ProfilePostList posts={posts} pinnedId={null} canEdit username="mae" onRefresh={() => {}}
    onArrange={() => {}} hasMore={false} loadAll={async () => {}} {...props} />
);

describe('ProfilePostList hideDrafts', () => {
  it('lists every post by default', () => {
    show();
    expect(screen.getAllByTestId('card')).toHaveLength(3);
  });

  it('leaves drafts out of the list, but the arrange view still has all of them', () => {
    const { container } = show({ hideDrafts: true });
    expect(screen.getAllByTestId('card').map(c => c.textContent).sort()).toEqual(['post 1', 'post 3']);
    fireEvent.click(screen.getByRole('button', { name: /Arrange posts/ }));
    expect(container.querySelectorAll('.arrange-row')).toHaveLength(3);
    expect(container.querySelectorAll('.arrange-badge--draft')).toHaveLength(1);
  });
});
