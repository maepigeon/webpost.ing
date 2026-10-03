import { useLayoutEffect, useRef, useState } from 'react';
import { chooseHidden } from './overflow.js';

/**
 * Measures the bar and says which items do not fit.
 *
 * Every item (and a copy of the More button) is rendered once, off-screen, in
 * `measureRef`; the real bar is `barRef`; `accountRef` is the account button,
 * which always keeps its place. A breakpoint cannot know how wide these
 * labels are, so the split is measured.
 *
 * @param {{key: string, priority?: number}[]} items in bar order
 * @returns {{barRef, measureRef, accountRef, hiddenKeys: string[]}}
 */
export function useBarFit(items, gap = 6) {
  const barRef = useRef(null);
  const measureRef = useRef(null);
  const accountRef = useRef(null);
  const [hiddenKeys, setHiddenKeys] = useState([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const signature = items.map(i => `${i.key}:${i.priority ?? 0}`).join(',');

  // Layout effect: the first paint should already be the right split.
  useLayoutEffect(() => {
    const bar = barRef.current;
    const measure = measureRef.current;
    if (!bar || !measure) return;

    const recompute = () => {
      const current = itemsRef.current;
      const widths = Array.from(measure.children).map(k => k.getBoundingClientRect().width);
      const moreWidth = widths[current.length] ?? 0;
      const style = getComputedStyle(bar);
      const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      const accountWidth = accountRef.current ? accountRef.current.getBoundingClientRect().width + 8 : 0;
      const available = bar.getBoundingClientRect().width - padding - accountWidth;

      const next = chooseHidden(
        current.map((it, i) => ({ key: it.key, width: widths[i] ?? 0, priority: it.priority })),
        available, moreWidth, gap,
      );
      setHiddenKeys(prev => (prev.join() === next.join() ? prev : next));
    };

    recompute();
    if (typeof ResizeObserver === 'undefined') return;
    // The measure box resizes when a label or badge changes width.
    const observer = new ResizeObserver(recompute);
    observer.observe(bar);
    observer.observe(measure);
    if (accountRef.current) observer.observe(accountRef.current);
    document.fonts?.ready?.then(recompute).catch(() => {});
    return () => observer.disconnect();
  }, [signature, gap]);

  return { barRef, measureRef, accountRef, hiddenKeys };
}
