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
import GridButton from './TileGrid/GridButton.jsx';
import { GridSelect } from './TileGrid/GridUI.jsx';
import PixelText from './TileGrid/PixelText.jsx';

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
import { CodeHighlightNode, $isCodeNode, registerCodeHighlighting, getCodeLanguages, getLanguageFriendlyName } from '@lexical/code';
import { CustomCodeNode, $createCustomCodeNode } from './CustomCodeNode.jsx';
import { LinkNode, $createLinkNode, $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { UPLOAD_AUDIO, READ_POST, CREATE_POST, UPDATE_POST, GET_USER_FROM_POST, GET_POST_FEATURES, SET_REACTIONS_ENABLED, SET_DISCUSSION_ENABLED, SET_VOTES_ENABLED, SET_CARD_GRID, SEARCH_POSTS } from '../../BasicTextPostServerApi.js';
import { errorMessage } from '../../../../../utils/errorMessage.js';
import { useDialog } from '../../../../Dialog/Dialog.jsx';
import ThemeEditor from '../../../../PageTheme/ThemeEditor.jsx';
import { useParams, useNavigate } from "react-router-dom";
import { ImageNode, $createImageNode } from './ImageNode.jsx';
import { AudioNode, $createAudioNode } from './AudioNode.jsx';
import { MathNode, $createMathNode } from './MathNode.jsx';
import { TileGridNode, $createTileGridNode } from './TileGrid/TileGridNode.jsx';
import axios from 'axios';
import { BASE_URL } from '../../../../../config.js';
import { useBodyWallpaper, serialiseWallpaper } from '../../../../TileArt/wallpaper.js';
import WallpaperEditor from '../../../../TileArt/WallpaperEditor.jsx';
import { normaliseUploadResponse, describeUploadError } from '../../../../../utils/responsiveImage.js';
import ImageCropDialog from '../../../../ImageCrop/ImageCropDialog.jsx';
import ImagePicker from '../../../../ImagePicker/ImagePicker.jsx';
import { postPath, slugify } from '../../../../../utils/postUrl.js';
import ColourPicker from '../../../../TileArt/ColourPicker.jsx';
import { StickerCenter } from '../../../../TileArt/StickerCenter.jsx';

const EDITOR_NODES = [HeadingNode, ListNode, ListItemNode, CustomCodeNode, CodeHighlightNode, ImageNode, AudioNode, MathNode, TileGridNode, LinkNode];

const FONT_SIZES   = ['12px', '14px', '16px', '18px', '24px', '32px', '48px'];
const LINE_HEIGHTS = ['1', '1.25', '1.5', '1.75', '2', '2.5'];
const FONT_FAMILIES = [
  { label: 'Default', value: '' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Mono', value: '"Fira Code", "SF Mono", Menlo, monospace' },
  { label: 'Rounded', value: '"Nunito", "Varela Round", sans-serif' },
  { label: 'Elegant', value: '"Playfair Display", "Garamond", serif' },
  // Choco Cooky ships with the site; Comic Sans and Papyrus show where the
  // reader's device has them, otherwise the nearest free font.
  { label: 'Choco Cooky', value: '"Choco cooky", "ChocoCooky", "Sniglet", "Arial Rounded MT Bold", sans-serif' },
  { label: 'Comic Sans', value: '"Comic Sans MS", "Comic Neue", "Chalkboard SE", "Patrick Hand", cursive' },
  { label: 'Papyrus', value: 'Papyrus, Herculanum, "Luminari", "IM Fell English", fantasy' },
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
  return (
    <>
      <GridButton symbol="bullets" label="Bulleted list" text="List" onClick={() => onClick('ul')} />
      <GridButton symbol="numbers" label="Numbered list" text="List" onClick={() => onClick('ol')} />
    </>
  );
}

const BLOCK_TYPES = [
  { tag: 'paragraph', label: 'Normal text', short: '¶' },
  { tag: 'h1', label: 'Heading 1', short: 'H1' },
  { tag: 'h2', label: 'Heading 2', short: 'H2' },
  { tag: 'h3', label: 'Heading 3', short: 'H3' },
];

/**
 * The block type as four tiles (Normal, H1, H2, H3); the one the caret is in
 * is lit. They were a dropdown, and four buttons before that.
 */
function BlockTypeTiles() {
  const [editor] = useLexicalComposerContext();
  const [current, setCurrent] = useState('paragraph');

  useEffect(() => editor.registerUpdateListener(({ editorState }) => {
    editorState.read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const anchor = selection.anchor.getNode();
      const block = anchor.getKey() === 'root' ? anchor : anchor.getTopLevelElement();
      setCurrent($isHeadingNode(block) ? block.getTag() : 'paragraph');
    });
  }), [editor]);

  const choose = (tag) => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, () => (tag === 'paragraph' ? $createParagraphNode() : $createHeadingNode(tag)));
      }
    });
  };

  return (
    <span className="pe-seg" role="radiogroup" aria-label="Text style">
      {BLOCK_TYPES.map(b => (
        <GridButton key={b.tag} role="radio" aria-checked={current === b.tag} aria-pressed={undefined}
          label={b.label} {...(b.tag === 'paragraph' ? { symbol: 'paragraph' } : { text: b.short, showLabel: true })}
          on={current === b.tag} onClick={() => choose(b.tag)} className="gb-square" />
      ))}
    </span>
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
      <ColourPicker value={color} onChange={applyColor} label="Text colour" className="tg-swatch" />
      {/* The same tile dropdowns as the grid editor's, so one panel has one kind of control. */}
      <span className="toolbar-label">
        <PixelText text="Font" px={1.25} />
        <GridSelect label="Font" value={FONT_FAMILIES.some(f => f.value === fontFamily) ? fontFamily : ''}
          options={FONT_FAMILIES.map(f => [f.value, f.label])} onChange={applyFontFamily} />
      </span>
      <span className="toolbar-label">
        <PixelText text="Size" px={1.25} />
        <GridSelect label="Font size" value={fontSize}
          options={FONT_SIZES.map(v => [v, v.replace('px', '')])} onChange={applyFontSize} />
      </span>
      <span className="toolbar-label">
        <PixelText text="Spacing" px={1.25} />
        <GridSelect label="Line spacing" value={lineHeight}
          options={LINE_HEIGHTS.map(v => [v, `${v}x`])} onChange={applyLineHeight} />
      </span>
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
function HashtagHighlightPlugin() {
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

// An MP3 from the Insert row: picked, uploaded, and placed as an audio block.
function AudioToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';   // so picking the same file again still fires
    if (!file) return;
    setBusy(true);
    try {
      const { url, name } = await UPLOAD_AUDIO(file);
      editor.update(() => {
        insertBlockInner(() => $createAudioNode(url, name || file.name));
      });
    } catch (err) {
      console.error('Audio upload failed:', err);
      alert(describeUploadError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input ref={inputRef} type="file" accept=".mp3,audio/mpeg" onChange={onPick}
        style={{ display: 'none' }} tabIndex={-1} aria-hidden="true" />
      <GridButton symbol="audio" label="Audio" title="Add an MP3" disabled={busy}
        onClick={() => inputRef.current?.click()} />
    </>
  );
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
        <GridButton symbol="image" label="Image" onClick={() => setPickerOpen(true)} />
        <GridButton symbol="info" label="Image upload limits" title="Image upload info" onClick={() => setInfoOpen(o => !o)} />
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
      <GridButton symbol="link" label={isLink ? 'Edit link' : 'Link'} title={isLink ? 'Edit link' : 'Insert link'}
        on={isLink} onClick={isLink ? editLink : addLink} />
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
  return <GridButton symbol="code" label="Code" title="Code block" onClick={onClick} />;
}

function MathToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const onClick = () => {
    const equation = window.prompt('Enter LaTeX equation (e.g. \\frac{a}{b}):');
    if (equation === null) return;
    insertBlock(editor, () => $createMathNode(equation.trim()));
  };
  return <GridButton symbol="math" label="Math" title="Insert LaTeX math block" onClick={onClick} />;
}

function TileGridToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  return (
    <GridButton symbol="grid" label="Grid" onClick={() => insertBlock(editor, () => $createTileGridNode())}
      title="Insert a tile grid: text on tiles, pixel painting and photos" />
  );
}

