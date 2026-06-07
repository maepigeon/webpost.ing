import { describe, it, expect, vi } from 'vitest';
import { createEditor } from 'lexical';
import { ImageNode, $createImageNode, $isImageNode } from '../components/Pages/Posts/PostRenderer/RichTextPost/ImageNode.jsx';

// Stub import.meta.env so config.js resolves without Vite
vi.stubGlobal('import', { meta: { env: {} } });

// Run fn inside an editor.update() and return the result
function inEditor(fn) {
  return new Promise((resolve, reject) => {
    const editor = createEditor({ nodes: [ImageNode] });
    editor.update(() => {
      try { resolve(fn()); } catch (e) { reject(e); }
    });
  });
}

describe('ImageNode', () => {
  it('getType returns "image"', () => {
    expect(ImageNode.getType()).toBe('image');
  });

  it('$createImageNode sets src, altText, and defaults alignment to center', () =>
    inEditor(() => {
      const node = $createImageNode('/uploads/photo.jpg', 'a photo');
      expect(node.__src).toBe('/uploads/photo.jpg');
      expect(node.__altText).toBe('a photo');
      expect(node.__alignment).toBe('center');
      expect(node.__width).toBeNull();
    }));

  it('$isImageNode identifies ImageNode instances', () =>
    inEditor(() => {
      const node = $createImageNode('/uploads/test.png', 'test');
      expect($isImageNode(node)).toBe(true);
    }));

  it('$isImageNode returns false for non-ImageNode objects', () => {
    expect($isImageNode(null)).toBe(false);
    expect($isImageNode({ type: 'image' })).toBe(false);
  });

  it('exportJSON returns the correct shape including alignment and width', () =>
    inEditor(() => {
      const node = $createImageNode('/uploads/photo.jpg', 'a photo');
      const json = node.exportJSON();
      expect(json).toEqual({
        type: 'image',
        version: 1,
        src: '/uploads/photo.jpg',
        altText: 'a photo',
        alignment: 'center',
        width: null,
      });
    }));

  it('importJSON round-trips through exportJSON', () =>
    inEditor(() => {
      const original = $createImageNode('/uploads/photo.jpg', 'a photo');
      const json = original.exportJSON();
      const restored = ImageNode.importJSON(json);
      expect(restored.__src).toBe(original.__src);
      expect(restored.__altText).toBe(original.__altText);
      expect(restored.__alignment).toBe(original.__alignment);
      expect(restored.__width).toBe(original.__width);
    }));

  it('importJSON defaults alignment to center if missing (backward compat)', () =>
    inEditor(() => {
      const node = ImageNode.importJSON({ type: 'image', version: 1, src: '/uploads/x.jpg', altText: 'x' });
      expect(node.__alignment).toBe('center');
    }));

  it('clone produces a node with the same src, altText, alignment, and width', () =>
    inEditor(() => {
      const node = new ImageNode('/uploads/img.png', 'img', 'left', 320);
      const cloned = ImageNode.clone(node);
      expect(cloned.__src).toBe(node.__src);
      expect(cloned.__altText).toBe(node.__altText);
      expect(cloned.__alignment).toBe('left');
      expect(cloned.__width).toBe(320);
    }));

  it('isInline returns false (block-level node)', () =>
    inEditor(() => {
      const node = $createImageNode('/uploads/img.png', 'img');
      expect(node.isInline()).toBe(false);
    }));

  it('updateDOM returns false (React handles re-renders via decorate)', () =>
    inEditor(() => {
      const node = $createImageNode('/uploads/img.png', 'img');
      expect(node.updateDOM()).toBe(false);
    }));
});
