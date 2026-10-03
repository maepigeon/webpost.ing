import { describe, it, expect, vi } from 'vitest';
import { createEditor } from 'lexical';
import { ButtonNode, $createButtonNode, $isButtonNode } from '../components/Pages/Posts/PostRenderer/RichTextPost/ButtonNode.jsx';
import { validateTarget, normaliseButton, isSitePath, BUTTON_LABEL_MAX } from '../components/Pages/Posts/PostRenderer/RichTextPost/buttonTarget.js';

vi.stubGlobal('import', { meta: { env: {} } });

function inEditor(fn) {
  return new Promise((resolve, reject) => {
    const editor = createEditor({ nodes: [ButtonNode] });
    editor.update(() => {
      try { resolve(fn()); } catch (e) { reject(e); }
    });
  });
}

describe('ButtonNode', () => {
  it('has type "button" and the stored shape', () =>
    inEditor(() => {
      expect(ButtonNode.getType()).toBe('button');
      const node = $createButtonNode({ label: 'Go', action: 'post', target: '/mae/hi', style: 'pixel', align: 'right' });
      expect(node.exportJSON()).toEqual({ type: 'button', version: 1, label: 'Go', action: 'post', target: '/mae/hi', style: 'pixel', align: 'right' });
    }));

  it('round-trips through importJSON', () =>
    inEditor(() => {
      const json = $createButtonNode({ label: 'Song', action: 'audio', target: '/uploads/a.mp3', style: 'outline', align: 'center' }).exportJSON();
      expect(ButtonNode.importJSON(json).exportJSON()).toEqual(json);
    }));

  it('fills defaults and drops unknown fields', () =>
    inEditor(() => {
      const json = ButtonNode.importJSON({ type: 'button', version: 1, label: 'x', action: 'dance', style: 'neon', extra: 1 }).exportJSON();
      expect(json).toEqual({ type: 'button', version: 1, label: 'x', action: 'link', target: '', style: 'solid', align: 'left' });
    }));

  it('clone keeps the data, and $isButtonNode identifies it', () =>
    inEditor(() => {
      const node = $createButtonNode({ label: 'a', target: 'https://x.io' });
      expect(ButtonNode.clone(node).exportJSON()).toEqual(node.exportJSON());
      expect($isButtonNode(node)).toBe(true);
      expect($isButtonNode({ type: 'button' })).toBe(false);
    }));
});

describe('button targets', () => {
  it('link: web addresses and site paths only', () => {
    expect(validateTarget('link', 'https://example.com/a')).toBe('');
    expect(validateTarget('link', '/mae')).toBe('');
    for (const bad of ['javascript:alert(1)', 'mailto:a@b.c', '//evil.example', '', 'https://a b', 'example.com'])
      expect(validateTarget('link', bad)).not.toBe('');
  });
  it('post: site paths only', () => {
    expect(validateTarget('post', '/mae/hello')).toBe('');
    expect(validateTarget('post', 'https://example.com')).not.toBe('');
    expect(validateTarget('post', '/')).not.toBe('');
    expect(isSitePath('/\\evil')).toBe(false);
  });
  it('audio: an upload path with no tricks', () => {
    expect(validateTarget('audio', '/uploads/audio/a.mp3')).toBe('');
    for (const bad of ['https://x.io/a.mp3', '/uploads/../etc', '/uploads//a.mp3', '/other/a.mp3'])
      expect(validateTarget('audio', bad)).not.toBe('');
  });
  it('an unknown action is refused', () => expect(validateTarget('dance', '/mae')).not.toBe(''));
  it('labels are cleaned and capped', () => {
    const label = normaliseButton({ label: `a\u0007${'b'.repeat(80)}` }).label;
    expect(label.length).toBe(BUTTON_LABEL_MAX);
    expect(label).not.toContain('\u0007');
  });
});
