/**
 * What a signed-in visitor would see of the owner's posts: only published
 * ones, in the same order. A pure client-side filter; the server is never
 * asked for a different list. Anything that is not an array comes back as is.
 */
export function visiblePostsFor(posts, { previewing = false } = {}) {
  if (!previewing || !Array.isArray(posts)) return posts;
  return posts.filter(p => p && p.published);
}
