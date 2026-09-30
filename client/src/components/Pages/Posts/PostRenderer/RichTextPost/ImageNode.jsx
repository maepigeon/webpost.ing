import { DecoratorNode, $getNodeByKey } from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useState, useRef, useCallback } from 'react';
import { IMAGES_BASE_URL } from '../../../../../config.js';
import { prefixSrcset, adaptiveSizes } from '../../../../../utils/responsiveImage.js';

function ImageComponent({ src, altText, nodeKey, alignment = 'center', width = null, srcset = null, editable = true }) {
  const [editor] = useLexicalComposerContext();
  const [showControls, setShowControls] = useState(false);
  const imgRef = useRef(null);
  const isResizingRef = useRef(false);

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
    e.stopPropagation();
    isResizingRef.current = true;
    setShowControls(true);
    const startX = e.clientX;
    const startWidth = imgRef.current?.offsetWidth ?? 400;

    const onMove = (mv) => {
      const newWidth = Math.max(80, startWidth + (mv.clientX - startX));
      if (imgRef.current) imgRef.current.style.width = newWidth + 'px';
    };
    const onUp = (mv) => {
      isResizingRef.current = false;
      setShowControls(false);
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
        onMouseLeave={() => editable && !isResizingRef.current && setShowControls(false)}
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
            >Del</button>
          </div>
        )}
        <img
          ref={imgRef}
          src={IMAGES_BASE_URL + src}
          srcSet={prefixSrcset(srcset, IMAGES_BASE_URL)}
          sizes={srcset ? adaptiveSizes() : undefined}
          alt={altText}
          className="editor-image"
          style={imgStyle}
          draggable={false}
          loading="lazy"
          decoding="async"
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
  /**
   * Candidate renditions for an <img srcset>, e.g.
   * "/uploads/a-480w.jpg 480w, /uploads/a-960w.jpg 960w, /uploads/a.jpg 2400w".
   *
   * Optional throughout. Posts written before responsive uploads existed have
   * no srcset and render from __src alone, so nothing needs backfilling.
   */
  __srcset;

  static getType() { return 'image'; }

  static clone(node) {
    return new ImageNode(node.__src, node.__altText, node.__alignment, node.__width,
                         node.__srcset, node.__key);
  }

  constructor(src, altText, alignment = 'center', width = null, srcset = null, key) {
    super(key);
    this.__src = src;
    this.__altText = altText;
    this.__alignment = alignment;
    this.__width = width;
    this.__srcset = srcset;
  }

  static importJSON(serializedNode) {
    return new ImageNode(
      serializedNode.src,
      serializedNode.altText,
      serializedNode.alignment ?? 'center',
      serializedNode.width ?? null,
      serializedNode.srcset ?? null,
    );
  }

  exportJSON() {
    const json = {
      type: 'image',
      version: 1,
      src: this.__src,
      altText: this.__altText,
      alignment: this.__alignment,
      width: this.__width,
    };
    // Only serialised when present, so documents from before responsive uploads
    // round-trip byte-identical.
    if (this.__srcset) json.srcset = this.__srcset;
    return json;
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
        srcset={this.__srcset}
        editable={editable}
      />
    );
  }
}

export function $createImageNode(src, altText, srcset = null) {
  return new ImageNode(src, altText, 'center', null, srcset);
}

export function $isImageNode(node) {
  return node instanceof ImageNode;
}
