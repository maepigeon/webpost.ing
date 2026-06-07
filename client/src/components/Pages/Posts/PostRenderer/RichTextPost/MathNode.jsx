import { DecoratorNode, $getNodeByKey, $createParagraphNode } from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useState, useRef, useCallback, useEffect } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

function MathComponent({ equation, nodeKey }) {
  const [editor] = useLexicalComposerContext();
  const editable = editor.isEditable();
  const [showControls, setShowControls] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(equation);
  const [copiedLatex, setCopiedLatex] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [editing]);

  const updateEquation = useCallback((newEq) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (node) {
        const w = node.getWritable();
        w.__equation = newEq;
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

  const commitEdit = () => {
    updateEquation(draft);
    setEditing(false);
  };

  const cancelEdit = () => {
    setDraft(equation);
    setEditing(false);
  };

  let html = '';
  try {
    html = katex.renderToString(equation || '\\text{empty}', { throwOnError: false, displayMode: true });
  } catch {
    html = `<span style="color:red">Invalid LaTeX</span>`;
  }

  if (editing) {
    return (
      <div className="editor-math-block editor-math-editing">
        <textarea
          ref={textareaRef}
          className="editor-math-input"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit(); }
            if (e.key === 'Escape') cancelEdit();
          }}
          rows={3}
          placeholder="Enter LaTeX (e.g. \frac{a}{b})"
        />
        <div className="editor-math-edit-btns">
          <button type="button" onMouseDown={e => { e.preventDefault(); commitEdit(); }}>Save</button>
          <button type="button" onMouseDown={e => { e.preventDefault(); cancelEdit(); }} style={{ background: 'transparent', color: '#555', border: '1px solid #ccc' }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`editor-math-block${editable ? ' editor-math-editable' : ''}`}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      {showControls && (
        <div className="editor-image-controls editor-math-controls">
          {editable && <>
            <button type="button" onMouseDown={e => { e.preventDefault(); moveNode('up'); }} title="Move up">↑</button>
            <button type="button" onMouseDown={e => { e.preventDefault(); moveNode('down'); }} title="Move down">↓</button>
            <span className="editor-image-controls-sep" />
            <button type="button" onMouseDown={e => { e.preventDefault(); setDraft(equation); setEditing(true); }} title="Edit equation">✏</button>
            <button type="button" onMouseDown={e => { e.preventDefault(); deleteNode(); }} title="Delete math block" style={{ color: '#ff7b7b' }}>🗑</button>
            <span className="editor-image-controls-sep" />
          </>}
          <button
            type="button"
            onMouseDown={e => {
              e.preventDefault();
              navigator.clipboard.writeText(equation).then(() => {
                setCopiedLatex(true);
                setTimeout(() => setCopiedLatex(false), 1500);
              }).catch(() => {});
            }}
            title="Copy LaTeX"
          >
            {copiedLatex ? '✓' : '⎘ LaTeX'}
          </button>
        </div>
      )}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

export class MathNode extends DecoratorNode {
  __equation;

  static getType() { return 'math'; }

  static clone(node) {
    return new MathNode(node.__equation, node.__key);
  }

  constructor(equation, key) {
    super(key);
    this.__equation = equation || '';
  }

  static importJSON(serializedNode) {
    return new MathNode(serializedNode.equation);
  }

  exportJSON() {
    return { type: 'math', version: 1, equation: this.__equation };
  }

  createDOM() {
    return document.createElement('div');
  }

  updateDOM() { return false; }
  isInline() { return false; }

  decorate() {
    return <MathComponent equation={this.__equation} nodeKey={this.__key} />;
  }
}

export function $createMathNode(equation) {
  return new MathNode(equation);
}

export function $isMathNode(node) {
  return node instanceof MathNode;
}