/**
 * Insert → Sticker: opens the sticker center as a chooser, and puts the one
 * picked into the post as a small grid block (a sticker is a grid), which can
 * then be edited, moved and linked like any other.
 */
function StickerToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const key = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [open]);

  const pick = (grid) => {
    setOpen(false);
    insertBlock(editor, () => $createTileGridNode(grid));
  };

  return (
    <>
      <GridButton symbol="sticker" label="Sticker" title="Insert a sticker from your collection or the built-ins" onClick={() => setOpen(true)} />
      {open && createPortal(
        <div className="post-theme-overlay" role="dialog" aria-modal="true" aria-label="Choose a sticker"
          onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="post-theme-panel">
            <div className="post-theme-head">
              <h2>Choose a sticker</h2>
              <button type="button" className="post-theme-close" onClick={() => setOpen(false)}>Cancel</button>
            </div>
            <p className="post-theme-hint">It goes into your post as a grid you can edit, move and link.</p>
            <StickerCenter onPick={pick} />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
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
      <GridButton symbol="postLink" label="Post link" title="Insert link to another post on this site" onClick={() => setShowSearch(true)} />
      {showSearch && <PostSearchModal onSelect={handleSelect} onCancel={() => setShowSearch(false)} />}
    </>
  );
}

function BackgroundToolbarPlugin({ pattern, onPatternChange }) {
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
      <GridButton symbol="wallpaper" label="Wallpaper" title="Post wallpaper" on={open} onClick={() => setOpen(o => !o)} />
      {open && (
        <div className="toolbar-bg-panel">
          <WallpaperEditor value={pattern} onChange={w => onPatternChange(serialiseWallpaper(w))} />
        </div>
      )}
    </div>
  );
}

