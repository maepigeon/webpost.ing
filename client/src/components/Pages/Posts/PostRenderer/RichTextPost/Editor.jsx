import {
  $createParagraphNode, $createTextNode, $getSelection, $isRangeSelection, $isNodeSelection,
  $insertNodes, KEY_BACKSPACE_COMMAND, KEY_DELETE_COMMAND, KEY_ESCAPE_COMMAND, KEY_ENTER_COMMAND,
  COMMAND_PRIORITY_EDITOR, COMMAND_PRIORITY_LOW,
  UNDO_COMMAND, REDO_COMMAND, CAN_UNDO_COMMAND, CAN_REDO_COMMAND,
  FORMAT_TEXT_COMMAND, $getNodeByKey, $getRoot, $isParagraphNode, $isTextNode,
} from 'lexical';
import { $isHeadingNode } from '@lexical/rich-text';
import { $insertNodeToNearestRoot } from '@lexical/utils';
import { $isListNode } from '@lexical/list';
import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './Editor.css'
import TitleBar from "./TitleBar"

import { exampleTheme } from './exampleTheme';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { $setBlocksType, $patchStyleText, $getSelectionStyleValueForProperty } from '@lexical/selection';
import { $createHeadingNode, HeadingNode } from '@lexical/rich-text';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND, ListNode, ListItemNode } from '@lexical/list';
import { CodeNode, CodeHighlightNode, $isCodeNode, registerCodeHighlighting, getCodeLanguages, getLanguageFriendlyName } from '@lexical/code';
import { CustomCodeNode, $createCustomCodeNode } from './CustomCodeNode.jsx';
import { LinkNode, $createLinkNode, $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { ClickableLinkPlugin } from '@lexical/react/LexicalClickableLinkPlugin';
import { READ_POST, CREATE_POST, UPDATE_POST, GET_USER_FROM_POST, GET_POST_FEATURES, SET_REACTIONS_ENABLED, SET_DISCUSSION_ENABLED, SEARCH_POSTS } from '../../BasicTextPostServerApi.js';
import { useDialog } from '../../../../Dialog/Dialog.jsx';
import { useParams, useNavigate, Link } from "react-router-dom";
import { ImageNode, $createImageNode } from './ImageNode.jsx';
import { MathNode, $createMathNode } from './MathNode.jsx';
import axios from 'axios';
import { BASE_URL } from '../../../../../config.js';
import PatternPicker from '../../../../PatternPicker/PatternPicker.jsx';
import { patternToStyle } from '../../../../PatternPicker/patterns.js';
import { normaliseUploadResponse, describeUploadError } from '../../../../../utils/responsiveImage.js';
import ImageCropDialog from '../../../../ImageCrop/ImageCropDialog.jsx';
import ImagePicker from '../../../../ImagePicker/ImagePicker.jsx';
import { postPath, slugify } from '../../../../../utils/postUrl.js';

const EDITOR_NODES = [HeadingNode, ListNode, ListItemNode, CustomCodeNode, CodeHighlightNode, ImageNode, MathNode, LinkNode];

const FONT_SIZES   = ['12px', '14px', '16px', '18px', '24px', '32px', '48px'];
const LINE_HEIGHTS = ['1', '1.25', '1.5', '1.75', '2', '2.5'];
const FONT_FAMILIES = [
  { label: 'Default', value: '' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Mono', value: '"Fira Code", "SF Mono", Menlo, monospace' },
  { label: 'Rounded', value: '"Nunito", "Varela Round", sans-serif' },
  { label: 'Elegant', value: '"Playfair Display", "Garamond", serif' },
  { label: 'Handwritten', value: '"Caveat", "Patrick Hand", cursive' },
];

const initialConfig = {
  namespace: 'MyEditor',
  theme: exampleTheme,
  onError,
  nodes: EDITOR_NODES,
};

function ListToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const onClick = (tag) => {
    if (tag === 'ol') {
      editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
      return;
    }
    editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
  };
  return <>{['ol', 'ul'].map((tag) => (
    <button key={tag} onClick={() => onClick(tag)}>{tag.toUpperCase()}</button>
  ))}</>;
}

function BlockTypePlugin() {
  const [editor] = useLexicalComposerContext();

  const setBlock = (createNode) => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, createNode);
      }
    });
  };

  return (
    <>
      <button onClick={() => setBlock(() => $createParagraphNode())}>Normal</button>
      {['h1', 'h2', 'h3'].map((tag) => (
        <button onClick={() => setBlock(() => $createHeadingNode(tag))} key={tag}>
          {tag.toUpperCase()}
        </button>
      ))}
    </>
  );
}

// Applies inline CSS styles to the current selection (per-character)
function InlineStylePlugin() {
  const [editor] = useLexicalComposerContext();
  const [color, setColor]           = useState('#000000');
  const [fontSize, setFontSize]     = useState('16px');
  const [lineHeight, setLineHeight] = useState('1.5');
  const [fontFamily, setFontFamily] = useState('');

  // Keep toolbar controls in sync with the cursor / selection
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          const currentColor  = $getSelectionStyleValueForProperty(selection, 'color', '#000000');
          const currentSize   = $getSelectionStyleValueForProperty(selection, 'font-size', '16px');
          const currentFont   = $getSelectionStyleValueForProperty(selection, 'font-family', '');
          if (currentColor)  setColor(currentColor);
          if (currentSize)   setFontSize(currentSize);
          setFontFamily(currentFont || '');
          // Read line-height from the anchor text node (stored inline on TextNodes)
          try {
            const node = selection.anchor.getNode();
            const lhMatch = ($isTextNode(node) ? node.getStyle() || '' : '').match(/line-height:\s*([\d.]+)/);
            setLineHeight(lhMatch ? lhMatch[1] : '1.5');
          } catch { /* ignore */ }
        }
      });
    });
  }, [editor]);

  const applyColor = (value) => {
    setColor(value);
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) $patchStyleText(selection, { color: value });
    });
  };

  const applyFontSize = (value) => {
    setFontSize(value);
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) $patchStyleText(selection, { 'font-size': value });
    });
  };

  const applyFontFamily = (value) => {
    setFontFamily(value);
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) $patchStyleText(selection, { 'font-family': value || '' });
    });
  };

  const applyLineHeight = (value) => {
    setLineHeight(value);
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;

      // Apply line-height to all TextNodes in every block touched by the selection.
      // (ElementNode.setStyle() exists but ParagraphNode never renders __style to DOM,
      //  so we patch TextNodes directly — they do apply style to DOM spans.)
      const seen = new Set();
      const applyToTextDescendants = (node) => {
        if ($isTextNode(node)) {
          const existing = node.getStyle() || '';
          const parts = existing.split(';').map(p => p.trim()).filter(p => p && !p.toLowerCase().startsWith('line-height'));
          if (value && value !== '1') parts.push(`line-height: ${value}`);
          node.setStyle(parts.join('; '));
        } else if (typeof node.getChildren === 'function') {
          node.getChildren().forEach(applyToTextDescendants);
        }
      };

      for (const node of selection.getNodes()) {
        const block = typeof node.getTopLevelElement === 'function' ? node.getTopLevelElement() : null;
        if (!block || seen.has(block.getKey())) continue;
        seen.add(block.getKey());
        applyToTextDescendants(block);
      }

      // Also patch via $patchStyleText so new text typed will inherit the line-height
      $patchStyleText(selection, { 'line-height': value !== '1' ? value : '' });
    });
  };

  return (
    <>
      <label className="toolbar-label">
        Color
        <input
          type="color"
          value={color}
          onChange={(e) => applyColor(e.target.value)}
          className="toolbar-color-picker"
          title="Text color"
        />
      </label>
      <label className="toolbar-label">
        Font
        <select
          value={fontFamily}
          onChange={(e) => applyFontFamily(e.target.value)}
          className="toolbar-select"
          title="Font family"
          style={{ fontFamily: fontFamily || 'inherit' }}
        >
          {FONT_FAMILIES.map(({ label, value }) => (
            <option key={label} value={value} style={{ fontFamily: value || 'inherit' }}>{label}</option>
          ))}
        </select>
      </label>
      <label className="toolbar-label">
        Size
        <select
          value={fontSize}
          onChange={(e) => applyFontSize(e.target.value)}
          className="toolbar-select"
          title="Font size"
        >
          {FONT_SIZES.map((s) => (
            <option key={s} value={s}>{s.replace('px', '')}</option>
          ))}
        </select>
      </label>
      <label className="toolbar-label">
        Spacing
        <select
          value={lineHeight}
          onChange={(e) => applyLineHeight(e.target.value)}
          className="toolbar-select"
          title="Line spacing"
        >
          {LINE_HEIGHTS.map((lh) => (
            <option key={lh} value={lh}>{lh}×</option>
          ))}
        </select>
      </label>
    </>
  );
}

