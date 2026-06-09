import {
  $createParagraphNode, $getSelection, $isRangeSelection, $isNodeSelection,
  $insertNodes, KEY_BACKSPACE_COMMAND, KEY_DELETE_COMMAND, KEY_ESCAPE_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  UNDO_COMMAND, REDO_COMMAND, CAN_UNDO_COMMAND, CAN_REDO_COMMAND,
  FORMAT_TEXT_COMMAND, $getNodeByKey, $getRoot, $isParagraphNode,
} from 'lexical';
import { $isHeadingNode } from '@lexical/rich-text';
import { $isListNode } from '@lexical/list';
import { useEffect, useRef, useState, useCallback } from 'react';
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
import { READ_POST, CREATE_POST, UPDATE_POST, GET_USER_FROM_POST, GET_POST_FEATURES, SET_REACTIONS_ENABLED, SET_DISCUSSION_ENABLED } from '../../BasicTextPostServerApi.js';
import { useParams, useNavigate, useBlocker } from "react-router-dom";
import { ImageNode, $createImageNode } from './ImageNode.jsx';
import { MathNode, $createMathNode } from './MathNode.jsx';
import axios from 'axios';
import { BASE_URL } from '../../../../../config.js';
import PatternPicker from '../../../../PatternPicker/PatternPicker.jsx';
import { patternToStyle } from '../../../../PatternPicker/patterns.js';

const EDITOR_NODES = [HeadingNode, ListNode, ListItemNode, CustomCodeNode, CodeHighlightNode, ImageNode, MathNode, LinkNode];

const FONT_SIZES = ['12px', '14px', '16px', '18px', '24px', '32px', '48px'];

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
  const [color, setColor] = useState('#000000');
  const [fontSize, setFontSize] = useState('16px');

  // Keep toolbar controls in sync with the cursor / selection
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          const currentColor = $getSelectionStyleValueForProperty(selection, 'color', '#000000');
          const currentSize = $getSelectionStyleValueForProperty(selection, 'font-size', '16px');
          if (currentColor) setColor(currentColor);
          if (currentSize) setFontSize(currentSize);
        }
      });
    });
  }, [editor]);

  const applyColor = (value) => {
    setColor(value);
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $patchStyleText(selection, { color: value });
      }
    });
  };

  const applyFontSize = (value) => {
    setFontSize(value);
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $patchStyleText(selection, { 'font-size': value });
      }
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
    </>
  );
}

function CodeHighlightPlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    return registerCodeHighlighting(editor);
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
      let nodeKey = null, lightMode = false, lineNumbers = false, language = '';
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

      const overlay = document.createElement('div');
      overlay.className = 'code-hover-controls';
      // Position fixed over the code block, outside any overflow:auto container
      const rect = el.getBoundingClientRect();
      overlay.style.position = 'fixed';
      overlay.style.top = (rect.top + 4) + 'px';
      overlay.style.right = (window.innerWidth - rect.right + 4) + 'px';
      overlay.style.zIndex = '9999';
      // Remove absolute positioning from class (handled inline above)
      overlay.style.setProperty('position', 'fixed', 'important');

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

      // Language select
      const select = document.createElement('select');
      select.className = 'code-ctrl-select';
      select.title = 'Code language';
      const plainOpt = document.createElement('option');
      plainOpt.value = '';
      plainOpt.textContent = 'Plain text';
      select.appendChild(plainOpt);
      LANGS.forEach(lang => {
        const opt = document.createElement('option');
        opt.value = lang;
        opt.textContent = getLanguageFriendlyName(lang);
        select.appendChild(opt);
      });
      select.value = language;
      select.addEventListener('mousedown', ev => ev.stopPropagation());
      select.addEventListener('change', () => {
        editor.update(() => {
          const node = $getNodeByKey(nodeKey);
          if ($isCodeNode(node)) node.setLanguage(select.value);
        });
      });
      overlay.appendChild(select);
      overlay.appendChild(sep());

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
      const src = response.data;
      editor.update(() => {
        $insertNodes([$createImageNode(src, file.name)]);
      });
    } catch (err) {
      console.error('Image upload failed:', err);
      if (err.response?.status === 413) alert('Image is too large (max 5 MB).');
      else if (err.response?.status === 401) alert('Please log in to upload images.');
      else alert('Image upload failed.');
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
  const fileInputRef = useRef(null);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      // Do NOT set Content-Type manually — let the browser attach the correct multipart boundary
      const response = await axios.post(BASE_URL + '/api/upload', formData, {
        withCredentials: true,
      });
      const src = response.data;
      editor.update(() => {
        const imageNode = $createImageNode(src, file.name);
        $insertNodes([imageNode]);
      });
    } catch (err) {
      console.error('Image upload failed:', err);
      if (err.response?.status === 413) {
        alert('Image is too large. Maximum file size is 5 MB.');
      } else if (err.response?.status === 401) {
        alert('Please log in before uploading an image.');
      } else {
        alert('Image upload failed (status ' + (err.response?.status ?? 'unknown') + ').');
      }
    }
    e.target.value = '';
  };

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept="image/*"
        onChange={handleFileChange}
      />
      <button className="toolbar-btn-image" onClick={() => fileInputRef.current.click()}>Image</button>
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

  const getCurrentUrl = () => {
    let url = '';
    editor.getEditorState().read(() => {
      const sel = $getSelection();
      const node = getLinkNode(sel);
      if (node) url = node.getURL();
    });
    return url;
  };

  const addLink = () => {
    const url = window.prompt('Enter URL:');
    if (!url || !url.trim()) return;
    const href = url.startsWith('http') ? url : 'https://' + url;
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, { url: href, target: '_blank' });
  };

  const editLink = () => {
    const current = getCurrentUrl();
    const url = window.prompt('Edit URL:', current);
    if (url === null) return; // cancelled
    if (!url.trim()) {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
      return;
    }
    const href = url.startsWith('http') ? url : 'https://' + url;
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, { url: href, target: '_blank' });
  };

  const removeLink = () => editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);

  return (
    <>
      <button
        className={`toolbar-fmt-btn${isLink ? ' active' : ''}`}
        title={isLink ? 'Edit link' : 'Insert link'}
        onClick={isLink ? editLink : addLink}
      >
        Link
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
    </>
  );
}

function CodeToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const onClick = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, () => $createCustomCodeNode());
      }
    });
  };
  return <button onClick={onClick}>Code</button>;
}

function MathToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const onClick = () => {
    const equation = window.prompt('Enter LaTeX equation (e.g. \\frac{a}{b}):');
    if (equation === null) return;
    editor.update(() => {
      $insertNodes([$createMathNode(equation.trim())]);
    });
  };
  return <button onClick={onClick} title="Insert LaTeX math block">∑ Math</button>;
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
  if (!postid || postid <= 0) return null;

  const toggle = async (key, setter) => {
    const next = !features[key];
    try {
      if (key === 'reactionsEnabled') await SET_REACTIONS_ENABLED(postid, next);
      else await SET_DISCUSSION_ENABLED(postid, next);
      onFeaturesChange(f => ({ ...f, [key]: next }));
    } catch {}
  };

  return (
    <span className="toolbar-collapsible">
      <button
        className={`post-toggle-btn toolbar-fmt-btn${features.reactionsEnabled ? ' active' : ''}`}
        onClick={() => toggle('reactionsEnabled')}
        title="Toggle reactions"
        style={{ fontSize: '12px' }}
      >
        {features.reactionsEnabled ? '❤ on' : '❤ off'}
      </button>
      <button
        className={`post-toggle-btn toolbar-fmt-btn${features.discussionEnabled ? ' active' : ''}`}
        onClick={() => toggle('discussionEnabled')}
        title="Toggle discussion"
        style={{ fontSize: '12px' }}
      >
        {features.discussionEnabled ? '💬 on' : '💬 off'}
      </button>
    </span>
  );
}

