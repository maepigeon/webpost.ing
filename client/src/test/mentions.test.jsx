import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { findMentions, renderComment, activeMention } from '../utils/mentions.jsx';
import { nextBefore } from '../components/Pages/Discover/DiscoverPage.jsx';

const html = (text) => renderToStaticMarkup(<MemoryRouter><p>{renderComment(text)}</p></MemoryRouter>);

describe('findMentions', () => {
  it('finds names, ignoring emails and short or glued ones', () => {
    expect(findMentions('hi @alice, @bob_2! mail a@b.com @ab word@carol @@dave')).toEqual(['alice', 'bob_2']);
  });
  it('ignores a name that runs past 32 characters', () => {
    expect(findMentions('@' + 'x'.repeat(33))).toEqual([]);
  });
});

describe('renderComment', () => {
  it('turns @name into a link to the member, text unchanged', () => {
    const out = html('thanks @Alice!');
    expect(out).toContain('href="/Alice"');
    expect(out).toContain('>@Alice</a>');
    expect(out.endsWith('!</p>')).toBe(true);
  });
  it('leaves emails and plain text alone, and never injects markup', () => {
    expect(html('a@b.com')).not.toContain('<a');
    const out = html('@bob <img src=x onerror=alert(1)>');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });
  it('still links urls and hashtags around a mention', () => {
    const out = html('see https://example.org #art @carol');
    expect(out).toContain('href="https://example.org"');
    expect(out).toContain('href="/search?tag=art"');
    expect(out).toContain('href="/carol"');
  });
});

describe('activeMention', () => {
  it('needs @ plus two characters before the caret', () => {
    expect(activeMention('hi @a', 5)).toBeNull();
    expect(activeMention('hi @al', 6)).toEqual({ start: 3, query: 'al' });
    expect(activeMention('mail a@bc', 9)).toBeNull();
    expect(activeMention('hi @al there', 12)).toBeNull();
  });
});

describe('nextBefore', () => {
  it('is the last post date as an ISO time', () => {
    expect(nextBefore([{ date: 1000 }, { date: 2000 }])).toBe(new Date(2000).toISOString());
    expect(nextBefore([])).toBeUndefined();
  });
});
