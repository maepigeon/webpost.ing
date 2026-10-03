/**
 * Pure helpers for the top bar, kept out of the components so they can be
 * tested without a browser (widths come from the DOM, the decisions do not).
 */

/**
 * Which bar items should move into the More menu.
 *
 * Items are dropped lowest priority first (ties: the later one goes first)
 * until what is left, plus the More button, fits. If everything fits, nothing
 * moves and More is not needed.
 *
 * @param {{key: string, width: number, priority?: number}[]} items in bar order
 * @param {number} available pixels for the items and the More button
 * @param {number} moreWidth width of the More button
 * @param {number} gap       space around each item (their margins)
 * @returns {string[]} keys of the hidden items, in bar order
 */
export function chooseHidden(items, available, moreWidth = 0, gap = 0) {
  const total = list => list.reduce((sum, i) => sum + i.width + gap, 0);
  if (total(items) <= available) return [];

  const dropOrder = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => ((a.item.priority ?? 0) - (b.item.priority ?? 0)) || (b.index - a.index));

  const hidden = new Set();
  let kept = items;
  for (const { item } of dropOrder) {
    hidden.add(item.key);
    kept = kept.filter(k => k.key !== item.key);
    if (total(kept) + moreWidth + gap <= available) break;
  }
  return items.filter(i => hidden.has(i.key)).map(i => i.key);
}

/**
 * Is `route` the page being shown? Home matches only itself; the rest match
 * their own path and anything under it, but not a longer name that merely
 * starts the same way (/mae is not /maeve).
 */
export function isActiveRoute(pathname, route) {
  if (route === '/') return pathname === '/';
  return pathname === route || pathname.startsWith(`${route}/`);
}
