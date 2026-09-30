import { useEffect, useRef, useState } from 'react';

/**
 * Shows as many items as fit on one line and reports the rest as overflow.
 *
 * A CSS breakpoint cannot know how wide a set of controls actually is — the
 * labels, the fonts and the user's zoom all change it — so the split between
 * "on the bar" and "in the menu" is measured rather than guessed. A fixed
 * desktop/mobile split wastes a wide window and crowds a narrow one.
 *
 * Usage: render every item once into `measureRef` (hidden), render
 * `items.slice(0, visibleCount)` for real, and put the remainder in a menu.
 *
 * @param {number} itemCount        how many items there are
 * @param {object} [options]
 * @param {number} [options.reserve] pixels to keep free for the overflow trigger
 * @param {number} [options.gap]     pixels between items
 * @param {boolean} [options.centered] items sit centred between equal side
 *                                  columns, so fixed width is lost on both sides
 * @returns {{containerRef, measureRef, visibleCount}}
 */
export function useOverflowItems(itemCount, { reserve = 44, gap = 4, centered = false } = {}) {
  const containerRef = useRef(null);
  const measureRef = useRef(null);
  const [visibleCount, setVisibleCount] = useState(itemCount);

  useEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const recompute = () => {
      const widths = Array.from(measure.children).map(c => c.getBoundingClientRect().width);
      // Anything marked as fixed — a logo, a save button — is not part of the
      // overflow set but still consumes width.
      const fixed = Array.from(container.querySelectorAll('[data-overflow-fixed]'))
        .reduce((sum, el) => sum + el.getBoundingClientRect().width, 0);

      const available = container.getBoundingClientRect().width - fixed * (centered ? 2 : 1) - reserve;

      let used = 0;
      let fit = 0;
      for (const width of widths) {
        if (used + width > available) break;
        used += width + gap;
        fit += 1;
      }
      // Hiding a single item is a poor trade: the trigger costs about as much
      // as the item it replaces, so show everything instead.
      setVisibleCount(fit >= itemCount - 1 ? itemCount : Math.max(0, fit));
    };

    recompute();

    const observer = new ResizeObserver(recompute);
    observer.observe(container);
    // Fonts land after first paint and change every measurement.
    document.fonts?.ready?.then(recompute).catch(() => {});
    return () => observer.disconnect();
  }, [itemCount, reserve, gap, centered]);

  return { containerRef, measureRef, visibleCount };
}
