import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection } from 'lexical';

// On macOS, "Press and Hold" shows an accent picker instead of auto-repeating.
// Fix: call e.preventDefault() on every printable keydown to suppress the OS picker,
// insert the character ourselves immediately, then repeat at ~30 chars/sec after 500ms.
// Uses registerRootListener so listeners attach correctly regardless of mount timing.
export default function KeyRepeatPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
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

    const insertChar = (char) => {
      editor.update(() => {
        const sel = $getSelection();
        if ($isRangeSelection(sel)) sel.insertText(char);
      });
    };

    const onKeyDown = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key.length !== 1) return;

      // Prevent accent picker (first press) and OS-default repeat insertions (e.repeat=true).
      // Must come before the e.repeat check so OS doesn't also insert on held keys.
      e.preventDefault();
      if (e.repeat) return; // our timer handles repeat — just needed preventDefault above

      cancel(); // clear any lingering timers from a previous key
      const char = e.key;
      held = char;
      insertChar(char);
      holdTimer = setTimeout(() => {
        repeatInterval = setInterval(() => { if (held) insertChar(held); }, 33);
      }, 500);
    };

    const onKeyUp = () => cancel();
    const onBlur = () => cancel();

    const attach = (el) => {
      el.addEventListener('keydown', onKeyDown);
      el.addEventListener('keyup', onKeyUp);
      el.addEventListener('blur', onBlur);
    };

    const detach = (el) => {
      el.removeEventListener('keydown', onKeyDown);
      el.removeEventListener('keyup', onKeyUp);
      el.removeEventListener('blur', onBlur);
    };

    return editor.registerRootListener((rootElement, prevRootElement) => {
      if (prevRootElement) { detach(prevRootElement); cancel(); }
      if (rootElement) attach(rootElement);
    });
  }, [editor]);

  return null;
}
