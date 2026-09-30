import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guards the flat-fill rule.
 *
 * Gradients have crept back into this codebase four separate times, each time
 * after being removed by hand. A review cannot catch that reliably; a test can.
 *
 * The rule (guide/style-guide.md): fills are flat. Depth comes from inset edge
 * highlights and drop shadows. A gradient is allowed only where the gradient IS
 * the content — the wallpaper engine, a transparency checkerboard, a texture —
 * and every such case is listed in ALLOWED below with a reason.
 *
 * If this test fails, the fix is almost always to use a flat colour. Adding an
 * entry to ALLOWED is for genuinely new categories, not for a button someone
 * wanted to look shiny.
 */

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** file → why a gradient is legitimate there */
const ALLOWED = {
  'components/PatternPicker/patterns.js':
    'The wallpaper engine. Gradients are the product it generates.',
  'components/PatternPicker/PatternPicker.jsx':
    'Placeholder text showing a user what a custom gradient looks like.',
  'components/Social/MessagesPage.css':
    'repeating-linear-gradient: a texture on the message thread, not a fill.',
  'components/ImageCrop/ImageCropDialog.css':
    'repeating-conic-gradient: the standard transparency checkerboard, and the crop scrim.',
  'components/Pages/Posts/PostsViewer/ProfileEditor.css':
    'The banner scrim — a legibility device that guarantees contrast over an arbitrary photo.',
};

/** Elements that must never carry a gradient, whatever the file allows. */
const NEVER = [
  '.home-user-card',
  '.search-user-card',
  '.avatar-popup',
  '.comment-avatar',
  '.navButton',
  '.messages-bubble',
];

function cssAndJsxFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) cssAndJsxFiles(full, out);
    else if (/\.(css|jsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const files = cssAndJsxFiles(SRC).filter(f => !f.includes(`${path.sep}test${path.sep}`));

describe('the flat-fill rule', () => {
  it('has no gradients outside the documented exceptions', () => {
    const offenders = [];
    for (const file of files) {
      const relative = path.relative(SRC, file).split(path.sep).join('/');
      if (ALLOWED[relative]) continue;
      fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (!/gradient\(/.test(line)) return;
        if (/^\s*(\/\*|\*|\/\/)/.test(line)) return;   // a comment mentioning one
        offenders.push(`${relative}:${i + 1}  ${line.trim().slice(0, 80)}`);
      });
    }
    expect(offenders, `Gradient fills are not allowed. See guide/style-guide.md.\n${offenders.join('\n')}`)
      .toEqual([]);
  });

  it('never puts a gradient on an avatar, user card, nav button or chat bubble', () => {
    // These have each been flattened by hand and come back. Even inside a file
    // that is allowed a gradient elsewhere, these selectors are off limits.
    const offenders = [];
    for (const file of files) {
      const relative = path.relative(SRC, file).split(path.sep).join('/');
      const text = fs.readFileSync(file, 'utf8');
      for (const rule of text.split('}')) {
        const selector = (rule.split('{')[0] || '');
        const body = rule.split('{').slice(1).join('{');
        if (!/gradient\(/.test(body)) continue;
        for (const banned of NEVER) {
          if (selector.includes(banned)) offenders.push(`${relative}  ${banned}`);
        }
      }
    }
    expect(offenders, `These elements must stay flat:\n${offenders.join('\n')}`).toEqual([]);
  });
});
