// A post's description (its "summary" in the API; `description` there is the body).
export const SUMMARY_MAX = 300;

/** One line of plain text: newlines become spaces, edges trimmed, capped at the limit. */
export function cleanSummary(raw) {
  return String(raw ?? '').replace(/\s*[\r\n]+\s*/g, ' ').trim().slice(0, SUMMARY_MAX);
}
