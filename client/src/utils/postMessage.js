/**
 * A message that shares a post is ordinary text with one line of the form
 * "[[post:<id>]]", the same idea as a shared pack (see packMessage.js). The
 * lines above it say what was shared, so notifications and conversation
 * previews read naturally; the messages page draws the post as a card.
 *
 * The id is all the message carries. Who may see the post is decided when the
 * card is drawn, so a draft never travels inside a message.
 */
import { splitPacks } from './packMessage.js';

const POST_LINE = /^\[\[post:(\d{1,18})\]\]$/;

const MAX_TITLE = 80;

/** The text to send for a shared post, with an optional note from the sender. */
export function postMessage(title, id, note = '') {
  const name = String(title || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE) || 'Untitled';
  const lines = [`Shared a post: ${name}`];
  if (note && note.trim()) lines.push(note.trim());
  lines.push(`[[post:${id}]]`);
  return lines.join('\n');
}

/** Splits a message into its text and the ids of any posts it shares. */
export function splitPosts(content) {
  if (!content) return { text: content, postIds: [] };
  const postIds = [];
  const lines = content.split('\n').filter(line => {
    const m = POST_LINE.exec(line.trim());
    if (m) postIds.push(m[1]);
    return !m;
  });
  return { text: lines.join('\n').trimEnd(), postIds };
}

/** A message's text with every shared pack and post line removed, for previews. */
export function plainMessageText(content) {
  return splitPosts(splitPacks(content).text).text;
}
