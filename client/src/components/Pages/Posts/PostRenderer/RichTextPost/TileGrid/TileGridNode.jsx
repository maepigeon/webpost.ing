import { DecoratorNode, $getNodeByKey } from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useCallback } from 'react';
import { normaliseGrid, defaultGrid } from './tileGrid.js';
import TileGrid from './TileGrid.jsx';

/** The tile grid as a block in a post: the designer, stored in the Lexical node. */
function TileGridBlock({ data, nodeKey }) {
  const [editor] = useLexicalComposerContext();

  const onChange = useCallback((patch) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (node) node.getWritable().__data = normaliseGrid({ ...node.__data, ...patch });
    });
  }, [editor, nodeKey]);

  const move = (direction) => editor.update(() => {
    const node = $getNodeByKey(nodeKey);
    if (!node) return;
    const sibling = direction === 'up' ? node.getPreviousSibling() : node.getNextSibling();
    if (!sibling) return;
    node.remove();
    if (direction === 'up') sibling.insertBefore(node); else sibling.insertAfter(node);
  });

  return (
    <TileGrid
      data={data}
      onChange={onChange}
      editable={editor.isEditable()}
      onMoveUp={() => move('up')}
      onMoveDown={() => move('down')}
      onDelete={() => editor.update(() => $getNodeByKey(nodeKey)?.remove())}
    />
  );
}

// ── Lexical node ──────────────────────────────────────────────────────────────

export class TileGridNode extends DecoratorNode {
  __data;

  static getType() { return 'tilegrid'; }

  static clone(node) {
    return new TileGridNode(node.__data, node.__key);
  }

  constructor(data, key) {
    super(key);
    this.__data = normaliseGrid(data);
  }

  static importJSON(serialized) {
    return new TileGridNode(serialized.grid);
  }

  exportJSON() {
    return { type: 'tilegrid', version: 1, grid: this.__data };
  }

  createDOM() {
    return document.createElement('div');
  }

  updateDOM() { return false; }
  isInline() { return false; }

  decorate() {
    return <TileGridBlock data={this.__data} nodeKey={this.__key} />;
  }
}

export function $createTileGridNode(data = defaultGrid()) {
  return new TileGridNode(data);
}

export function $isTileGridNode(node) {
  return node instanceof TileGridNode;
}
