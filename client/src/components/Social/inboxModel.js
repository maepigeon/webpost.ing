// What a notification says and where it goes, apart from React so each rule
// can be tested. The server sends, per item: type, actorUsername, postId,
// postOwner, postTitle, commentId, message, and (newer servers) commentExcerpt,
// subjectGone and reaction. An older server leaves those three out: absent
// means no excerpt and not gone.
import { postPath } from '../../utils/postUrl.js';

const COMMENT_TYPES = ['comment', 'reply', 'mention'];
const POST_TYPES = [...COMMENT_TYPES, 'reaction', 'new_post'];

export const GONE_TEXT = 'a post that is no longer available';
export const UNTITLED_TEXT = 'an untitled post';

/** The post or comment this is about was deleted or can no longer be opened. */
export function isGone(n) {
  return POST_TYPES.includes(n.type) && n.subjectGone === true;
}

/** The post's title as it reads in the sentence; never the bare words "your post". */
export function subjectTitle(n) {
  const t = typeof n.postTitle === 'string' ? n.postTitle.trim() : '';
  return t || UNTITLED_TEXT;
}

/** The route a notification opens, or null when there is nothing to open. */
export function notifHref(n) {
  if (isGone(n)) return null;
  if (POST_TYPES.includes(n.type)) {
    const owner = n.type === 'new_post' ? (n.postOwner || n.actorUsername) : n.postOwner;
    if (!owner || !n.postId) return null;
    const base = postPath(owner, { id: n.postId, title: n.postTitle });
    if (COMMENT_TYPES.includes(n.type)) return `${base}/discussion${n.commentId ? `#comment-${n.commentId}` : ''}`;
    return base;
  }
  if (n.type === 'follow') return n.actorUsername ? `/${n.actorUsername}` : null;
  if (n.type === 'message') return n.actorUsername ? `/messages?with=${encodeURIComponent(n.actorUsername)}` : null;
  return null;
}

/** The quiet second line: what was said. Plain text, or null. */
export function notifExcerpt(n) {
  if (isGone(n)) return null;
  const text = n.type === 'message' ? n.message : n.commentExcerpt;
  return typeof text === 'string' && text.trim() ? text.trim() : null;
}