// Creates a paragraph (not another heading) when Enter is pressed at the end of a heading
function HeadingEnterPlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      () => {
        const edState = editor.getEditorState();
        let shouldHandle = false;
        edState.read(() => {
          const sel = $getSelection();
          if (!$isRangeSelection(sel) || !sel.isCollapsed()) return;
          const node = sel.anchor.getNode();
          const block = typeof node.getTopLevelElement === 'function' ? node.getTopLevelElement() : null;
          if (!$isHeadingNode(block)) return;
          const last = block.getLastChild?.();
          if (!last || last !== node) return;
          const textLen = node.getTextContentSize?.() ?? (node.getTextContent?.() || '').length;
          if (sel.anchor.offset < textLen) return;
          shouldHandle = true;
        });
        if (!shouldHandle) return false;
        editor.update(() => {
          const sel = $getSelection();
          if (!$isRangeSelection(sel)) return;
          const node = sel.anchor.getNode();
          const block = typeof node.getTopLevelElement === 'function' ? node.getTopLevelElement() : null;
          if (!$isHeadingNode(block)) return;
          const para = $createParagraphNode();
          block.insertAfter(para);
          para.select();
        });
        return true;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor]);
  return null;
}

// Scrolls the cursor into view after Enter key press
function EnterScrollPlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      () => {
        setTimeout(() => {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) return;
          const node = sel.focusNode;
          const el = node?.nodeType === 3 ? node.parentElement : node;
          el?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
        }, 0);
        return false;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor]);
  return null;
}

function CodeHighlightPlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    return registerCodeHighlighting(editor);
  }, [editor]);
  return null;
}

// Highlights #hashtag text in the editor with a colored span after each Lexical update.
// Uses DOM manipulation with debounce — re-applies after every edit since Lexical
// overwrites the DOM on each reconcile. Spans carry data-hashtag so they're idempotent.
function HashtagHighlightPlugin({ navigate }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    let timer = null;
    const highlight = () => {
      const root = editor.getRootElement();
      if (!root) return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          const p = node.parentElement;
          if (!p) return NodeFilter.FILTER_REJECT;
          const tag = p.tagName;
          if (tag === 'A' || tag === 'CODE' || tag === 'SCRIPT') return NodeFilter.FILTER_REJECT;
          if (p.closest('code, pre, .editor-code')) return NodeFilter.FILTER_REJECT;
          return /#\w/.test(node.textContent) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      });
      const nodes = [];
      let n;
      while ((n = walker.nextNode())) nodes.push(n);
      for (const textNode of nodes) {
        const text = textNode.textContent;
        if (!/#\w/.test(text)) continue;
        const frag = document.createDocumentFragment();
        text.split(/(#[\w]{1,50})/g).forEach(part => {
          if (/^#[\w]{1,50}$/.test(part)) {
            const span = document.createElement('span');
            span.className = 'editor-hashtag-token';
            span.textContent = part;
            frag.appendChild(span);
          } else if (part) {
            frag.appendChild(document.createTextNode(part));
          }
        });
        if (textNode.parentNode) textNode.parentNode.replaceChild(frag, textNode);
      }
    };
    const unsub = editor.registerUpdateListener(() => {
      clearTimeout(timer);
      timer = setTimeout(highlight, 150);
    });
    return () => { unsub(); clearTimeout(timer); };
  }, [editor]);
  return null;
}

function CodeEscapePlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    return editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      () => {
        const sel = $getSelection();
        if (!$isRangeSelection(sel)) return false;
        let node = sel.anchor.getNode();
        while (node) {
          if ($isCodeNode(node)) {
            editor.update(() => {
              const codeNode = $getNodeByKey(node.getKey());
              if (!codeNode) return;
              let after = codeNode.getNextSibling();
              if (!after) {
                after = $createParagraphNode();
                codeNode.insertAfter(after);
              }
              after.selectStart();
            });
            return true;
          }
          if (typeof node.getParent !== 'function') break;
          node = node.getParent();
        }
        return false;
      },
      COMMAND_PRIORITY_EDITOR,
    );
  }, [editor]);
  return null;
}

function CodeHoverControlsPlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    const LANGS = getCodeLanguages();
    // activeEl → { overlay, leaveTimer, cleanupFns }
    const active = new WeakMap();

    function removeOverlay(el) {
      const state = active.get(el);
      if (!state) return;
      clearTimeout(state.leaveTimer);
      state.overlay.remove();
      state.cleanupFns.forEach(fn => fn());
      active.delete(el);
    }

    function showOverlay(el) {
      if (active.has(el)) return;

      // Read Lexical node info
      let nodeKey = null, lightMode = false, lineNumbers = true, language = '';
      editor.getEditorState().read(() => {
        for (const child of $getRoot().getChildren()) {
          if ($isCodeNode(child) && editor.getElementByKey(child.getKey()) === el) {
            nodeKey = child.getKey();
            language = child.getLanguage() ?? '';
            if (child instanceof CustomCodeNode) {
              lightMode = child.getLightMode();
              lineNumbers = child.getLineNumbers();
            }
            break;
          }
        }
      });

      // A single-line control bar pinned to the top-right of the block.
      //
      // It lives in document.body, NOT inside the editor. Lexical reconciles the
      // contenteditable against its own model, so a foreign element inserted
      // there is removed on the next update — which is what happened when this
      // was briefly made a sibling of the code element: the whole bar vanished.
      //
      // Position is refreshed on scroll and resize rather than by a
      // requestAnimationFrame loop. The old version ran one such loop per code
      // block for as long as the block existed, purely to keep a fixed element
      // following one that does not move on its own.
      const overlay = document.createElement('div');
      overlay.className = 'code-header-bar';
      overlay.addEventListener('mousedown', ev => {
        // Clicks in the chrome must not move the caret into the code.
        if (ev.target === overlay) ev.preventDefault();
      });

      const place = () => {
        const r = el.getBoundingClientRect();
        overlay.style.top = (r.top + 6) + 'px';
        overlay.style.right = (window.innerWidth - r.right + 8) + 'px';
      };

      const mkBtn = (label, title, active_, onClick) => {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.title = title;
        btn.className = 'code-ctrl-btn' + (active_ ? ' active' : '');
        btn.addEventListener('mousedown', ev => ev.preventDefault());
        btn.addEventListener('click', ev => { ev.stopPropagation(); onClick(btn); });
        return btn;
      };

      const sep = () => {
        const s = document.createElement('span');
        s.className = 'code-ctrl-sep';
        return s;
      };

      // ── Language ──────────────────────────────────────────────────────────
      // The name is the control: click it to change it, the way an editor tab
      // works. A select sitting there permanently made the bar look like a form.
      const CUSTOM = '__custom__';

      const langLabel = document.createElement('button');
      langLabel.className = 'code-lang-label';
      langLabel.title = 'Click to change the language';
      langLabel.textContent = language ? getLanguageFriendlyName(language) : 'Plain text';
      langLabel.addEventListener('mousedown', ev => ev.preventDefault());

      const select = document.createElement('select');
      select.className = 'code-ctrl-select';
      select.title = 'Code language';
      select.hidden = true;

      const addOption = (value, text) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = text;
        select.appendChild(opt);
      };
      addOption('', 'Plain text');
      LANGS.forEach(lang => addOption(lang, getLanguageFriendlyName(lang)));
      addOption(CUSTOM, 'Custom…');

      // A language the highlighter does not know is still a valid label — the
      // block just is not syntax-highlighted. Show it rather than falling back
      // to "Plain text", which would silently discard what the author typed.
      if (language && !LANGS.includes(language)) addOption(language, language);
      select.value = language || '';

      const showSelect = () => {
        select.hidden = false;
        langLabel.hidden = true;
        select.focus();
      };
      const hideSelect = () => {
        select.hidden = true;
        langLabel.hidden = false;
      };

      const applyLanguage = (value) => {
        langLabel.textContent = value
          ? (LANGS.includes(value) ? getLanguageFriendlyName(value) : value)
          : 'Plain text';
        editor.update(() => {
          const node = $getNodeByKey(nodeKey);
          if ($isCodeNode(node)) node.setLanguage(value);
        });
      };

      langLabel.addEventListener('click', ev => { ev.stopPropagation(); showSelect(); });
      select.addEventListener('mousedown', ev => ev.stopPropagation());
      select.addEventListener('blur', hideSelect);
      select.addEventListener('change', () => {
        if (select.value === CUSTOM) {
          const typed = window.prompt('Label this code block:', langLabel.textContent);
          hideSelect();
          if (typed === null) { select.value = language || ''; return; }
          // Free text, but it becomes an attribute and a label, so keep it to
          // something that cannot carry markup.
          const clean = typed.trim().replace(/[^A-Za-z0-9+#.\- ]/g, '').slice(0, 24);
          if (!clean) { select.value = language || ''; return; }
          if (!Array.from(select.options).some(o => o.value === clean)) addOption(clean, clean);
          select.value = clean;
          language = clean;
          applyLanguage(clean);
          return;
        }
        language = select.value;
        applyLanguage(select.value);
        hideSelect();
      });

      overlay.appendChild(langLabel);
      overlay.appendChild(select);
      overlay.appendChild(document.createElement('span')).className = 'code-header-spacer';

      if (nodeKey) {
        const lightBtn = mkBtn(lightMode ? 'Light' : 'Dark', 'Toggle light/dark', lightMode, (btn) => {
          lightMode = !lightMode;
          editor.update(() => {
            const node = $getNodeByKey(nodeKey);
            if (node instanceof CustomCodeNode) node.setLightMode(lightMode);
          });
          btn.textContent = lightMode ? 'Light' : 'Dark';
          btn.classList.toggle('active', lightMode);
        });
        overlay.appendChild(lightBtn);

        const lineBtn = mkBtn(lineNumbers ? 'Lines: on' : 'Lines: off', 'Toggle line numbers', lineNumbers, (btn) => {
          lineNumbers = !lineNumbers;
          editor.update(() => {
            const node = $getNodeByKey(nodeKey);
            if (node instanceof CustomCodeNode) node.setLineNumbers(lineNumbers);
          });
          btn.textContent = lineNumbers ? 'Lines: on' : 'Lines: off';
          btn.classList.toggle('active', lineNumbers);
        });
        overlay.appendChild(lineBtn);
        overlay.appendChild(sep());

        overlay.appendChild(mkBtn('↑', 'Move up', false, () => {
          editor.update(() => {
            const node = $getNodeByKey(nodeKey);
            if (!node) return;
            const prev = node.getPreviousSibling();
            if (prev) { node.remove(); prev.insertBefore(node); }
          });
        }));
        overlay.appendChild(mkBtn('↓', 'Move down', false, () => {
          editor.update(() => {
            const node = $getNodeByKey(nodeKey);
            if (!node) return;
            const next = node.getNextSibling();
            if (next) { node.remove(); next.insertAfter(node); }
          });
        }));
        const delBtn = mkBtn('Del', 'Delete code block', false, () => {
          removeOverlay(el);
          editor.update(() => { const n = $getNodeByKey(nodeKey); if (n) n.remove(); });
        });
        delBtn.style.color = '#ff9999';
        overlay.appendChild(delBtn);
        overlay.appendChild(sep());
      }

      function extractText(node) {
        if (node.nodeType === Node.TEXT_NODE) return node.textContent;
        if (node.nodeName === 'BR') return '\n';
        if (node.classList?.contains('line-nums-gutter')) return '';
        let t = '';
        node.childNodes.forEach(c => { t += extractText(c); });
        return t;
      }
      overlay.appendChild(mkBtn('Copy', 'Copy code to clipboard', false, (btn) => {
        navigator.clipboard.writeText(extractText(el)).then(() => {
          btn.textContent = '✓';
          setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
        }).catch(() => {});
      }));

      document.body.appendChild(overlay);
      place();
      // Passive: these only read layout, never block the scroll.
      window.addEventListener('scroll', place, { passive: true, capture: true });
      window.addEventListener('resize', place, { passive: true });

      const state = { overlay, leaveTimer: null, cleanupFns: [] };
      active.set(el, state);

      const scheduleRemove = () => {
        state.leaveTimer = setTimeout(() => removeOverlay(el), 600);
      };
      const cancelRemove = () => clearTimeout(state.leaveTimer);

      el.addEventListener('mouseleave', scheduleRemove);
      el.addEventListener('mouseenter', cancelRemove);
      overlay.addEventListener('mouseleave', scheduleRemove);
      overlay.addEventListener('mouseenter', cancelRemove);
      select.addEventListener('focus', cancelRemove);
      select.addEventListener('blur', () => { if (!el.matches(':hover') && !overlay.matches(':hover')) scheduleRemove(); });

      state.cleanupFns.push(
        () => el.removeEventListener('mouseleave', scheduleRemove),
        () => el.removeEventListener('mouseenter', cancelRemove),
        () => overlay.removeEventListener('mouseleave', scheduleRemove),
        () => overlay.removeEventListener('mouseenter', cancelRemove),
        () => window.removeEventListener('scroll', place, { capture: true }),
        () => window.removeEventListener('resize', place),
      );
    }

    // Use mouseover (bubbles) for reliable delegation — simpler than capture-phase mouseenter
    function onMouseOver(e) {
      const el = e.target.closest('code.editor-code');
      if (el) showOverlay(el);
    }

    return editor.registerRootListener((root, prev) => {
      if (prev) prev.removeEventListener('mouseover', onMouseOver);
      if (root) root.addEventListener('mouseover', onMouseOver);
    });
  }, [editor]);
  return null;
}

function EnsureLeadingParagraphPlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const first = $getRoot().getFirstChild();
        // Only insert a leading paragraph when the first child is a code block or decorator
        // node (image/math). Headings and lists are acceptable as first children and
        // inserting a paragraph before them would fight with the cursor on every Enter press.
        if (!first) return;
        if ($isParagraphNode(first) || $isHeadingNode(first) || $isListNode(first)) return;
        editor.update(() => {
          const f = $getRoot().getFirstChild();
          if (!f || $isParagraphNode(f) || $isHeadingNode(f) || $isListNode(f)) return;
          f.insertBefore($createParagraphNode());
        });
      });
    });
  }, [editor]);
  return null;
}

function EnsureTrailingParagraphPlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const last = $getRoot().getLastChild();
        if (!last) return;
        if ($isParagraphNode(last) || $isHeadingNode(last) || $isListNode(last)) return;
        editor.update(() => {
          const l = $getRoot().getLastChild();
          if (!l || $isParagraphNode(l) || $isHeadingNode(l) || $isListNode(l)) return;
          l.insertAfter($createParagraphNode());
        });
      });
    });
  }, [editor]);
  return null;
}

// Handles Backspace/Delete on selected decorator nodes (images, math blocks)
function DecoratorKeyboardPlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    const removeBackspace = editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      () => {
        const sel = $getSelection();
        if ($isNodeSelection(sel)) {
          const nodes = sel.getNodes();
          let handled = false;
          nodes.forEach(node => {
            if (typeof node.remove === 'function') { node.remove(); handled = true; }
          });
          return handled;
        }
        return false;
      },
      COMMAND_PRIORITY_EDITOR,
    );
    const removeDelete = editor.registerCommand(
      KEY_DELETE_COMMAND,
      () => {
        const sel = $getSelection();
        if ($isNodeSelection(sel)) {
          const nodes = sel.getNodes();
          let handled = false;
          nodes.forEach(node => {
            if (typeof node.remove === 'function') { node.remove(); handled = true; }
          });
          return handled;
        }
        return false;
      },
      COMMAND_PRIORITY_EDITOR,
    );
    return () => { removeBackspace(); removeDelete(); };
  }, [editor]);
  return null;
}

