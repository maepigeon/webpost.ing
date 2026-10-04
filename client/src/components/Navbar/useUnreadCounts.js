import { useEffect, useRef, useState } from 'react';
import { GET_COUNTERS } from '../Pages/Posts/BasicTextPostServerApi';

export const POLL_MS = 45000;
export const SLOW_POLL_MS = 120000;
// After this many polls in a row with the same numbers, poll less often.
export const UNCHANGED_BEFORE_SLOW = 5;
// Pages where reading changes the counts, so entering or leaving them recounts.
const COUNT_PAGES = ['/messages', '/inbox'];

export function pollDelay(unchanged) {
  return unchanged >= UNCHANGED_BEFORE_SLOW ? SLOW_POLL_MS : POLL_MS;
}

// The Inbox (and anything else that changes what is unread) dispatches this on
// `window` so the badges recount at once instead of at the next poll.
export const COUNTS_CHANGED_EVENT = 'wp:counts-changed';

/** Calls `onChange` for each counts-changed event on `target`; returns the unsubscribe. */
export function listenForCountChanges(target, onChange) {
  target.addEventListener(COUNTS_CHANGED_EVENT, onChange);
  return () => target.removeEventListener(COUNTS_CHANGED_EVENT, onChange);
}

const onCountPage = (path) =>
  COUNT_PAGES.some(p => path === p || path.startsWith(p + '/'));

/** True when a route change should recount: only in or out of Messages / Inbox. */
export function countsPageChanged(from, to) {
  return from !== to && (onCountPage(from) || onCountPage(to));
}

/**
 * The polling schedule, apart from React so it can be tested with fake timers.
 * One request per tick; a tick that finds the tab hidden does nothing and the
 * schedule stays paused until `visible()` recounts once and carries on.
 */
export function createCounterPoller({ load, onCounts, isHidden = () => document.hidden }) {
  let timer = null;
  let unchanged = 0;
  let last = null;
  let stopped = false;
  let generation = 0;

  const run = async () => {
    clearTimeout(timer);
    timer = null;
    const mine = ++generation;
    let data = null;
    try { data = await load(); } catch { /* a missed poll is retried on the next one */ }
    if (stopped || mine !== generation) return;
    if (data) {
      const key = `${data.messages}:${data.notifications}`;
      unchanged = key === last ? unchanged + 1 : 0;
      last = key;
      onCounts(data);
    }
    if (!isHidden()) timer = setTimeout(tick, pollDelay(unchanged));
  };

  const tick = () => {
    timer = null;
    if (!isHidden()) run();
  };

  return {
    start: run,
    // The user did something that changes the counts: recount now and poll at the normal pace again.
    refresh() {
      unchanged = 0;
      if (!isHidden()) run();
    },
    // The tab came back: recount once and resume.
    visible() {
      unchanged = 0;
      if (!isHidden()) run();
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      timer = null;
    },
  };
}

/**
 * Unread messages and notifications, for the badges. They are fetched here,
 * once, rather than inside each button, because the bar must know about a
 * count on a button that has moved into the More menu.
 * One request every 45 seconds (slower when nothing changes, none while the
 * tab is hidden); it also tells the server the user is active. Recounted when
 * the user enters or leaves Messages or Inbox, so reading clears the badges.
 */
export function useUnreadCounts(enabled, pathname) {
  const [counts, setCounts] = useState({ messages: 0, notifications: 0 });
  const pollerRef = useRef(null);
  const lastPath = useRef(pathname);

  useEffect(() => {
    if (!enabled) return;
    const poller = createCounterPoller({
      load: GET_COUNTERS,
      onCounts: d => {
        const next = { messages: d.messages || 0, notifications: d.notifications || 0 };
        setCounts(c => (c.messages === next.messages && c.notifications === next.notifications ? c : next));
      },
    });
    pollerRef.current = poller;
    const onVisibility = () => { if (!document.hidden) poller.visible(); };
    document.addEventListener('visibilitychange', onVisibility);
    const stopListening = listenForCountChanges(window, () => poller.refresh());
    poller.start();
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stopListening();
      poller.stop();
      pollerRef.current = null;
    };
  }, [enabled]);

  useEffect(() => {
    const from = lastPath.current;
    lastPath.current = pathname;
    if (countsPageChanged(from, pathname)) pollerRef.current?.refresh();
  }, [pathname]);

  return enabled ? counts : { messages: 0, notifications: 0 };
}
