import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection } from 'lexical';

// On macOS, holding a key shows an accent picker instead of auto-repeating.
// This plugin simulates key repeat inside the editor: after holding a printable
// character for 500ms it starts inserting at ~30 chars/sec, matching the feel
// of Windows / Linux key repeat.
export default function KeyRepeatPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;

    let holdTimer = null;
    let repeatInterval = null;
    let held = null;

    const cancel = () => {
      clearTimeout(holdTimer);
      clearInterval(repeatInterval);
      holdTimer = null;
      repeatInterval = null;
      held = null;
    };

    const insertHeld = () => {
      if (!held) return;
      const char = held;
      editor.update(() => {
        const sel = $getSelection();
        if ($isRangeSelection(sel)) sel.insertText(char);
      });
    };

    const onKeyDown = (e) => {
      if (e.repeat) return; // already repeating natively
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length !== 1) return; // not a printable character

      held = e.key;
      holdTimer = setTimeout(() => {
        repeatInterval = setInterval(insertHeld, 33); // ~30 chars/sec
      }, 500);
    };

    const onKeyUp = () => cancel();
    const onBlur = () => cancel();

    root.addEventListener('keydown', onKeyDown);
    root.addEventListener('keyup', onKeyUp);
    root.addEventListener('blur', onBlur);

    return () => {
      cancel();
      root.removeEventListener('keydown', onKeyDown);
      root.removeEventListener('keyup', onKeyUp);
      root.removeEventListener('blur', onBlur);
    };
  }, [editor]);

  return null;
}
