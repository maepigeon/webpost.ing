/**
 * Helpers for serving the right image rendition.
 *
 * The upload endpoint stores several widths of each image and returns a
 * `srcset` string. Choosing between them is left to the browser, which knows
 * the viewport, the device pixel ratio and the layout width — none of which
 * JavaScript can determine as reliably or as early.
 *
 * What the browser does *not* consistently factor in is connection quality, so
 * that part is nudged here: on a metered or slow connection we shrink the
 * `sizes` hint, and the browser then picks a narrower candidate from the same
 * srcset. This degrades cleanly — where the Network Information API is missing
 * (Safari and Firefox both lack it) the full-quality path is used.
 */

/** Prefixes every candidate URL in a srcset, leaving the width descriptors alone. */
export function prefixSrcset(srcset, base) {
  if (!srcset || typeof srcset !== 'string') return undefined;
  if (!base) return srcset;
  return srcset
    .split(',')
    .map(part => {
      const trimmed = part.trim();
      if (!trimmed) return null;
      const gap = trimmed.lastIndexOf(' ');
      if (gap === -1) return base + trimmed;
      return base + trimmed.slice(0, gap) + trimmed.slice(gap);
    })
    .filter(Boolean)
    .join(', ');
}

/**
 * Reads the connection quality the browser reports.
 * Returns 'save-data', 'slow', or 'normal' — 'normal' whenever unknown.
 */
export function connectionQuality(nav = typeof navigator !== 'undefined' ? navigator : undefined) {
  const conn = nav?.connection || nav?.mozConnection || nav?.webkitConnection;
  if (!conn) return 'normal';
  if (conn.saveData === true) return 'save-data';
  if (conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g') return 'slow';
  return 'normal';
}

/**
 * Builds the `sizes` attribute that tells the browser how wide the image will
 * be laid out, capped when the connection is poor.
 *
 * `sizes` is a hint about layout, so capping it is a deliberate lie in the
 * user's favour: the browser downloads a smaller file and scales it up
 * slightly, which is a far better trade on a 2G connection than a sharp image
 * that never arrives.
 *
 * @param {string} full - the sizes value to use on a healthy connection
 */
export function adaptiveSizes(full = '(max-width: 760px) 100vw, 720px') {
  switch (connectionQuality()) {
    case 'save-data': return '360px';
    case 'slow':      return '480px';
    default:          return full;
  }
}

/**
 * Normalises what POST /api/upload returns.
 *
 * The endpoint used to return the URL as a bare string and now returns an
 * object with variants. Older posts and any caller that has not been updated
 * still work, so both shapes are accepted.
 *
 * @returns {{url: string, srcset?: string, width?: number, height?: number}}
 */
export function normaliseUploadResponse(data) {
  if (typeof data === 'string') return { url: data };
  if (data && typeof data === 'object' && typeof data.url === 'string') {
    return {
      url: data.url,
      srcset: data.srcset || undefined,
      width: data.width,
      height: data.height,
    };
  }
  return { url: '' };
}

/**
 * Turns an upload failure into something worth showing a person.
 *
 * The server already explains itself — "Image dimensions are too large (40
 * megapixel limit)", "File is not a readable image", "Storage quota exceeded.
 * Used 48 MB of 50 MB limit." — but the client used to branch on the status
 * code and substitute its own generic text, so all of that was thrown away and
 * the user saw "Image upload failed." with no way to act on it.
 *
 * The server's message wins whenever there is one. The status-based fallbacks
 * are only for failures that never reached the application: a proxy limit, a
 * dropped connection.
 */
export function describeUploadError(err) {
  const status = err?.response?.status;
  const data = err?.response?.data;

  // Errors arrive as a plain string from some endpoints and { message } from
  // others; both shapes are handled rather than assuming one.
  const serverMessage =
    typeof data === 'string' ? data.trim()
    : typeof data?.message === 'string' ? data.message.trim()
    : '';

  if (serverMessage) return serverMessage;

  if (status === 401) return 'Your session ended. Sign in again to upload.';
  if (status === 403) return 'You are not allowed to upload here.';
  if (status === 413) return 'That file is too large to upload.';
  if (status === 415) return 'That file type is not supported. Try a JPG, PNG, GIF or WebP.';
  if (status === 429) return 'Too many uploads just now. Wait a moment and try again.';
  if (status >= 500)  return 'The server could not store that file. Try again shortly.';
  if (err?.code === 'ERR_NETWORK' || !status) return 'Could not reach the server. Check your connection.';

  return `Upload failed (status ${status}).`;
}
