/**
 * A message that shares a pack is ordinary text with one line of the form
 * "[[pack:<uuid>]]". The line above it says what was shared, so notifications
 * and conversation previews read naturally; the messages page draws the pack.
 */
const PACK_LINE = /^\[\[pack:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]\]$/i;

export const PACK_KINDS = { stickers: 'sticker pack', symbols: 'symbols pack' };

/** The text to send for a shared pack. */
export function packMessage(kind, name, id) {
  return `Shared a ${PACK_KINDS[kind] || 'pack'}: ${name}\n[[pack:${id}]]`;
}

/** Splits a message into its text and the ids of any packs it shares. */
export function splitPacks(content) {
  if (!content) return { text: content, packIds: [] };
  const packIds = [];
  const lines = content.split('\n').filter(line => {
    const m = PACK_LINE.exec(line.trim());
    if (m) packIds.push(m[1].toLowerCase());
    return !m;
  });
  return { text: lines.join('\n').trimEnd(), packIds };
}
