/**
 * Post URLs.
 *
 * A post lives at `/users/{author}/{id}-{slug}` — the numeric id first, then a
 * readable slug derived from the title:
 *
 *     /users/mae/42-how-i-built-the-wallpaper-maker
 *
 * Leading with the id means lookups stay by primary key. A pure slug would need
 * a unique column, collision handling, a backfill for every existing post, and
 * a decision about what happens when a title is edited. This form gets the
 * readable URL with none of that, and old `/users/{author}/{id}` links keep
 * working unchanged — `parsePostId` just takes the digits off the front.
 *
 * It also means the slug is cosmetic: a stale or hand-edited slug still resolves
 * to the right post, the way it does on Stack Overflow or Medium.
 */

/** Longest slug we will generate. Long enough to be useful, short enough to read. */
const MAX_SLUG_LENGTH = 60;

/**
 * Turns a title into a URL-safe slug.
 *
 * Accents are decomposed and stripped so "Café" becomes "cafe" rather than
 * being dropped. Anything else outside [a-z0-9] collapses to a single hyphen,
 * which handles punctuation, emoji and non-Latin scripts — a title written
 * entirely in one of those yields an empty slug, and the URL is then just the
 * id, which is correct rather than a row of hyphens.
 */
export function slugify(title) {
  if (!title || typeof title !== 'string') return '';
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')   // strip combining accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');              // slice may have left a trailing hyphen
}

/**
 * Builds the canonical path for a post.
 *
 * @param {string} username author's username
 * @param {{id: number|string, title?: string}} post
 * @param {string} [suffix] e.g. '/discussion'
 */
export function postPath(username, post, suffix = '') {
  if (!post || post.id == null) return `/users/${username}`;
  const slug = slugify(post.title);
  const segment = slug ? `${post.id}-${slug}` : String(post.id);
  return `/users/${username}/${segment}${suffix}`;
}

/**
 * Extracts the numeric id from a route segment, accepting both the slugged form
 * and a bare id.
 *
 * @returns {string|null} the id as a string, or null if the segment has none
 */
export function parsePostId(segment) {
  if (segment == null) return null;
  const match = String(segment).match(/^(\d+)/);
  return match ? match[1] : null;
}