// Handles drag-and-drop and clipboard paste of image files into the editor
function ImageDragPastePlugin() {
  const [editor] = useLexicalComposerContext();

  const uploadFile = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await axios.post(BASE_URL + '/api/upload', formData, { withCredentials: true });
      const { url, srcset } = normaliseUploadResponse(response.data);
      editor.update(() => {
        insertBlockInner(() => $createImageNode(url, file.name, srcset));
      });
    } catch (err) {
      console.error('Image upload failed:', err);
      // The server explains the specific reason — a size cap, an unreadable
      // file, a full quota — so show that rather than replacing it.
      alert(describeUploadError(err));
    }
  }, [editor]);

  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;

    const onDragOver = (e) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    };

    const onDrop = (e) => {
      const files = Array.from(e.dataTransfer?.files ?? []);
      const imageFile = files.find(f => f.type.startsWith('image/'));
      if (imageFile) {
        e.preventDefault();
        uploadFile(imageFile);
      }
    };

    const onPaste = (e) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const imageItem = items.find(i => i.type.startsWith('image/'));
      if (imageItem) {
        e.preventDefault();
        uploadFile(imageItem.getAsFile());
      }
    };

    root.addEventListener('dragover', onDragOver);
    root.addEventListener('drop', onDrop);
    root.addEventListener('paste', onPaste);
    return () => {
      root.removeEventListener('dragover', onDragOver);
      root.removeEventListener('drop', onDrop);
      root.removeEventListener('paste', onPaste);
    };
  }, [editor, uploadFile]);

  return null;
}

function ImageToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const [infoOpen, setInfoOpen] = useState(false);
  const infoRef = useRef(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!infoOpen) return;
    const close = (e) => {
      if (infoRef.current && !infoRef.current.contains(e.target)) setInfoOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [infoOpen]);

  // Picking a file opens the crop dialog rather than uploading immediately;
  // uploadFile runs once the user confirms, with either the cropped image or
  // the untouched original.
  const uploadFile = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      // Do NOT set Content-Type manually — let the browser attach the correct multipart boundary
      const response = await axios.post(BASE_URL + '/api/upload', formData, {
        withCredentials: true,
      });
      const { url, srcset } = normaliseUploadResponse(response.data);
      editor.update(() => {
        insertBlockInner(() => $createImageNode(url, file.name, srcset));
      });
    } catch (err) {
      console.error('Image upload failed:', err);
      alert(describeUploadError(err));
    }
  };

  /** Inserts an image the user already has, without re-uploading it. */
  const insertExisting = (image) => {
    setPickerOpen(false);
    editor.update(() => {
      insertBlockInner(() => $createImageNode(image.url, image.name || '', image.srcset || null));
    });
  };

  return (
    <>
      {pickerOpen && (
        <ImagePicker
          onClose={() => setPickerOpen(false)}
          onSelect={insertExisting}
          onUpload={(file) => { setPickerOpen(false); setPendingFile(file); }}
        />
      )}
      {pendingFile && (
        <ImageCropDialog
          file={pendingFile}
          onCancel={() => setPendingFile(null)}
          onConfirm={(result) => { setPendingFile(null); uploadFile(result); }}
        />
      )}
      <span className="image-btn-group" ref={infoRef}>
        <button className="toolbar-btn-image" onClick={() => setPickerOpen(true)}>Image</button>
        <button
          className="toolbar-btn-image-info"
          title="Image upload info"
          onClick={() => setInfoOpen(o => !o)}
          aria-label="Image upload limits"
        >ⓘ</button>
        {infoOpen && (
          <div className="image-info-popup">
            <strong>Image upload</strong>
            <ul>
              <li><b>Types:</b> JPG, JPEG, PNG, GIF, WebP</li>
              <li><b>Max per file:</b> 5 MB</li>
              <li><b>Storage quota:</b> 50 MB (users) · 500 MB (trusted/admin) · 5 MB (restricted)</li>
            </ul>
          </div>
        )}
      </span>
    </>
  );
}

function getLinkNode(selection) {
  if (!$isRangeSelection(selection)) return null;
  const nodes = selection.getNodes();
  for (const n of nodes) {
    if ($isLinkNode(n)) return n;
    const parent = n.getParent();
    if ($isLinkNode(parent)) return parent;
  }
  return null;
}

function getViewportRect(domSel) {
  if (!domSel || domSel.rangeCount === 0) return null;
  const range = domSel.getRangeAt(0);
  const rects = range.getClientRects();
  // For a collapsed cursor, getClientRects() returns one thin rect
  return rects.length > 0 ? rects[0] : range.getBoundingClientRect();
}

function LinkModal({ mode, initialUrl, onConfirm, onRemove, onCancel }) {
  const [url, setUrl] = useState(initialUrl || '');
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);
  const handleSubmit = () => {
    if (!url.trim()) { if (mode === 'edit') { onRemove(); } else { onCancel(); } return; }
    const href = url.startsWith('http') ? url : 'https://' + url;
    onConfirm(href);
  };
  return createPortal(
    <div className="editor-modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="editor-modal" onMouseDown={e => e.stopPropagation()}>
        <div className="editor-modal-title">{mode === 'edit' ? 'Edit link' : 'Insert link'}</div>
        <input
          ref={inputRef}
          className="editor-modal-input"
          type="url"
          placeholder="https://..."
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); } if (e.key === 'Escape') { e.preventDefault(); onCancel(); } }}
        />
        <div className="editor-modal-actions">
          <button className="editor-modal-btn editor-modal-btn--confirm" onClick={handleSubmit}>
            {mode === 'edit' ? 'Save' : 'Insert'}
          </button>
          {mode === 'edit' && <button className="editor-modal-btn editor-modal-btn--remove" onClick={onRemove}>Remove link</button>}
          <button className="editor-modal-btn editor-modal-btn--cancel" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function PostSearchModal({ onSelect, onCancel }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timer = setTimeout(() => {
      setLoading(true);
      SEARCH_POSTS(query.trim())
        .then(r => { setResults(r || []); setLoading(false); })
        .catch(() => { setResults([]); setLoading(false); });
    }, 280);
    return () => clearTimeout(timer);
  }, [query]);
  return createPortal(
    <div className="editor-modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="editor-modal editor-modal--search" onMouseDown={e => e.stopPropagation()}>
        <div className="editor-modal-title">Insert post link</div>
        <input
          ref={inputRef}
          className="editor-modal-input"
          placeholder="Search posts by title..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); onCancel(); } }}
        />
        {loading && <div className="editor-modal-status">Searching…</div>}
        {results.length > 0 && (
          <ul className="editor-modal-results">
            {results.slice(0, 10).map(p => (
              <li key={p.id}>
                <button className="editor-modal-result-item" onClick={() => onSelect(p)}>
                  <span className="editor-modal-result-title">{p.title || `Post #${p.id}`}</span>
                  <span className="editor-modal-result-meta">by {p.username}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!loading && query.trim() && results.length === 0 && (
          <div className="editor-modal-status">No posts found</div>
        )}
        <div className="editor-modal-actions">
          <button className="editor-modal-btn editor-modal-btn--cancel" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function LinkToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const [isLink, setIsLink] = useState(false);
  const [showFloat, setShowFloat] = useState(false);
  const [pos, setPos] = useState(null);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const sel = $getSelection();
        if (!$isRangeSelection(sel)) {
          setIsLink(false);
          setShowFloat(false);
          setPos(null);
          return;
        }

        const linkNode = getLinkNode(sel);
        const inLink = linkNode !== null;
        setIsLink(inLink);

        // Show floating toolbar when text is selected OR cursor is inside a link
        const hasContent = !sel.isCollapsed() || inLink;
        setShowFloat(hasContent);

        if (hasContent) {
          const domSel = window.getSelection();
          const rect = getViewportRect(domSel);
          if (rect) {
            // position: fixed uses viewport coords — do NOT add scrollX/Y
            const centerX = rect.left + rect.width / 2;
            setPos({ top: rect.top - 40, left: centerX });
          }
        } else {
          setPos(null);
        }
      });
    });
  }, [editor]);

  const [linkModal, setLinkModal] = useState(null); // null | 'add' | 'edit'

  const getCurrentUrl = () => {
    let url = '';
    editor.getEditorState().read(() => {
      const sel = $getSelection();
      const node = getLinkNode(sel);
      if (node) url = node.getURL();
    });
    return url;
  };

  const addLink    = () => setLinkModal('add');
  const editLink   = () => setLinkModal('edit');
  const removeLink = () => editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);

  const commitLink = (href) => {
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, { url: href, target: '_blank' });
    setLinkModal(null);
  };
  const commitRemove = () => {
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    setLinkModal(null);
  };

  return (
    <>
      <button
        title={isLink ? 'Edit link' : 'Insert link'}
        onClick={isLink ? editLink : addLink}
      >
        {isLink ? 'Edit link' : 'Link'}
      </button>
      {showFloat && pos && (
        <div
          className="floating-link-toolbar"
          style={{ top: pos.top, left: pos.left }}
          onMouseDown={e => e.preventDefault()}
        >
          {isLink ? (
            <>
              <button onClick={editLink} title="Edit link URL">Edit link</button>
              <button onClick={removeLink} title="Remove link">Remove</button>
            </>
          ) : (
            <button onClick={addLink} title="Add link">🔗 Link</button>
          )}
        </div>
      )}
      {linkModal && (
        <LinkModal
          mode={linkModal}
          initialUrl={linkModal === 'edit' ? getCurrentUrl() : ''}
          onConfirm={commitLink}
          onRemove={commitRemove}
          onCancel={() => setLinkModal(null)}
        />
      )}
    </>
  );
}


