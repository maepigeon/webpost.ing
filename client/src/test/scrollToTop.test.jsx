import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ScrollToTop, { hidesScrollToTop } from '../components/ScrollToTop/ScrollToTop.jsx';

const scrolled = (path) => {
  render(<MemoryRouter initialEntries={[path]}><ScrollToTop /></MemoryRouter>);
  act(() => { window.scrollY = 500; fireEvent.scroll(window); });
};

describe('ScrollToTop', () => {
  it('knows the editor pages', () => {
    expect(hidesScrollToTop('/editor')).toBe(true);
    expect(hidesScrollToTop('/editor/12')).toBe(true);
    expect(hidesScrollToTop('/editors')).toBe(false);
    expect(hidesScrollToTop('/mae')).toBe(false);
  });
  it('appears after scrolling on a normal page', () => {
    scrolled('/mae');
    expect(screen.getByRole('button', { name: 'Scroll to top' })).toBeInTheDocument();
  });
  it('stays away on the editor', () => {
    scrolled('/editor/3');
    expect(screen.queryByRole('button', { name: 'Scroll to top' })).toBeNull();
  });
});
