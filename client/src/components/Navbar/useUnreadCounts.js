import { useEffect, useState } from 'react';
import { GET_UNREAD_COUNT, GET_UNREAD_MESSAGE_COUNT } from '../Pages/Posts/BasicTextPostServerApi';

/**
 * Unread messages and notifications, for the badges. They are fetched here,
 * once, rather than inside each button, because the bar must know about a
 * count on a button that has moved into the More menu.
 * Recounted every 30 seconds and on each page change, so reading clears them.
 */
export function useUnreadCounts(enabled, pathname) {
  const [counts, setCounts] = useState({ messages: 0, notifications: 0 });

  useEffect(() => {
    if (!enabled) return;
    const load = () => {
      GET_UNREAD_MESSAGE_COUNT().then(d => setCounts(c => ({ ...c, messages: d?.count || 0 }))).catch(() => {});
      GET_UNREAD_COUNT().then(d => setCounts(c => ({ ...c, notifications: d?.count || 0 }))).catch(() => {});
    };
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [enabled, pathname]);

  return enabled ? counts : { messages: 0, notifications: 0 };
}