function SaveToolbarPlugin({ postid, backgroundPattern, postPublished, onPublishedChange, titleRef, onSaved }) {
  const [editor] = useLexicalComposerContext();
  const [saveStatus, setSaveStatus] = useState('');
  const isExisting = postid > 0;

  const showStatus = (msg, isError = false) => {
    setSaveStatus({ msg, error: isError });
    setTimeout(() => setSaveStatus(''), 3000);
  };

  const save = (published) => {
    const editorState = JSON.stringify(editor.getEditorState().toJSON());
    const postTitle = titleRef?.current || localStorage.getItem("currentPostTitle") || 'Untitled';
    if (isExisting) {
      UPDATE_POST(postid, postTitle, editorState, published, backgroundPattern)
        .then(() => {
          showStatus(published ? 'Published!' : postPublished ? 'Unpublished.' : 'Draft saved.');
          onPublishedChange(published);
          onSaved?.();
        })
        .catch(err => {
          console.error("Save failed:", err);
          const code = err.response?.status;
          if (code === 401 || code === 403) showStatus('Not authorized to save.', true);
          else showStatus('Save failed. Check your connection.', true);
        });
    } else {
      CREATE_POST(1, postTitle, editorState, published, backgroundPattern)
        .then(() => {
          showStatus(published ? 'Post created!' : 'Draft created.');
          onSaved?.();
        })
        .catch(err => {
          console.error("Create failed:", err);
          showStatus('Failed to create post.', true);
        });
    }
  };

  return (
    <>
      {saveStatus && (
        <span style={{
          fontSize: '0.78rem',
          color: saveStatus.error ? '#ef4444' : '#15803d',
          fontWeight: 600,
          padding: '2px 6px',
        }}>
          {saveStatus.msg}
        </span>
      )}
      <button className="toolbar-btn-draft" onClick={() => save(false)}>
        {postPublished ? 'Unpublish' : 'Save Draft'}
      </button>
      <button className="toolbar-btn-save" onClick={() => save(true)}>
        {isExisting && postPublished ? 'Save' : 'Publish'}
      </button>
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

function CollapsibleSection({ label, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <span className="toolbar-collapsible">
      <button
        className="toolbar-collapse-toggle"
        title={open ? `Collapse ${label}` : `Expand ${label}`}
        onClick={() => setOpen(o => !o)}
      >{label} {open ? '▾' : '▸'}</button>
      {open && <span className="toolbar-collapsible-body">{children}</span>}
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

function ToolbarPlugin({ postid, backgroundPattern, onPatternChange, username, postPublished, onPublishedChange, features, onFeaturesChange, titleRef, onSaved }) {
  return (
    <div className='toolbar-sticky'>
      <UndoRedoPlugin />
      <span className='toolbar-divider' />
      <CollapsibleSection label="Block">
        <BlockTypePlugin />
        <ListToolbarPlugin />
      </CollapsibleSection>
      <span className='toolbar-divider' />
      <CollapsibleSection label="Format">
        <FormatToolbarPlugin />
      </CollapsibleSection>
      <span className='toolbar-divider' />
      <CollapsibleSection label="Style">
        <InlineStylePlugin />
      </CollapsibleSection>
      <span className='toolbar-divider' />
      <CollapsibleSection label="Insert" defaultOpen={false}>
        <LinkToolbarPlugin />
        <CodeToolbarPlugin />
        <MathToolbarPlugin />
        <ImageToolbarPlugin />
      </CollapsibleSection>
      <span className='toolbar-divider' />
      <CollapsibleSection label="Preferences" defaultOpen={false}>
        <BackgroundToolbarPlugin pattern={backgroundPattern} onPatternChange={onPatternChange} username={username} />
        <FeatureTogglePlugin postid={postid} features={features} onFeaturesChange={onFeaturesChange} />
      </CollapsibleSection>
      <span className='toolbar-divider' />
      <SaveToolbarPlugin postid={postid} backgroundPattern={backgroundPattern} postPublished={postPublished} onPublishedChange={onPublishedChange} titleRef={titleRef} onSaved={onSaved} />
    </div>
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
  const titlehtml = useRef("Title");
  const [postAuthor, setPostAuthor] = useState("");
  const [backgroundPattern, setBackgroundPattern] = useState('');
  const [dataReady, setDataReady] = useState(0);
  const [postLoaded, setPostLoaded] = useState(false);
  const [features, setFeatures] = useState({ reactionsEnabled: false, discussionEnabled: false });
  const [isDirty, setIsDirty] = useState(false);
  const savedOnceRef = useRef(false);

  // Block navigation away from an unsaved editor
  useBlocker(({ currentLocation, nextLocation }) => {
    if (!isDirty) return false;
    if (currentLocation.pathname === nextLocation.pathname) return false;
    return !window.confirm('You have unsaved changes. Leave anyway? All unsaved data will be lost.');
  });

  const me = localStorage.getItem('userName');

  const onChange = useCallback((editorState) => {
    try {
      const editorStateString = JSON.stringify(editorState);
      setEditorState(JSON.parse(editorStateString));
      // Mark dirty after the initial load has populated the editor
      if (savedOnceRef.current || dataReady > 0) setIsDirty(true);
    } catch (e) {
      console.log("failed to serialize editor state: " + e);
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
      titlehtml.current = data.title;
      localStorage.setItem("currentPostTitle", data.title);
      setPostDate(data.date);
      setPostPublished(data.published);
      setBackgroundPattern(data.backgroundPattern || '');
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
    if (postAuthor && me !== postAuthor) navigate(`/users/${postAuthor}/${id}`);
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
        <CodeHoverControlsPlugin />
        <EnsureLeadingParagraphPlugin />
        <CodeEscapePlugin />
        <HistoryPlugin />
        <DecoratorKeyboardPlugin />
        <ImageDragPastePlugin />
        <MyOnChangePlugin onChange={onChange} />
        <LoadEditorStatePlugin ready={dataReady} />
        <div className="editor-centered">
          <div className="editor-post-card">
            <TitleBar
              postdata={{ id: id, title: titlehtml.current, published: postPublished, date: postDate, author: postAuthor }}
              handleEditTitleCallback={(event) => {
                if (event.target.value) {
                  titlehtml.current = event.target.value;
                  localStorage.setItem("currentPostTitle", titlehtml.current);
                }
              }}
              editMode={true}
            />
            <ToolbarPlugin postid={id} backgroundPattern={backgroundPattern} onPatternChange={setBackgroundPattern} username={postAuthor} postPublished={postPublished} onPublishedChange={setPostPublished} features={features} onFeaturesChange={setFeatures} titleRef={titlehtml} onSaved={handleSaved} />
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
