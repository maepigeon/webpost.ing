import { Link } from 'react-router-dom';
import { linkifyText } from './linkifyText.jsx';

// The same rule the server uses: "@" + a username (3 to 32 of letters, digits,
// "_" and "-"), not glued to a word before it, not running on into more
// username characters.
const MENTION = /(?<![\w@])@([A-Za-z0-9_-]{3,32})(?![A-Za-z0-9_-])/g;

/** The @names in a text, in order, without the "@". */
export function findMentions(text) {
  if (!text) return [];
  return [...text.matchAll(MENTION)].map(m => m[1]);
}

/**
 * Comment text as React nodes: @name becomes a link to that member's page
 * (the text stays "@name"), the rest is linkified as before. Built from nodes,
 * never from HTML.
 */
export function renderComment(text) {
  if (!text) return text;
  const out = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(MENTION)) {
    if (m.index > last) out.push(...[].concat(linkifyText(text.slice(last, m.index))));
    out.push(
      <Link key={`m${key++}`} to={`/${m[1]}`} className="mention-link"
        onClick={e => e.stopPropagation()}>@{m[1]}</Link>
    );
    last = m.index + m[0].length;
  }
  if (last === 0) return linkifyText(text);
  if (last < text.length) out.push(...[].concat(linkifyText(text.slice(last))));
  return out;
}

/**
 * The @name being typed at the caret, if any: { start, query } where start is
 * the index of the "@". Needs at least 2 characters after the "@".
 */
export function activeMention(text, caret) {
  const before = (text || '').slice(0, caret);
  const m = /(?<![\w@])@([A-Za-z0-9_-]{2,32})$/.exec(before);
  return m ? { start: m.index, query: m[1] } : null;
}