function FeatureTogglePlugin({ postid, features, onFeaturesChange }) {
  const { confirm, alert: showError } = useDialog();
  const isNew = !postid || postid <= 0;

  const toggle = async (key) => {
    const next = !features[key];
    if (isNew) {
      onFeaturesChange(f => ({ ...f, [key]: next }));
      return;
    }
    // Only how the card looks to visitors: nothing to confirm.
    if (key === 'cardGrid') {
      try {
        await SET_CARD_GRID(postid, next);
        onFeaturesChange(f => ({ ...f, cardGrid: next }));
      } catch {
        showError('Could not change that setting. Try again.');
      }
      return;
    }
    const label = { reactionsEnabled: 'reactions', discussionEnabled: 'comments', votesEnabled: 'voting' }[key];
    const msg = next
      ? `Enable ${label} on this post?`
      : `Disable ${label}? They will be hidden from readers until re-enabled.`;
    if (!(await confirm(msg))) return;
    try {
      if (key === 'reactionsEnabled') await SET_REACTIONS_ENABLED(postid, next);
      else if (key === 'votesEnabled') await SET_VOTES_ENABLED(postid, next);
      else await SET_DISCUSSION_ENABLED(postid, next);
      onFeaturesChange(f => ({ ...f, [key]: next }));
    } catch {
      showError('Could not change that setting. Try again.');
    }
  };

  const TOGGLES = [
    ['reactionsEnabled', 'Reactions', 'Reactions on this post', 'heart'],
    ['discussionEnabled', 'Comments', 'Comments on this post', 'comment'],
    ['votesEnabled', 'Voting', 'Upvotes, downvotes and the score on this post', 'vote'],
    ['cardGrid', 'Grid on card', "Show this post's first grid on its card in your profile", 'grid'],
  ];
  // Named switches, lit when on, set apart from the tools before them.
  return (
    <>
      <span className="tg-gap" />
      {TOGGLES.map(([key, label, title, symbol]) => (
        <GridButton key={key} symbol={symbol} showLabel label={label} on={Boolean(features[key])}
          title={`${title}: ${features[key] ? 'on' : 'off'}`} onClick={() => toggle(key)} />
      ))}
    </>
  );
}


