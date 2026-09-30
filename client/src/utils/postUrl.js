/**
 * Post URLs.
 *
 * A post's address is `/{author}/{slug}`, falling back to `/{author}/{id}` when
 * it has no usable slug:
 *
 *     /mae/how-i-built-the-wallpaper-maker
 *     /mae/42                                (no title yet, or an unsluggable one)
 *
 * Three forms all resolve, so no link ever breaks:
 *
 *   /mae/42            the id
 *   /mae/my-post       the slug alone
 *   /mae/42-my-post    the older combined form
 *
 * The id wins when both are present, so a stale slug still finds the right
 * post. Slugs are made unique per author on save, because a slug now has to
 * identify one post rather than merely decorate an id.
 */

/** Longest slug we will generate. Long enough to be useful, short enough to read. */
const MAX_SLUG_LENGTH = 60;

/**
 * Turns a title into a URL-safe slug.
 *
 * Accents are decomposed and stripped so "Café" becomes "cafe" rather than
 * being dropped. Anything else outside [a-z0-9] collapses to a single hyphen,
 * which handles punctuation, emoji and non-Latin scripts — a title written
 * entirely in one of those yields an empty slug, and the URL falls back to the
 * id, which is correct rather than a row of hyphens.
 */
export function slugify(title) {
  if (!title || typeof title !== 'string') return '';
  return title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')   // strip combining accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');              // slice may have left a trailing hyphen
}

/**
 * Placeholder slugs that carry no information. A post with no title should be
 * `/mae/42`, not `/mae/42-untitled`.
 */
const EMPTY_SLUGS = new Set(['untitled', 'undefined', 'null', 'new-post', 'post']);

/** The slug a post should appear under, or '' if it has none worth showing. */
export function effectiveSlug(post) {
  if (!post) return '';
  const slug = (post.slug || slugify(post.title) || '').trim();
  return EMPTY_SLUGS.has(slug) ? '' : slug;
}

/**
 * Builds the canonical path for a post.
 *
 * @param {string} username author's username
 * @param {{id: number|string, title?: string, slug?: string}} post
 * @param {string} [suffix] e.g. '/discussion'
 */
export function postPath(username, post, suffix = '') {
  if (!post || post.id == null) return `/${username}`;
  const slug = effectiveSlug(post);
  return `/${username}/${slug || post.id}${suffix}`;
}

/**
 * Reads a numeric id from a route segment, if it has one.
 *
 * Returns null for a slug-only segment — that has to be resolved by the server,
 * since only it knows which post the slug belongs to.
 *
 * @returns {string|null}
 */
export function parsePostId(segment) {
  if (segment == null) return null;
  const match = String(segment).match(/^(\d+)(?:-|$)/);
  return match ? match[1] : null;
}

/** True when a segment is a slug rather than an id, and so needs resolving. */
export function needsResolution(segment) {
  return segment != null && String(segment).length > 0 && parsePostId(segment) === null;
}
