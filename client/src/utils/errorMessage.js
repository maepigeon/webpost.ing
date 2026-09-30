/**
 * Text to show for a failed request.
 *
 * Endpoints answer errors in a few shapes — plain text, {message}, {error} —
 * and Spring's own error page is a JSON object. Showing response.data as-is
 * put that object into the page, which React cannot render, so a server
 * error took the whole page down instead of printing a line.
 */
export function errorMessage(err, fallback) {
  const data = err?.response?.data;
  let text = '';
  if (typeof data === 'string') text = data;
  else if (data && typeof data === 'object') {
    // Spring's error object has an "error" field that is only the status name.
    const springDefault = 'timestamp' in data && 'status' in data;
    text = (typeof data.message === 'string' && data.message)
      || (!springDefault && typeof data.error === 'string' && data.error) || '';
  }
  text = text.trim();
  // An HTML error page from a proxy is not a message.
  if (!text || text.length > 300 || text.startsWith('<')) return fallback;
  return text;
}
