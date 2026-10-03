// The Stats tab's card-previews line, apart from React so the wording can be tested.
// `status` is the server's { remaining, ... } from GET /api/admin/previews.

/** How many posts still wait for a card preview, or null when the status is unknown. */
export function previewsLeft(status) {
  const n = Number(status?.remaining);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** "Card previews: 12 left", "Card previews: up to date", or '' while unknown. */
export function previewLineText(status) {
  const left = previewsLeft(status);
  if (left === null) return '';
  return left > 0 ? `Card previews: ${left} left` : 'Card previews: up to date';
}