/**
 * Inserts a block-level node at a sensible place, whatever the selection is.
 *
 * The insert buttons used to fail silently in two common situations: an empty
 * document, where there is no selection at all, and a caret sitting inside an
 * existing block node such as an image or an equation, where the selection is a
 * NodeSelection rather than a RangeSelection. The code button in particular was
 * guarded by `if ($isRangeSelection(selection))` and simply did nothing
 * otherwise.
 *
 * $insertNodeToNearestRoot handles the block placement — it walks up to the
 * nearest root-level ancestor and inserts after it, rather than trying to nest
 * a block inside whatever the caret happens to be in. When there is no
 * selection we place one at the end of the document first, so there is always
 * somewhere for the new block to go.
 *
 * A paragraph is added after the new node and focused, so the writer can keep
 * typing instead of hunting for a cursor below a freshly inserted image.
 */
/** The body of insertBlock, for callers already inside an editor.update(). */
function insertBlockInner(createNode) {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) && !$isNodeSelection(selection)) {
    $getRoot().selectEnd();
  }
  const node = createNode();
  $insertNodeToNearestRoot(node);
  const paragraph = $createParagraphNode();
  node.insertAfter(paragraph);
  paragraph.selectEnd();
}

function insertBlock(editor, createNode) {
  editor.update(() => {
    insertBlockInner(createNode);
  });
}

function CodeToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const onClick = () => {
    // Converting the current paragraph is the right behaviour when the caret is
    // in text; anywhere else there is nothing to convert, so insert a fresh
    // code block instead of doing nothing.
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection) && selection.isCollapsed()) {
        const block = selection.anchor.getNode().getTopLevelElement();
        if (block && block.getTextContent().length === 0) {
          $setBlocksType(selection, () => $createCustomCodeNode());
          return;
        }
      }
      if ($isRangeSelection(selection) && !selection.isCollapsed()) {
        $setBlocksType(selection, () => $createCustomCodeNode());
        return;
      }
      insertBlockInner(() => $createCustomCodeNode());
    });
  };
  return <button onClick={onClick}>Code</button>;
}

function MathToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const onClick = () => {
    const equation = window.prompt('Enter LaTeX equation (e.g. \\frac{a}{b}):');
    if (equation === null) return;
    insertBlock(editor, () => $createMathNode(equation.trim()));
  };
  return <button onClick={onClick} title="Insert LaTeX math block">∑ Math</button>;
}

function PostLinkToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const [showSearch, setShowSearch] = useState(false);

  const handleSelect = (post) => {
    setShowSearch(false);
    const href = postPath(post.username, post);
    const title = post.title || `Post #${post.id}`;
    editor.update(() => {
      const linkNode = $createLinkNode(href);
      linkNode.append($createTextNode(title));
      const sel = $getSelection();
      if ($isRangeSelection(sel)) sel.insertNodes([linkNode]);
      else $insertNodes([linkNode]);
    });
  };

  return (
    <>
      <button onClick={() => setShowSearch(true)} title="Insert link to another post on this site">Post link</button>
      {showSearch && <PostSearchModal onSelect={handleSelect} onCancel={() => setShowSearch(false)} />}
    </>
  );
}

function BackgroundToolbarPlugin({ pattern, onPatternChange, username }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  return (
    <div className="toolbar-bg-wrapper" ref={wrapperRef}>
      <button type="button" onClick={() => setOpen(o => !o)} title="Post wallpaper">
        Wallpaper
      </button>
      {open && (
        <div className="toolbar-bg-panel">
          <PatternPicker value={pattern} onChange={onPatternChange} username={username} />
        </div>
      )}
    </div>
  );
}

function FeatureTogglePlugin({ postid, features, onFeaturesChange }) {
  const { confirm } = useDialog();
  const isNew = !postid || postid <= 0;

  const toggle = async (key) => {
    const next = !features[key];
    if (isNew) {
      onFeaturesChange(f => ({ ...f, [key]: next }));
      return;
    }
    const label = key === 'reactionsEnabled' ? 'reactions' : 'comments';
    const msg = next
      ? `Enable ${label} on this post?`
      : `Disable ${label}? They will be hidden from readers until re-enabled.`;
    if (!(await confirm(msg))) return;
    try {
      if (key === 'reactionsEnabled') await SET_REACTIONS_ENABLED(postid, next);
      else await SET_DISCUSSION_ENABLED(postid, next);
      onFeaturesChange(f => ({ ...f, [key]: next }));
    } catch {}
  };

  return (
    <>
      <button
        className={`post-toggle-btn toolbar-fmt-btn${features.reactionsEnabled ? ' active' : ''}`}
        onClick={() => toggle('reactionsEnabled')}
        title="Toggle reactions on this post"
        style={{ fontSize: '12px' }}
      >
        {features.reactionsEnabled ? 'Reactions: on' : 'Reactions: off'}
      </button>
      <button
        className={`post-toggle-btn toolbar-fmt-btn${features.discussionEnabled ? ' active' : ''}`}
        onClick={() => toggle('discussionEnabled')}
        title="Toggle comments on this post"
        style={{ fontSize: '12px' }}
      >
        {features.discussionEnabled ? 'Comments: on' : 'Comments: off'}
      </button>
    </>
  );
}


/**
 * Lets the author choose the readable part of their post's URL.
 *
 * The address is /{username}/{id}-{slug}. The id makes it unique, so the slug
 * is free-form and needs no collision handling — leaving it blank simply
 * derives one from the title.
 *
 * Input is tidied as you type rather than rejected: someone typing "My Post!"
 * gets "my-post", which is what they meant.
 */
