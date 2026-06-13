import { Link } from 'react-router-dom';

/**
 * Renders text with:
 *   - URLs → <a> external link
 *   - #hashtag → <Link to="/search?tag=...">
 */
export function linkifyText(text) {
  if (!text) return text;
  // Combined pattern: URL or #hashtag
  const pattern = /(https?:\/\/[^\s<>"']+|#([a-zA-Z0-9_]{1,50}))/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[0].startsWith('#')) {
      const tag = match[2];
      parts.push(
        <Link
          key={key++}
          to={`/search?tag=${encodeURIComponent(tag)}`}
          className="hashtag-link"
          style={{ color: '#6c63ff', fontWeight: 600, textDecoration: 'none' }}
          onClick={e => e.stopPropagation()}
        >
          #{tag}
        </Link>
      );
    } else {
      parts.push(
        <a
          key={key++}
          href={match[0]}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#1a73e8', wordBreak: 'break-all' }}
          onClick={e => e.stopPropagation()}
        >
          {match[0]}
        </a>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : text;
}
