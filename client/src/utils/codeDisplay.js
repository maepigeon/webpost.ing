/**
 * Reader preferences for code blocks.
 *
 * These change how *this* reader sees code in every post, not how an author's
 * post looks to everyone. Reading comfort is personal — a size that suits one
 * person's eyes and screen should not be imposed on the rest.
 *
 * Applied as CSS custom properties on <html>, so every code block picks them up
 * without any component knowing the preference exists.
 */

import { ensureFontsIn } from './fontLoader.js';

/**
 * The families offered, keyed to match the server's allowlist.
 *
 * Each stack names real fonts first and falls back to the generic `monospace`,
 * so a reader who does not have JetBrains Mono installed still gets a
 * monospaced face rather than the browser's default proportional font.
 */
export const CODE_FONTS = {
  default:      { label: 'Default',          stack: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace" },
  system:       { label: 'System monospace', stack: 'monospace' },
  jetbrains:    { label: 'JetBrains Mono',   stack: "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace" },
  fira:         { label: 'Fira Code',        stack: "'Fira Code', 'Fira Mono', ui-monospace, Menlo, Consolas, monospace" },
  'ibm-plex':   { label: 'IBM Plex Mono',    stack: "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace" },
  'source-code':{ label: 'Source Code Pro',  stack: "'Source Code Pro', ui-monospace, Menlo, Consolas, monospace" },
  menlo:        { label: 'Menlo',            stack: "Menlo, ui-monospace, Consolas, monospace" },
  consolas:     { label: 'Consolas',         stack: "Consolas, ui-monospace, Menlo, monospace" },
  courier:      { label: 'Courier',          stack: "'Courier New', Courier, monospace" },
};

export const MIN_CODE_SIZE = 10;
export const MAX_CODE_SIZE = 24;
export const DEFAULT_CODE_SIZE = 13;

/** Applies the preferences to the document. Safe to call with partial values. */
export function applyCodeDisplay({ codeFont, codeFontSize } = {}) {
  const root = document.documentElement;
  const font = CODE_FONTS[codeFont] || CODE_FONTS.default;
  root.style.setProperty('--code-font', font.stack);
  ensureFontsIn(font.stack);   // web fonts load on demand: JetBrains Mono and IBM Plex Mono need asking for

  const size = Number(codeFontSize);
  const clamped = Number.isFinite(size)
    ? Math.min(MAX_CODE_SIZE, Math.max(MIN_CODE_SIZE, size))
    : DEFAULT_CODE_SIZE;
  root.style.setProperty('--code-font-size', `${clamped}px`);
}