function PostSlugPlugin({ slug, onSlugChange, username, titleRef, postId }) {
  const [draft, setDraft] = useState(slug || '');
  const [editing, setEditing] = useState(false);

  // Follow the saved value when the post loads or is reloaded.
  useEffect(() => { setDraft(slug || ''); }, [slug]);

  const tidy = (value) => value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 80);

  const commit = () => {
    const cleaned = tidy(draft).replace(/-+$/, '');
    setDraft(cleaned);
    onSlugChange?.(cleaned || null);
  };

  const derived = slugify((titleRef?.current || '').replace(/<[^>]*>/g, ''));
  const effective = tidy(draft).replace(/-+$/, '') || derived;
  const idPart = postId || '123';

  // Collapsed to a single readable line until clicked. The address is worth
  // seeing on every post; the input only matters when you want to change it.
  if (!editing) {
    return (
      <div className="post-slug-row">
        <span className="post-slug-static" title="This post's address">
          <span className="post-slug-dim">/{username || 'you'}/{idPart}-</span>
          <span className="post-slug-value">{effective || 'untitled'}</span>
        </span>
        <button type="button" className="post-slug-edit" onClick={() => setEditing(true)}>
          {slug ? 'Change URL' : 'Set a custom URL'}
        </button>
      </div>
    );
  }

  return (
    <div className="post-slug-row post-slug-row--editing">
      <label className="post-slug-label" htmlFor="post-slug-input">
        <span className="post-slug-dim">/{username || 'you'}/{idPart}-</span>
      </label>
      <input
        id="post-slug-input"
        type="text"
        className="post-slug-input"
        value={draft}
        placeholder={derived || 'my-post-name'}
        onChange={e => setDraft(tidy(e.target.value))}
        onBlur={() => { commit(); setEditing(false); }}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
          // Escape abandons the edit rather than committing a half-typed slug.
          if (e.key === 'Escape') { setDraft(slug || ''); setEditing(false); }
        }}
        maxLength={80}
        autoFocus
      />
      {draft && (
        <button type="button" className="post-slug-reset"
                onMouseDown={e => e.preventDefault()}
                onClick={() => { setDraft(''); onSlugChange?.(null); setEditing(false); }}
                title="Go back to deriving it from the title">
          Use title
        </button>
      )}
    </div>
  );
}

function SaveToolbarPlugin({ postid, backgroundPattern, postPublished, onPublishedChange, titleRef, onSaved, username, folder, onFolderChange, features, slug }) {
  const { confirm } = useDialog();
  const [editor] = useLexicalComposerContext();
  const [saveStatus, setSaveStatus] = useState('');
  const [savedId, setSavedId] = useState(null);
  const [saving, setSaving] = useState(false);
  // After first creation, use savedId as effective ID so repeat saves update instead of creating
  const effectiveId = postid > 0 ? postid : savedId;
  const hasSaved = effectiveId > 0;

  const showStatus = (msg, isError = false) => {
    setSaveStatus({ msg, error: isError });
    setTimeout(() => setSaveStatus(''), 3000);
  };

  const save = async (published) => {
    if (saving) return;
    const postTitle = (titleRef?.current || localStorage.getItem("currentPostTitle") || '').replace(/<[^>]*>/g, '').trim();
    if (published) {
      if (!postTitle) { showStatus('Add a title before uploading.', true); return; }
      const bodyText = editor.getEditorState().read(() => $getRoot().getTextContent()).trim();
      if (!bodyText) { showStatus('Add some content before uploading.', true); return; }
    }
    if (!published && postPublished) {
      if (!(await confirm('Unpublish this post? It will no longer be visible to other users.'))) return;
    }
    const editorState = JSON.stringify(editor.getEditorState().toJSON());
    setSaving(true);
    if (hasSaved) {
      UPDATE_POST(effectiveId, postTitle, editorState, published, backgroundPattern, folder, slug)
        .then(() => {
          showStatus(published ? 'Uploaded.' : postPublished ? 'Unpublished — saved as a draft.' : 'Draft saved.');
          onPublishedChange(published);
          setSavedId(effectiveId);
          onSaved?.();
        })
        .catch(err => {
          const code = err.response?.status;
          if (code === 401 || code === 403) showStatus('Not authorized to save.', true);
          else showStatus('Save failed. Check your connection.', true);
        })
        .finally(() => setSaving(false));
    } else {
      CREATE_POST(1, postTitle, editorState, published, backgroundPattern, folder, slug)
        .then((newId) => {
          showStatus(published ? 'Uploaded — your post is live.' : 'Draft saved.');
          setSavedId(newId);
          // Apply any non-default feature settings chosen before saving
          if (features && !features.reactionsEnabled) SET_REACTIONS_ENABLED(newId, false).catch(() => {});
          if (features && !features.discussionEnabled) SET_DISCUSSION_ENABLED(newId, false).catch(() => {});
          onSaved?.();
        })
        .catch(err => {
          showStatus('Failed to create post.', true);
        })
        .finally(() => setSaving(false));
    }
  };

  const currentTitle = (titleRef?.current || '').replace(/<[^>]*>/g, '').trim();
  const viewUrl = savedId && username
    ? postPath(username, { id: savedId, title: currentTitle, slug })
    : null;

  return (
    <>
      {saveStatus && (
        <span className={`toolbar-save-status${saveStatus.error ? ' toolbar-save-status--error' : ''}`}>
          {saveStatus.msg}
        </span>
      )}
      {/* Two actions, named for what they do: keep it private, or put it up.
          The old pair read "Save Draft" and "Save", which did not say that the
          second one made the post public. */}
      <button className="toolbar-btn-draft" onClick={() => save(false)} disabled={saving}
              title={postPublished ? 'Take this post down and keep it as a draft'
                                   : 'Save without making it visible to anyone else'}>
        {postPublished ? 'Unpublish' : 'Save draft'}
      </button>
      <button className="toolbar-btn-save" onClick={() => save(true)} disabled={saving}
              title={postPublished ? 'Save and keep it published' : 'Make this post public'}>
        {saving ? '…' : 'Upload'}
      </button>
      {viewUrl && (
        <Link to={viewUrl} className="toolbar-view-link">
          <button className="toolbar-btn-view">View post →</button>
        </Link>
      )}
    </>
  );
}

function UndoRedoPlugin() {
  const [editor] = useLexicalComposerContext();
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  useEffect(() => {
    const u = editor.registerCommand(CAN_UNDO_COMMAND, (v) => { setCanUndo(v); return false; }, COMMAND_PRIORITY_EDITOR);
    const r = editor.registerCommand(CAN_REDO_COMMAND, (v) => { setCanRedo(v); return false; }, COMMAND_PRIORITY_EDITOR);
    return () => { u(); r(); };
  }, [editor]);
  return (
    <>
      <button title="Undo (⌘Z)" disabled={!canUndo} onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}>↩</button>
      <button title="Redo (⌘⇧Z)" disabled={!canRedo} onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}>↪</button>
    </>
  );
}

/**
 * A toolbar group that opens in a popover rather than expanding inline.
 *
 * The previous version expanded in place, so opening a section pushed every
 * other control sideways and the bar's layout changed as you worked. A popover
 * floats above the page, so the row of controls never moves.
 *
 * Only one is open at a time — the parent owns `openId`, since two open panels
 * would overlap and there is never a reason to want both.
 */
function ToolbarMenu({ id, label, hint, openId, setOpenId, children }) {
  const open = openId === id;
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpenId(null); };
    const onKey = (e) => { if (e.key === 'Escape') setOpenId(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpenId]);

  return (
    <span className="toolbar-menu" ref={ref}>
      <button
        type="button"
        className={`toolbar-menu-trigger${open ? ' toolbar-menu-trigger--open' : ''}`}
        aria-expanded={open}
        title={hint}
        onClick={() => setOpenId(open ? null : id)}
      >
        {label}
        <span className="toolbar-menu-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <span className="toolbar-menu-panel" role="group" aria-label={label}>
          <span className="toolbar-menu-panel-label">{label}</span>
          <span className="toolbar-menu-panel-body">{children}</span>
        </span>
      )}
    </span>
  );
}

/** Kept for the mobile panel, which shows every group expanded at once. */
function ToolbarGroup({ label, children }) {
  return (
    <span className="toolbar-group">
      <span className="toolbar-group-label">{label}</span>
      <span className="toolbar-group-body">{children}</span>
    </span>
  );
}

function FormatToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const [formats, setFormats] = useState({});

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const sel = $getSelection();
        if ($isRangeSelection(sel)) {
          setFormats({
            bold: sel.hasFormat('bold'),
            italic: sel.hasFormat('italic'),
            underline: sel.hasFormat('underline'),
            strikethrough: sel.hasFormat('strikethrough'),
            subscript: sel.hasFormat('subscript'),
            superscript: sel.hasFormat('superscript'),
          });
        }
      });
    });
  }, [editor]);

  const fmt = (type) => editor.dispatchCommand(FORMAT_TEXT_COMMAND, type);

  return (
    <>
      <button className={`toolbar-fmt-btn${formats.bold ? ' active' : ''}`} title="Bold (⌘B)" onClick={() => fmt('bold')}><b>B</b></button>
      <button className={`toolbar-fmt-btn${formats.italic ? ' active' : ''}`} title="Italic (⌘I)" onClick={() => fmt('italic')}><i>I</i></button>
      <button className={`toolbar-fmt-btn${formats.underline ? ' active' : ''}`} title="Underline (⌘U)" onClick={() => fmt('underline')}><u>U</u></button>
      <button className={`toolbar-fmt-btn${formats.strikethrough ? ' active' : ''}`} title="Strikethrough" onClick={() => fmt('strikethrough')}><s>S</s></button>
      <button className={`toolbar-fmt-btn${formats.subscript ? ' active' : ''}`} title="Subscript" onClick={() => fmt('subscript')}>x<sub>2</sub></button>
      <button className={`toolbar-fmt-btn${formats.superscript ? ' active' : ''}`} title="Superscript" onClick={() => fmt('superscript')}>x<sup>2</sup></button>
    </>
  );
}


/**
 * A toolbar that shows as many controls as fit on one line and moves the rest
 * into an overflow menu.
 *
 * The previous arrangement had a fixed split: a set of controls always inline,
 * and a hamburger below a breakpoint. That wastes a wide window and crowds a
 * narrow one, because the breakpoint cannot know how wide the controls actually
 * are. Measuring instead means the line is always as full as it can be.
 *
 * How it works: every item is rendered into a hidden measuring row once, its
 * width recorded, and then only the ones that fit are rendered for real. A
 * ResizeObserver re-runs the sum when the window changes. Widths are measured,
 * never guessed, because a language name or a font list changes them.
 */
function ResponsiveToolbar({ items, children }) {
  const containerRef = useRef(null);
  const measureRef = useRef(null);
  const [visibleCount, setVisibleCount] = useState(items.length);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const recompute = () => {
      const widths = Array.from(measure.children).map(c => c.getBoundingClientRect().width);
      // The save controls are on their own row now, so the tools get the full
      // width; only the overflow trigger has to be accounted for.
      const available = container.getBoundingClientRect().width
        - OVERFLOW_TRIGGER_WIDTH
        - TOOLBAR_BREATHING_ROOM;

      let used = 0;
      let fit = 0;
      for (const width of widths) {
        if (used + width > available) break;
        used += width + TOOLBAR_GAP;
        fit += 1;
      }
      // Showing everything but one is worse than showing everything: the
      // trigger costs about as much as the item it would hide.
      setVisibleCount(fit >= items.length - 1 ? items.length : fit);
    };

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(container);
    return () => observer.disconnect();
  }, [items.length]);

  useEffect(() => {
    if (!overflowOpen) return;
    const onDown = (e) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target)) setOverflowOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOverflowOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [overflowOpen]);

  const hidden = items.slice(visibleCount);

  return (
    <div className="toolbar-sticky toolbar-stack">
      {/* Row one: the tools, filling the line. */}
      <div className="toolbar-responsive" ref={containerRef}>
        {/* Measured once, never shown. aria-hidden so it is invisible to
            assistive technology and to the tab order. */}
        <div className="toolbar-measure" ref={measureRef} aria-hidden="true">
          {items.map(item => <span key={`m-${item.key}`}>{item.node}</span>)}
        </div>

        {items.slice(0, visibleCount).map(item => (
          <span className="toolbar-item" key={item.key}>{item.node}</span>
        ))}

        {hidden.length > 0 && (
          <span className="toolbar-overflow" ref={overflowRef}>
            <button
              type="button"
              className={`toolbar-overflow-trigger${overflowOpen ? ' toolbar-overflow-trigger--open' : ''}`}
              onClick={() => setOverflowOpen(o => !o)}
              aria-expanded={overflowOpen}
              title={`${hidden.length} more ${hidden.length === 1 ? 'tool' : 'tools'}`}
            >
              <span className="toolbar-overflow-icon" aria-hidden="true"><span /><span /><span /></span>
            </button>
            {overflowOpen && (
              <span className="toolbar-overflow-panel">
                {hidden.map(item => (
                  <span className="toolbar-overflow-item" key={`o-${item.key}`}>{item.node}</span>
                ))}
              </span>
            )}
          </span>
        )}
      </div>

      {/* Row two: Save draft, Upload, View post.
          These were on the tools row, where three word-labelled buttons plus a
          status message ran past the edge of the post area. They are the
          actions people look for deliberately rather than reach for mid-word,
          so a line of their own costs nothing. */}
      <div className="toolbar-actions">{children}</div>
    </div>
  );
}

/** Width reserved for the overflow trigger, in pixels. */
const OVERFLOW_TRIGGER_WIDTH = 42;
/** Slack so the last item never sits flush against the edge. */
const TOOLBAR_BREATHING_ROOM = 12;
const TOOLBAR_GAP = 4;

function ToolbarPlugin({ postid, backgroundPattern, onPatternChange, username, postPublished, onPublishedChange, features, onFeaturesChange, titleRef, onSaved, folder, onFolderChange, slug, onSlugChange }) {
  // Only one popover open at a time; two would overlap.
  const [openMenu, setOpenMenu] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!mobileOpen) return;
    function handler(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setMobileOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [mobileOpen]);

  /**
   * Desktop toolbar.
   *
   * The controls people reach for constantly — undo, block type, bold/italic,
   * lists, link — are always visible. Everything else lives in a popover menu.
   * Previously all five groups were expanded by default, which produced a wall
   * of around thirty buttons above every post and pushed the writing area down
   * the page.
   */
  /**
   * Ordered most-used first, because that is the order they survive in when the
   * window is too narrow to show everything.
   */
  const toolbarItems = [
    { key: 'history', node: <UndoRedoPlugin /> },
    { key: 'block',   node: <BlockTypePlugin /> },
    { key: 'format',  node: <FormatToolbarPlugin /> },
    { key: 'list',    node: <ListToolbarPlugin /> },

    { key: 'link',   node: <LinkToolbarPlugin /> },
    { key: 'image',  node: <ImageToolbarPlugin /> },
    { key: 'code',   node: <CodeToolbarPlugin /> },
    { key: 'math',   node: <MathToolbarPlugin /> },
    { key: 'postlink', node: <PostLinkToolbarPlugin /> },
    {
      key: 'style',
      node: (
        <ToolbarMenu id="style" label="Style" hint="Colour, highlight and alignment"
                     openId={openMenu} setOpenId={setOpenMenu}>
          <InlineStylePlugin />
        </ToolbarMenu>
      ),
    },
    {
      key: 'page',
      node: (
        <ToolbarMenu id="page" label="Page" hint="Wallpaper, comments and reactions"
                     openId={openMenu} setOpenId={setOpenMenu}>
          <BackgroundToolbarPlugin pattern={backgroundPattern} onPatternChange={onPatternChange} username={username} />
          <FeatureTogglePlugin postid={postid} features={features} onFeaturesChange={onFeaturesChange} />
        </ToolbarMenu>
      ),
    },
  ];

  /** Mobile shows everything at once inside its own panel, so nothing is hidden. */
  const mobileToolbar = (
    <>
      <ToolbarGroup label="History"><UndoRedoPlugin /></ToolbarGroup>
      <ToolbarGroup label="Block"><BlockTypePlugin /><ListToolbarPlugin /></ToolbarGroup>
      <ToolbarGroup label="Format"><FormatToolbarPlugin /></ToolbarGroup>
      <ToolbarGroup label="Style"><InlineStylePlugin /></ToolbarGroup>
      <ToolbarGroup label="Insert">
        <LinkToolbarPlugin />
        <PostLinkToolbarPlugin />
        <ImageToolbarPlugin />
        <CodeToolbarPlugin />
        <MathToolbarPlugin />
      </ToolbarGroup>
      <ToolbarGroup label="Page">
        <BackgroundToolbarPlugin pattern={backgroundPattern} onPatternChange={onPatternChange} username={username} />
        <FeatureTogglePlugin postid={postid} features={features} onFeaturesChange={onFeaturesChange} />
      </ToolbarGroup>
    </>
  );

  return (
    <>
      {/* One toolbar at every width: it fills the line and overflows the rest. */}
      <ResponsiveToolbar items={toolbarItems}>
        <SaveToolbarPlugin postid={postid} backgroundPattern={backgroundPattern} postPublished={postPublished} onPublishedChange={onPublishedChange} titleRef={titleRef} onSaved={onSaved} username={username} folder={folder} onFolderChange={onFolderChange} features={features} slug={slug} />
      </ResponsiveToolbar>

    </>
  );
}