/**
 * Lets the author choose the readable part of their post's URL.
 *
 * The address is /{username}/{slug}. Leaving it blank derives one from the
 * title; the server makes it unique among the author's posts on save, adding
 * "-2" and so on when two would clash.
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

  // Collapsed to a single readable line until clicked. The address is worth
  // seeing on every post; the input only matters when you want to change it.
  if (!editing) {
    return (
      <div className="post-slug-row">
        <span className="post-slug-static" title="This post's address">
          <span className="post-slug-dim">/{username || 'you'}/</span>
          <span className="post-slug-value">{effective || postId || 'new-post'}</span>
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
        <span className="post-slug-dim">/{username || 'you'}/</span>
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

function SaveToolbarPlugin({ postid, backgroundPattern, postPublished, onPublishedChange, titleRef, onSaved, username, folder, features, slug }) {
  const { confirm } = useDialog();
  const [editor] = useLexicalComposerContext();
  const [saveStatus, setSaveStatus] = useState('');
  const [savedId, setSavedId] = useState(null);
  const navigate = useNavigate();
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
      // Text, or any block that is content by itself — an image, a grid, a
      // math block. A post that is only a picture or a song is still a post.
      const hasContent = editor.getEditorState().read(() => {
        const root = $getRoot();
        return root.getTextContent().trim().length > 0
          || root.getChildren().some(n => ['image', 'audio', 'tilegrid', 'math'].includes(n.getType()));
      });
      if (!hasContent) { showStatus('Add some content before uploading.', true); return; }
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
          else showStatus(errorMessage(err, 'Save failed. Check your connection.'), true);
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
          // Voting starts off on the server, so only turning it on needs saying.
          if (features && features.votesEnabled) SET_VOTES_ENABLED(newId, true).catch(() => {});
          if (features && !features.cardGrid) SET_CARD_GRID(newId, false).catch(() => {});
          onSaved?.();
        })
        .catch(err => {
          showStatus(errorMessage(err, 'Failed to create post.'), true);
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
        {saving ? '…' : postPublished ? 'Save changes' : 'Publish'}
      </button>
      {viewUrl && (
        <button type="button" className="toolbar-btn-view" onClick={() => navigate(viewUrl)}>View post →</button>
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
      <GridButton symbol="undo" label="Undo" title="Undo (⌘Z)" disabled={!canUndo} onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)} />
      <GridButton symbol="redo" label="Redo" title="Redo (⌘⇧Z)" disabled={!canRedo} onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)} />
    </>
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

  const FORMATS = [
    ['bold', 'Bold', 'bold', '(⌘B)'], ['italic', 'Italic', 'italic', '(⌘I)'],
    ['underline', 'Underline', 'underline', '(⌘U)'], ['strikethrough', 'Strikethrough', 'strike', ''],
    ['subscript', 'Subscript', 'sub', ''], ['superscript', 'Superscript', 'sup', ''],
  ];
  return (
    <span className="pe-seg">
      {FORMATS.map(([type, label, symbol, keys]) => (
        <GridButton key={type} symbol={symbol} label={label} title={`${label} ${keys}`.trim()}
          on={Boolean(formats[type])} onClick={() => fmt(type)} />
      ))}
    </span>
  );
}


/**
 * The tools, laid out like the grid editor's: a dark panel of named rows
 * (Edit, Text, Style, Insert, Page) of tile buttons, then the save actions.
 * "Fewer tools" folds it to the Edit and Text rows, remembered per browser.
 */
const OPEN_KEY = 'editorToolSections';

/** Which sections are open, kept per browser; sections not mentioned use `fallback`. */
function readOpen() {
  try { return JSON.parse(localStorage.getItem(OPEN_KEY)) || {}; } catch { return {}; }
}

/**
 * One section of the tools: a header (its name in grid pixels, with a
 * triangle) that folds just that section. Each remembers whether it is open.
 */
