import { describe, it, expect } from 'vitest';
import { chooseHidden, isActiveRoute } from '../components/Navbar/overflow.js';

const bar = [
  { key: 'home', width: 60, priority: 100 },
  { key: 'new', width: 80, priority: 90 },
  { key: 'following', width: 90, priority: 10 },
  { key: 'search', width: 70, priority: 40 },
  { key: 'messages', width: 90, priority: 30 },
  { key: 'notifs', width: 120, priority: 20 },
];
const gap = 6;
const more = 60;
// Sum of widths + gaps for the whole bar: 510 + 36 = 546.

describe('chooseHidden', () => {
  it('hides nothing when everything fits', () => {
    expect(chooseHidden(bar, 546, more, gap)).toEqual([]);
    expect(chooseHidden(bar, 1000, more, gap)).toEqual([]);
  });

  it('moves Following first, then Notifications, then Messages, then Search', () => {
    // Each step must leave room for the More button too.
    expect(chooseHidden(bar, 545, more, gap)).toEqual(['following']);
    expect(chooseHidden(bar, 546 - 96 - 126 + 66, more, gap)).toEqual(['following', 'notifs']);
    expect(chooseHidden(bar, 330, more, gap)).toEqual(['following', 'messages', 'notifs']);
    expect(chooseHidden(bar, 280, more, gap)).toEqual(['following', 'search', 'messages', 'notifs']);
  });

  it('keeps bar order in the result, not drop order', () => {
    const hidden = chooseHidden(bar, 330, more, gap);
    expect(hidden).toEqual(bar.map(i => i.key).filter(k => hidden.includes(k)));
  });

  it('keeps Home and New Post longest, and only More when nothing else fits', () => {
    expect(chooseHidden(bar, 200, more, gap)).toEqual(['new', 'following', 'search', 'messages', 'notifs']);
    expect(chooseHidden(bar, 0, more, gap)).toHaveLength(bar.length);
  });

  it('drops the later item first when priorities tie', () => {
    const tie = [{ key: 'a', width: 50 }, { key: 'b', width: 50 }, { key: 'c', width: 50 }];
    expect(chooseHidden(tie, 140, 30, 0)).toEqual(['c']);
  });
});

describe('isActiveRoute', () => {
  it('matches home only on the home page', () => {
    expect(isActiveRoute('/', '/')).toBe(true);
    expect(isActiveRoute('/search', '/')).toBe(false);
  });

  it('matches a page and what is under it, not a longer name', () => {
    expect(isActiveRoute('/messages', '/messages')).toBe(true);
    expect(isActiveRoute('/mae/12', '/mae')).toBe(true);
    expect(isActiveRoute('/maeve', '/mae')).toBe(false);
  });
});
