/**
 * A post's date as a newspaper dateline — "September 30, 2026" — with the
 * exact local time for a tooltip. Empty for a post not yet saved.
 */
export function postDateline(value) {
  if (!value) return { text: '', full: '', iso: '' };
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { text: '', full: '', iso: '' };
  return {
    text: d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
    full: d.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' }),
    iso: d.toISOString(),
  };
}