function ToolRow({ label, open, onToggle, children }) {
  return (
    <div className={`tg-group pe-section ${open ? 'is-open' : 'is-folded'}`} role="group" aria-label={label}>
      <button type="button" className="pe-section-head" aria-expanded={open} onClick={onToggle}
        title={`${open ? 'Hide' : 'Show'} ${label}`}>
        <PixelText symbol={open ? 'open' : 'closed'} px={1.5} />
        <PixelText text={label} px={1.5} />
      </button>
      {open && <div className="pe-section-body">{children}</div>}
    </div>
  );
}

/**
 * The tools, laid out like the grid editor's: a dark panel of named sections
 * of grid buttons, each folding on its own, then the save actions. On a
 * phone Edit, Text and Insert start open.
 */
function ToolPanel({ rows, children }) {
  const [kept, setKept] = useState(readOpen);
  const phone = window.matchMedia?.('(max-width: 600px)').matches ?? false;
  const isOpen = (row) => (row.label in kept ? kept[row.label] : (!phone || row.always));
  const toggle = (row) => {
    const next = { ...kept, [row.label]: !isOpen(row) };
    setKept(next);
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)); } catch { /* not kept */ }
  };
  return (
    <div className="toolbar-sticky toolbar-stack">
      <div className="pe-panel" role="toolbar" aria-label="Post tools">
        {rows.map(r => <ToolRow key={r.label} label={r.label} open={isOpen(r)} onToggle={() => toggle(r)}>{r.node}</ToolRow>)}
      </div>
      {/* Save draft, Publish, View post: on a row of their own. */}
      <div className="toolbar-actions">{children}</div>
    </div>
  );
}

function ToolbarPlugin({ postid, backgroundPattern, onPatternChange, username, postPublished, onPublishedChange, features, onFeaturesChange, titleRef, onSaved, folder, onFolderChange, slug }) {
  // The post-theme editor: opened from the Page row, and shown over the page.
  const [themeOpen, setThemeOpen] = useState(false);
  const savedPost = postid && postid > 0;

  const rows = [
    { label: 'Edit', always: true, node: <UndoRedoPlugin /> },
    {
      label: 'Text', always: true,
      node: (
        <>
          <BlockTypeTiles />
          <span className="tg-gap" />
          <FormatToolbarPlugin />
          <span className="tg-gap" />
          <LinkToolbarPlugin />
        </>
      ),
    },
    { label: 'Style', node: <InlineStylePlugin /> },
    {
      label: 'Insert', always: true,
      node: (
        <>
          <ListToolbarPlugin />
          <ImageToolbarPlugin />
          <AudioToolbarPlugin />
          <CodeToolbarPlugin />
          <MathToolbarPlugin />
          <TileGridToolbarPlugin />
          <StickerToolbarPlugin />
          <PostLinkToolbarPlugin />
        </>
      ),
    },
    {
      label: 'Page',
      node: (
        <>
          <BackgroundToolbarPlugin pattern={backgroundPattern} onPatternChange={onPatternChange} />
          {/* Each post has its own theme; it starts as a copy of the profile's. */}
          <GridButton symbol="theme" label="Theme" disabled={!savedPost}
            title={savedPost ? "This post's own theme" : 'Save the post first: it starts with your profile theme'}
            onClick={() => setThemeOpen(true)} />
          <span className="tg-gap" />
          <FeatureTogglePlugin postid={postid} features={features} onFeaturesChange={onFeaturesChange} />
        </>
      ),
    },
  ];

  return (
    <>
      {themeOpen && createPortal(
        <div className="post-theme-overlay" role="dialog" aria-modal="true" aria-label="Theme for this post">
          <div className="post-theme-panel">
            <div className="post-theme-head">
              <h2>Theme for this post</h2>
              <button type="button" className="post-theme-close" onClick={() => setThemeOpen(false)}>Done</button>
            </div>
            <p className="post-theme-hint">
              This post keeps its own theme: changing your profile theme won&rsquo;t change it, and
              this won&rsquo;t change your profile.
            </p>
            <ThemeEditor username={username} postId={postid} />
          </div>
        </div>,
        document.body,
      )}
      <ToolPanel rows={rows}>
        <SaveToolbarPlugin postid={postid} backgroundPattern={backgroundPattern} postPublished={postPublished} onPublishedChange={onPublishedChange} titleRef={titleRef} onSaved={onSaved} username={username} folder={folder} onFolderChange={onFolderChange} features={features} slug={slug} />
      </ToolPanel>

    </>
  );
}

