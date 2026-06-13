import { useEffect } from 'react';

export function usePageTitle(title) {
  useEffect(() => {
    const suffix = 'webpost.ing';
    document.title = title ? `${title} — ${suffix}` : suffix;
    return () => { document.title = suffix; };
  }, [title]);
}
