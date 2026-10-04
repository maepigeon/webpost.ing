import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ProfileTabs from '../components/Pages/Posts/PostsViewer/ProfileTabs.jsx';

afterEach(cleanup);

describe('the profile tab bar', () => {
  it('is not drawn for a single tab', () => {
    render(<ProfileTabs tabs={[{ id: 'posts', label: 'Posts', count: 4 }]} active="posts" onSelect={() => {}} />);
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('is drawn when there is more than one, Subscribers included for the owner', () => {
    const tabs = [
      { id: 'posts', label: 'Posts', count: 4 },
      { id: 'notes', label: 'Notes', count: 0 },
      { id: 'drafts', label: 'Drafts', count: 1 },
      { id: 'subscribers', label: 'Subscribers', count: 0 },
    ];
    render(<ProfileTabs tabs={tabs} active="posts" onSelect={() => {}} />);
    expect(screen.getAllByRole('tab').map(t => t.textContent.replace(/\d+$/, ''))).toEqual(['Posts', 'Notes', 'Drafts', 'Subscribers']);
  });
});