const LOAD_TAG = 'webposting-load';

function MyOnChangePlugin({ onChange }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    // Only real edits count. Loading the post, focus and moving the caret are
    // updates too, and used to mark a post as changed the moment it opened, so
    // leaving an untouched post asked about unsaved changes.
    return editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves, tags }) => {
      if (tags.has(LOAD_TAG)) return;
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
      onChange(editorState);
    });
  }, [editor, onChange]);
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
      editor.setEditorState(state, { tag: LOAD_TAG });
    }
  }, [editor, ready]);
  return null;
}

export default function RichTextEditor() {
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
  const [features, setFeatures] = useState({ reactionsEnabled: true, discussionEnabled: true, votesEnabled: false, cardGrid: true });
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

  // Only marks the post as changed. It used to serialise the whole editor
  // state on every keystroke into a copy nothing read — megabytes per key
  // once a post holds a grid's pixels.
  const onChange = useCallback(() => {
    if (savedOnceRef.current || dataReady > 0) setIsDirty(true);
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
      // A slug that is just the title's is not a custom one: keep it following
      // the title. Anything else — chosen, or de-duplicated — stays put.
      setPostSlug(data.slug && data.slug !== slugify(data.title || '') ? data.slug : null);
      localStorage.setItem("currentPostData", data.description);
      setDataReady(v => v + 1);
      GET_USER_FROM_POST(id).then((author) => {
        setPostAuthor(author);
        setPostLoaded(true);
      });
    });
    GET_POST_FEATURES(id).then(d => setFeatures({ reactionsEnabled: d.reactionsEnabled, discussionEnabled: d.discussionEnabled, votesEnabled: !!d.votesEnabled, cardGrid: d.cardGrid !== false })).catch(() => {});
  }, [id]);

  // Redirect non-owners away from the editor
  useEffect(() => {
    if (!id || !postLoaded) return;
    if (postAuthor && me !== postAuthor) navigate(`/${postAuthor}/${id}`);
  }, [id, postLoaded, postAuthor, me, navigate]);

  useEffect(() => {
    refreshPost();
  }, [refreshPost]);

  // Settings saved with the post, not by themselves: changing one is an
  // unsaved change like an edit to the text.
  const changePattern = useCallback(v => { setBackgroundPattern(v); setIsDirty(true); }, []);
  const changeFolder = useCallback(v => { setPostFolder(v); setIsDirty(true); }, []);
  const changeSlug = useCallback(v => { setPostSlug(v); setIsDirty(true); }, []);

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

  // The author's wallpaper, behind the whole page.
  useBodyWallpaper(backgroundPattern);

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
                setIsDirty(true);
              }}
              editMode={true}
            />
            {/* Directly under the title, because that is where someone looks
                for "what will this post's address be". */}
            <PostSlugPlugin
              slug={postSlug}
              onSlugChange={changeSlug}
              username={postAuthor || me}
              titleRef={titlehtml}
              postId={id > 0 ? id : null}
            />
            <ToolbarPlugin postid={id} backgroundPattern={backgroundPattern} onPatternChange={changePattern} username={postAuthor || me} postPublished={postPublished} onPublishedChange={setPostPublished} features={features} onFeaturesChange={setFeatures} titleRef={titlehtml} onSaved={handleSaved} folder={postFolder} onFolderChange={changeFolder} slug={postSlug} onSlugChange={changeSlug} />
            {/* The post itself, in its theme's fonts; the controls above stay in the app's. */}
            <div className="th-scope" style={{ position: 'relative' }}>
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