function MyOnChangePlugin({ onChange }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      onChange(editorState);
    });
  }, [editor, onChange]);
  return null;
}

function DirtyTrackerPlugin({ onDirty }) {
  const [editor] = useLexicalComposerContext();
  const initializedRef = useRef(false);
  useEffect(() => {
    return editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
      // Skip the first update which fires when the editor loads saved state
      if (!initializedRef.current) { initializedRef.current = true; return; }
      if (dirtyElements.size > 0 || dirtyLeaves.size > 0) onDirty();
    });
  }, [editor, onDirty]);
  return null;
}

function onError(error) {
  console.error(error);
}

function LoadEditorStatePlugin({ ready }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    if (!ready) return;
    const saved = localStorage.getItem("currentPostData");
    if (saved) {
      const state = editor.parseEditorState(saved);
      editor.setEditorState(state);
    }
  }, [editor, ready]);
  return null;
}

export default function RichTextEditor() {
  const [editorState, setEditorState] = useState();
  let { id } = useParams();
  const navigate = useNavigate();
  const [postDate, setPostDate] = useState("");
  const [postPublished, setPostPublished] = useState(false);
  const titlehtml = useRef("");
  const [postAuthor, setPostAuthor] = useState("");
  const [backgroundPattern, setBackgroundPattern] = useState('');
  const [postFolder, setPostFolder] = useState('');
  // Author-chosen URL slug; null means "derive it from the title".
  const [postSlug, setPostSlug] = useState(null);
  const [dataReady, setDataReady] = useState(0);
  const [postLoaded, setPostLoaded] = useState(false);
  const [features, setFeatures] = useState({ reactionsEnabled: true, discussionEnabled: true });
  const [isDirty, setIsDirty] = useState(false);
  const savedOnceRef = useRef(false);

  // Intercept in-app link clicks when there are unsaved changes
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e) => {
      const link = e.target.closest('a[href]');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('#')) return;
      // Can't use async dialog here since we need synchronous prevent/allow;
      // fall back to native confirm for navigation-intercept only
      if (!window.confirm('You have unsaved changes. Leave anyway? All unsaved data will be lost.')) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    document.addEventListener('click', handler, { capture: true });
    return () => document.removeEventListener('click', handler, { capture: true });
  }, [isDirty]);

  const me = localStorage.getItem('userName');

  // Warn on browser close/refresh when there are unsaved changes
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const onChange = useCallback((editorState) => {
    try {
      const editorStateString = JSON.stringify(editorState);
      setEditorState(JSON.parse(editorStateString));
      // Mark dirty after the initial load has populated the editor
      if (savedOnceRef.current || dataReady > 0) setIsDirty(true);
    } catch (e) {
      console.error("failed to serialize editor state:", e);
    }
  }, [dataReady]);

  // For new posts, seed localStorage with the initial title so SaveToolbarPlugin has it
  useEffect(() => {
    if (!id) {
      localStorage.setItem("currentPostTitle", titlehtml.current);
    }
  }, [id]);

  const refreshPost = useCallback(() => {
    if (!id) return;
    READ_POST(id).then((data) => {
      titlehtml.current = (data.title || '').replace(/<[^>]*>/g, '').trim();
      localStorage.setItem("currentPostTitle", titlehtml.current);
      setPostDate(data.date);
      setPostPublished(data.published);
      setBackgroundPattern(data.backgroundPattern || '');
      setPostFolder(data.folder || '');
      setPostSlug(data.slug || null);
      localStorage.setItem("currentPostData", data.description);
      setDataReady(v => v + 1);
      GET_USER_FROM_POST(id).then((author) => {
        setPostAuthor(author);
        setPostLoaded(true);
      });
    });
    GET_POST_FEATURES(id).then(d => setFeatures({ reactionsEnabled: d.reactionsEnabled, discussionEnabled: d.discussionEnabled })).catch(() => {});
  }, [id]);

  // Redirect non-owners away from the editor
  useEffect(() => {
    if (!id || !postLoaded) return;
    if (postAuthor && me !== postAuthor) navigate(`/${postAuthor}/${id}`);
  }, [id, postLoaded, postAuthor, me, navigate]);

  useEffect(() => {
    refreshPost();
  }, [refreshPost]);

  // After a successful save, mark clean and note that at least one save has happened
  const handleSaved = useCallback(() => {
    savedOnceRef.current = true;
    setIsDirty(false);
  }, []);

  // Warn the browser's own "close tab / navigate away" dialog when dirty
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  // Apply background pattern to document.body so backdrop-filter on the glass card can blur it
  useEffect(() => {
    const style = patternToStyle(backgroundPattern);
    document.body.style.backgroundImage = style.backgroundImage || '';
    document.body.style.backgroundSize = style.backgroundSize || 'auto';
    document.body.style.backgroundPosition = style.backgroundPosition || 'initial';
    document.documentElement.style.backgroundColor = style._bgColor || '';
    return () => {
      document.body.style.backgroundImage = '';
      document.body.style.backgroundSize = '';
      document.body.style.backgroundPosition = '';
      document.documentElement.style.backgroundColor = '';
    };
  }, [backgroundPattern]);

  return (
    <div style={{ minHeight: '100vh' }}>
      <LexicalComposer initialConfig={initialConfig}>
        <ListPlugin />
        <LinkPlugin />
        <CodeHighlightPlugin />
        <HashtagHighlightPlugin />
        <CodeHoverControlsPlugin />
        <EnsureLeadingParagraphPlugin />
        <EnsureTrailingParagraphPlugin />
        <CodeEscapePlugin />
        <HistoryPlugin />
        <DecoratorKeyboardPlugin />
        <ImageDragPastePlugin />
        <MyOnChangePlugin onChange={onChange} />
        <LoadEditorStatePlugin ready={dataReady} />
        <EnterScrollPlugin />
        <HeadingEnterPlugin />
        <div className="editor-centered">
          <div className="editor-post-card">
            <TitleBar
              postdata={{ id: id, title: titlehtml.current, published: postPublished, date: postDate, author: postAuthor }}
              handleEditTitleCallback={(event) => {
                const val = event.target.value ?? '';
                titlehtml.current = val;
                localStorage.setItem("currentPostTitle", val);
              }}
              editMode={true}
            />
            {/* Directly under the title, because that is where someone looks
                for "what will this post's address be". */}
            <PostSlugPlugin
              slug={postSlug}
              onSlugChange={setPostSlug}
              username={postAuthor || me}
              titleRef={titlehtml}
              postId={id > 0 ? id : null}
            />
            <ToolbarPlugin postid={id} backgroundPattern={backgroundPattern} onPatternChange={setBackgroundPattern} username={postAuthor || me} postPublished={postPublished} onPublishedChange={setPostPublished} features={features} onFeaturesChange={setFeatures} titleRef={titlehtml} onSaved={handleSaved} folder={postFolder} onFolderChange={setPostFolder} slug={postSlug} onSlugChange={setPostSlug} />
            <div style={{ position: 'relative' }}>
              <RichTextPlugin
                contentEditable={<ContentEditable className='editor-contenteditable' />}
                placeholder={<div className='editor-placeholder'>Enter some text...</div>}
                ErrorBoundary={LexicalErrorBoundary}
              />
            </div>
          </div>
        </div>
      </LexicalComposer>
    </div>
  );
}
