import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DialogProvider } from '../components/Dialog/Dialog.jsx';

// The grid is drawn on a canvas, which jsdom lacks: a stub says what it was given.
vi.mock('../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/TileGrid.jsx', () => ({
  default: ({ data }) => <div data-testid="card-grid" data-cols={data.cols} />,
}));

import BasicTextPost from '../components/Pages/Posts/PostRenderer/BasicTextPost/BasicTextPost.jsx';
import { gridPostContent } from '../utils/gridPost.js';

afterEach(cleanup);

const card = (post, props = {}) => render(
  <MemoryRouter><DialogProvider>
    <BasicTextPost postdata={{ id: 1, title: 'Hello', slug: 'hello', published: true, ...post }}
      ownerUsername="mae" hasModifyPermissions={false} {...props} />
  </DialogProvider></MemoryRouter>,
);

describe('the post card in lists', () => {
  it('draws the grid from the body when the response has no preview field', () => {
    card({ description: gridPostContent() });
    expect(screen.getByTestId('card-grid').dataset.cols).toBe('16');
  });

  it('draws the grid from the preview when the response has a preview and no body', () => {
    card({ preview: { v: 3, cols: 8, rows: 2, layers: [] } });
    expect(screen.getByTestId('card-grid').dataset.cols).toBe('8');
  });

  it('shows title and summary only when the preview is null', () => {
    card({ preview: null, summary: 'A short note' });
    expect(screen.queryByTestId('card-grid')).toBeNull();
    expect(screen.getByText('Hello')).toBeTruthy();
    expect(screen.getByText('A short note')).toBeTruthy();
  });

  it('shows no grid when the author turned it off', () => {
    card({ cardGrid: false, preview: { v: 3, cols: 8, rows: 2, layers: [] } });
    expect(screen.queryByTestId('card-grid')).toBeNull();
  });

  it('keeps Edit and Delete for the owner', () => {
    card({}, { hasModifyPermissions: true });
    expect(screen.getByText('Edit')).toBeTruthy();
    expect(screen.getByText('Delete')).toBeTruthy();
  });

  it('asks "Delete this post?" and the button says Delete, not Continue', () => {
    card({}, { hasModifyPermissions: true });
    fireEvent.click(screen.getByText('Delete'));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('Delete this post?');
    const buttons = Array.from(dialog.querySelectorAll('.dialog-btn')).map(b => b.textContent);
    expect(buttons).toEqual(['Delete', 'Cancel']);
  });
});
