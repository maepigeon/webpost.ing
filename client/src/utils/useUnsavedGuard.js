import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDialog } from '../components/Dialog/Dialog.jsx';

/**
 * Keeps unsaved work from being lost by accident. While `dirty` is true:
 * closing or reloading the tab brings the browser's own "leave?" prompt, and
 * following a link within the site asks first, going on only on a yes.
 *
 * `what` names the work in the question, e.g. "your banner".
 */
export function useUnsavedGuard(dirty, what = 'your changes') {
  const navigate = useNavigate();
  const { confirm } = useDialog();
  const asking = useRef(false);

  useEffect(() => {
    if (!dirty) return undefined;
    const onUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    const onClick = async (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;   // leaving the site: the browser's prompt covers it
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      if (asking.current) return;
      asking.current = true;
      const leave = await confirm(`You haven't saved ${what}. Leave without saving?`, 'Unsaved changes', 'Leave');
      asking.current = false;
      if (leave) navigate(url.pathname + url.search + url.hash);
    };
    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty, what, navigate, confirm]);
}
