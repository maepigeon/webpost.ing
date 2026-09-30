import { useEffect, useState } from 'react';
import { parsePostId } from './postUrl.js';
import { RESOLVE_POST } from '../components/Pages/Posts/BasicTextPostServerApi.js';

/**
 * The post id for a `/{username}/{segment}` route.
 *
 * A segment with a leading number is read directly. A slug-only segment — the
 * form every profile link uses — has to be looked up on the server, which is
 * the only place that knows which of the author's posts it names.
 *
 * @returns {{id: string|null, missing: boolean}} id is null while resolving;
 *          missing is true once the server has said there is no such post.
 */
export function useResolvedPostId(username, segment) {
  const direct = parsePostId(segment);
  const [resolved, setResolved] = useState({ segment: null, id: null, missing: false });

  useEffect(() => {
    if (direct != null || !segment || !username) return;
    let cancelled = false;
    RESOLVE_POST(username, segment)
      .then(post => { if (!cancelled) setResolved({ segment, id: String(post.id), missing: false }); })
      .catch(() => { if (!cancelled) setResolved({ segment, id: null, missing: true }); });
    return () => { cancelled = true; };
  }, [direct, segment, username]);

  if (direct != null) return { id: direct, missing: false };
  if (resolved.segment !== segment) return { id: null, missing: false };
  return { id: resolved.id, missing: resolved.missing };
}
