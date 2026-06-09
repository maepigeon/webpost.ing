import { CodeNode } from '@lexical/code';

export class CustomCodeNode extends CodeNode {
  __lightMode = false;
  __lineNumbers = false;

  static getType() { return 'code'; }

  static clone(node) {
    const clone = new CustomCodeNode(node.getLanguage() ?? '', node.getKey());
    clone.__lightMode = node.__lightMode;
    clone.__lineNumbers = node.__lineNumbers;
    return clone;
  }

  constructor(language, key) {
    super(language, key);
  }

  getLightMode() { return this.__lightMode; }
  getLineNumbers() { return this.__lineNumbers; }

  setLightMode(v) {
    const w = this.getWritable();
    w.__lightMode = v;
    return w;
  }

  setLineNumbers(v) {
    const w = this.getWritable();
    w.__lineNumbers = v;
    return w;
  }

  createDOM(config, editor) {
    const dom = super.createDOM(config, editor);
    if (this.__lightMode) dom.classList.add('code-light');
    if (this.__lineNumbers) {
      dom.classList.add('show-line-numbers');
      requestAnimationFrame(() => _refreshGutter(dom));
    }
    return dom;
  }

  updateDOM(prevNode, dom, config, editor) {
    const shouldReplace = super.updateDOM(prevNode, dom, config, editor);
    if (shouldReplace) return true;

    if (prevNode.__lightMode !== this.__lightMode) {
      dom.classList.toggle('code-light', this.__lightMode);
    }

    const hasLines = this.__lineNumbers;
    if (prevNode.__lineNumbers !== hasLines || hasLines) {
      dom.classList.toggle('show-line-numbers', hasLines);
      if (!hasLines) {
        dom.querySelector('.line-nums-gutter')?.remove();
      } else {
        requestAnimationFrame(() => _refreshGutter(dom));
      }
    }

    return false;
  }

  exportJSON() {
    return {
      ...super.exportJSON(),
      type: 'code',
      lightMode: this.__lightMode,
      lineNumbers: this.__lineNumbers,
    };
  }

  static importJSON(serializedNode) {
    const node = $createCustomCodeNode(serializedNode.language ?? '');
    node.setFormat(serializedNode.format ?? 0);
    node.setIndent(serializedNode.indent ?? 0);
    if (serializedNode.direction) node.setDirection(serializedNode.direction);
    node.__lightMode = serializedNode.lightMode ?? false;
    node.__lineNumbers = serializedNode.lineNumbers ?? false;
    return node;
  }
}

function _refreshGutter(dom) {
  if (!dom.classList.contains('show-line-numbers')) return;
  const lineCount = dom.querySelectorAll('br').length + 1;
  let gutter = dom.querySelector('.line-nums-gutter');
  if (gutter && gutter.children.length === lineCount) return;
  if (gutter) gutter.remove();
  gutter = document.createElement('div');
  gutter.className = 'line-nums-gutter';
  for (let i = 1; i <= lineCount; i++) {
    const s = document.createElement('span');
    s.textContent = i;
    gutter.appendChild(s);
  }
  dom.insertBefore(gutter, dom.firstChild);
}

export function $createCustomCodeNode(language = '') {
  return new CustomCodeNode(language);
}

export function $isCustomCodeNode(node) {
  return node instanceof CustomCodeNode;
}
