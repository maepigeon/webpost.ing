import { DecoratorNode, $getNodeByKey } from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useState, useRef, useCallback, useEffect } from 'react';
import { IMAGES_BASE_URL } from '../../../../../config.js';
import { prefixSrcset, adaptiveSizes } from '../../../../../utils/responsiveImage.js';

const MIN_WIDTH = 80;
const CORNERS = ['nw', 'ne', 'sw', 'se'];

function ImageComponent({ src, altText, nodeKey, alignment = 'center', width = null, srcset = null, editable = true }) {
  const [editor] = useLexicalComposerContext();
  const [hovered, setHovered] = useState(false);
  // Selected by a click: its handles stay until you click elsewhere, so they
  // can be reached on a touch screen too, where there is no hover.
  const [selected, setSelected] = useState(false);
  const [dragWidth, setDragWidth] = useState(null);
  const frameRef = useRef(null);
  const imgRef = useRef(null);

  useEffect(() => {
    if (!selected) return undefined;
    const away = (e) => { if (!frameRef.current?.contains(e.target)) setSelected(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [selected]);

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

  /**
   * Drag a corner: the image keeps its proportions and follows the pointer.
   * A centred image grows on both sides, so it moves twice as far per pixel
   * dragged; a left handle grows it leftwards.
   */
  const startResize = useCallback((e, corner) => {
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    handle.setPointerCapture?.(e.pointerId);
    const startX = e.clientX;
    const startWidth = imgRef.current?.offsetWidth ?? 400;
    const maxWidth = frameRef.current?.parentElement?.clientWidth || Infinity;
    const sign = corner.endsWith('w') ? -1 : 1;
    const factor = alignment === 'center' || alignment === 'full' ? 2 : 1;
    const widthAt = (x) => Math.round(Math.min(maxWidth, Math.max(MIN_WIDTH, startWidth + sign * factor * (x - startX))));

    const onMove = (mv) => setDragWidth(widthAt(mv.clientX));
    const onUp = (mv) => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      setDragWidth(null);
      updateNode({ __width: widthAt(mv.clientX), ...(alignment === 'full' ? { __alignment: 'center' } : {}) });
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }, [updateNode, alignment]);

  /** Arrow keys on a selected image: 10px a press, 50 with Shift. */
  const onKeyDown = (e) => {
    if (!selected || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const current = imgRef.current?.offsetWidth ?? 400;
    const step = (e.shiftKey ? 50 : 10) * (e.key === 'ArrowRight' ? 1 : -1);
    const maxWidth = frameRef.current?.parentElement?.clientWidth || Infinity;
    updateNode({ __width: Math.min(maxWidth, Math.max(MIN_WIDTH, current + step)) });
  };

  // Resizing a full-width image makes it a centred one of that width.
  const shownAlignment = alignment === 'full' && dragWidth != null ? 'center' : alignment;
  const shownWidth = dragWidth ?? width;
  const imgStyle = shownWidth ? { width: shownWidth, maxWidth: '100%' } : { maxWidth: '100%' };
  const showControls = editable && (hovered || selected || dragWidth != null);

  const wrapperClass = [
    'editor-image-wrapper',
    `editor-image-align-${shownAlignment}`,
    editable ? 'editor-image-editable' : '',
    editable && selected ? 'is-selected' : '',
  ].join(' ');

  return (
    <div className={wrapperClass}>
      <div
        ref={frameRef}
        className="editor-image-frame"
        onMouseEnter={() => editable && setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => editable && setSelected(true)}
        onKeyDown={editable ? onKeyDown : undefined}
        tabIndex={editable ? 0 : undefined}
        aria-label={editable ? `Image${width ? `, ${width} pixels wide` : ''}. Click to select, drag a corner or use the arrow keys to resize.` : undefined}
      >
        {showControls && (
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
        {showControls && CORNERS.map(corner => (
          <div
            key={corner}
            className={`editor-image-resize-handle editor-image-resize-handle--${corner}`}
            onPointerDown={(e) => startResize(e, corner)}
            aria-hidden="true"
          />
        ))}
        {dragWidth != null && <span className="editor-image-size">{dragWidth} px</span>}
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
