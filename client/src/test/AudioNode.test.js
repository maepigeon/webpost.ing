import { describe, it, expect, vi } from 'vitest';
import { createEditor } from 'lexical';
import { AudioNode, $createAudioNode, $isAudioNode, formatTime } from '../components/Pages/Posts/PostRenderer/RichTextPost/AudioNode.jsx';

vi.stubGlobal('import', { meta: { env: {} } });

function inEditor(fn) {
  return new Promise((resolve, reject) => {
    const editor = createEditor({ nodes: [AudioNode] });
    editor.update(() => {
      try { resolve(fn()); } catch (e) { reject(e); }
    });
  });
}

describe('AudioNode', () => {
  it('getType returns "audio"', () => {
    expect(AudioNode.getType()).toBe('audio');
  });

  it('exportJSON has the stored shape', () =>
    inEditor(() => {
      const node = $createAudioNode('/uploads/audio/a.mp3', 'song.mp3');
      expect(node.exportJSON()).toEqual({ type: 'audio', version: 1, src: '/uploads/audio/a.mp3', title: 'song.mp3' });
    }));

  it('importJSON round-trips through exportJSON', () =>
    inEditor(() => {
      const json = $createAudioNode('/uploads/audio/a.mp3', 'song.mp3').exportJSON();
      const restored = AudioNode.importJSON(json);
      expect(restored.exportJSON()).toEqual(json);
    }));

  it('importJSON tolerates a missing title', () =>
    inEditor(() => {
      expect(AudioNode.importJSON({ type: 'audio', version: 1, src: '/x.mp3' }).__title).toBe('');
    }));

  it('clone keeps src and title', () =>
    inEditor(() => {
      const cloned = AudioNode.clone(new AudioNode('/x.mp3', 't'));
      expect(cloned.__src).toBe('/x.mp3');
      expect(cloned.__title).toBe('t');
    }));

  it('is a block node, identified by $isAudioNode', () =>
    inEditor(() => {
      const node = $createAudioNode('/x.mp3');
      expect(node.isInline()).toBe(false);
      expect($isAudioNode(node)).toBe(true);
      expect($isAudioNode({ type: 'audio' })).toBe(false);
    }));
});

describe('formatTime', () => {
  it('reads minutes and zero-padded seconds', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(83.9)).toBe('1:23');
    expect(formatTime(NaN)).toBe('0:00');
    expect(formatTime(Infinity)).toBe('0:00');
  });
});
