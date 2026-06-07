import { DecoratorNode, $getNodeByKey } from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useState, useRef, useCallback } from 'react';
import { IMAGES_BASE_URL } from '../../../../../config.js';

function ImageComponent({ src, altText, nodeKey, alignment = 'center', width = null, editable = true }) {
  const [editor] = useLexicalComposerContext();
  const [showControls, setShowControls] = useState(false);
  const imgRef = useRef(null);

  const updateNode = useCallback((changes) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (node) {
        const w = node.getWritable();
        Object.assign(w, changes);
      }
    });
  }, [editor, nodeKey]);

  const moveNode = useCallback((direction) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (!node) return;
      if (direction === 'up') {
        const prev = node.getPreviousSibling();
        if (prev) {
          node.remove();
          prev.insertBefore(node);
        }
      } else {
        const next = node.getNextSibling();
        if (next) {
          node.remove();
          next.insertAfter(node);
        }
      }
    });
  }, [editor, nodeKey]);

  const deleteNode = useCallback(() => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (node) node.remove();
    });
  }, [editor, nodeKey]);

  const startResize = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = imgRef.current?.offsetWidth ?? 400;

    const onMove = (mv) => {
      const newWidth = Math.max(80, startWidth + (mv.clientX - startX));
      if (imgRef.current) imgRef.current.style.width = newWidth + 'px';
    };
    const onUp = (mv) => {
      const newWidth = Math.max(80, startWidth + (mv.clientX - startX));
      updateNode({ __width: newWidth });
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [updateNode]);

  const imgStyle = width ? { width, maxWidth: '100%' } : { maxWidth: '100%' };

  const wrapperClass = [
    'editor-image-wrapper',
    `editor-image-align-${alignment}`,
    editable ? 'editor-image-editable' : '',
  ].join(' ');

  return (
    <div className={wrapperClass}>
      <div
        className="editor-image-frame"
        onMouseEnter={() => editable && setShowControls(true)}
        onMouseLeave={() => editable && setShowControls(false)}
      >
        {editable && showControls && (
          <div className="editor-image-controls">
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); moveNode('up'); }}
              title="Move up"
            >↑</button>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); moveNode('down'); }}
              title="Move down"
            >↓</button>
            <span className="editor-image-controls-sep" />
            <button
              type="button"
              className={alignment === 'left' ? 'active' : ''}
              onMouseDown={(e) => { e.preventDefault(); updateNode({ __alignment: 'left' }); }}
              title="Align left"
            >⬅</button>
            <button
              type="button"
              className={alignment === 'center' ? 'active' : ''}
              onMouseDown={(e) => { e.preventDefault(); updateNode({ __alignment: 'center' }); }}
              title="Center"
            >↔</button>
            <button
              type="button"
              className={alignment === 'right' ? 'active' : ''}
              onMouseDown={(e) => { e.preventDefault(); updateNode({ __alignment: 'right' }); }}
              title="Align right"
            >➡</button>
            <button
              type="button"
              className={alignment === 'full' ? 'active' : ''}
              onMouseDown={(e) => { e.preventDefault(); updateNode({ __alignment: 'full' }); }}
              title="Full width"
            >⇔</button>
            <span className="editor-image-controls-sep" />
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); deleteNode(); }}
              title="Delete image"
              style={{ color: '#ff7b7b' }}
            >🗑</button>
          </div>
        )}
        <img
          ref={imgRef}
          src={IMAGES_BASE_URL + src}
          alt={altText}
          className="editor-image"
          style={imgStyle}
          draggable={false}
        />
        {editable && showControls && (
          <div className="editor-image-resize-handle" onMouseDown={startResize} />
        )}
      </div>
    </div>
  );
}

export class ImageNode extends DecoratorNode {
  __src;
  __altText;
  __alignment;
  __width;

  static getType() { return 'image'; }

  static clone(node) {
    return new ImageNode(node.__src, node.__altText, node.__alignment, node.__width, node.__key);
  }

  constructor(src, altText, alignment = 'center', width = null, key) {
    super(key);
    this.__src = src;
    this.__altText = altText;
    this.__alignment = alignment;
    this.__width = width;
  }

  static importJSON(serializedNode) {
    return new ImageNode(
      serializedNode.src,
      serializedNode.altText,
      serializedNode.alignment ?? 'center',
      serializedNode.width ?? null,
    );
  }

  exportJSON() {
    return {
      type: 'image',
      version: 1,
      src: this.__src,
      altText: this.__altText,
      alignment: this.__alignment,
      width: this.__width,
    };
  }

  createDOM() {
    const span = document.createElement('span');
    return span;
  }

  updateDOM() { return false; }
  isInline() { return false; }

  decorate(editor) {
    const editable = editor.isEditable();
    return (
      <ImageComponent
        src={this.__src}
        altText={this.__altText}
        nodeKey={this.__key}
        alignment={this.__alignment ?? 'center'}
        width={this.__width}
        editable={editable}
      />
    );
  }
}

export function $createImageNode(src, altText) {
  return new ImageNode(src, altText);
}

export function $isImageNode(node) {
  return node instanceof ImageNode;
}
