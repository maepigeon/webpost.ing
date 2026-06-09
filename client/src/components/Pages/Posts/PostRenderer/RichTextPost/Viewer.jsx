import { useEffect, useState, useRef } from 'react';
import './Editor.css';
import './Viewer.css';
import { patternToStyle } from '../../../../PatternPicker/patterns.js';
import { exampleTheme } from './exampleTheme';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HeadingNode } from '@lexical/rich-text';
import { ListNode, ListItemNode } from '@lexical/list';
import { CodeHighlightNode, registerCodeHighlighting } from '@lexical/code';
import { CustomCodeNode } from './CustomCodeNode.jsx';
import TitleBar from './TitleBar';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  READ_POST, GET_USER_FROM_POST,
  GET_POST_FEATURES, SET_REACTIONS_ENABLED,
} from '../../BasicTextPostServerApi.js';
import { ImageNode } from './ImageNode.jsx';
import { MathNode } from './MathNode.jsx';
import ReactionBar from '../../../../Social/ReactionBar.jsx';
import { LinkNode } from '@lexical/link';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { ClickableLinkPlugin } from '@lexical/react/LexicalClickableLinkPlugin';

const VIEWER_NODES = [HeadingNode, ListNode, ListItemNode, CustomCodeNode, CodeHighlightNode, ImageNode, MathNode, LinkNode];

const initialConfig = {
  namespace: 'MyViewer',
  editable: false,
  theme: exampleTheme,
  onError,
  nodes: VIEWER_NODES,
};

function onError(error) { console.error(error); }

function CodeHighlightPlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => registerCodeHighlighting(editor), [editor]);
  return null;
}


function LoadEditorStatePlugin({ ready }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    if (!ready) return;
    const saved = localStorage.getItem('currentPostData');
    if (saved) editor.setEditorState(editor.parseEditorState(saved));
  }, [editor, ready]);
  return null;
}

export default function RichTextViewer() {
  const { id, username } = useParams();
  const navigate = useNavigate();

  const [postTitle, setPostTitle] = useState('Loading...');
  const [postDate, setPostDate] = useState('');
  const [postPublished, setPostPublished] = useState(false);
  const [postAuthor, setPostAuthor] = useState('');
  const [backgroundPattern, setBackgroundPattern] = useState('');
  const [dataReady, setDataReady] = useState(false);
  const [postLoaded, setPostLoaded] = useState(false);
  const [features, setFeatures] = useState({ reactionsEnabled: false, discussionEnabled: false });

  const me = localStorage.getItem('userName');
  const isAuthor = me && me === postAuthor;

  useEffect(() => {
    READ_POST(id).then(data => {
      setPostTitle(data.title);
      setPostDate(data.date);
      setPostPublished(data.published);
      setBackgroundPattern(data.backgroundPattern || '');
      localStorage.setItem('currentPostData', data.description);
      setDataReady(true);
      GET_USER_FROM_POST(id).then(author => {
        setPostAuthor(author);
        setPostLoaded(true);
      });
    });
    GET_POST_FEATURES(id)
      .then(d => setFeatures({ reactionsEnabled: d.reactionsEnabled, discussionEnabled: d.discussionEnabled }))
      .catch(() => {});
  }, [id]);

  // Redirect non-owners away from unpublished posts
  useEffect(() => {
    if (!postLoaded) return;
    if (!postPublished && me !== postAuthor) navigate('/');
  }, [postLoaded, postPublished, me, postAuthor, navigate]);

  // Apply background pattern to body for backdrop-filter
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

  // Attach copy bars to code blocks after content loads.
  // Bars are appended to document.body with position:fixed so Lexical's
  // reconciler never touches them, and overflow:auto on .editor-code never clips them.
  const contentRef = useRef(null);
  useEffect(() => {
    if (!dataReady) return;
    const bars = [];

    // Walk the code element's DOM extracting text, handling <br> as \n.
    // innerText on a detached/styled node is unreliable for newlines.
    function extractText(node) {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (node.nodeName === 'BR') return '\n';
      if (node.classList?.contains('line-nums-gutter')) return '';
      let t = '';
      node.childNodes.forEach(child => { t += extractText(child); });
      return t;
    }

    // 400 ms — well past CodeHighlightPlugin's two-cycle transform settle
    const timer = setTimeout(() => {
      const root = contentRef.current;
      if (!root) return;
      const codes = root.querySelectorAll('code.editor-code');
      if (!codes.length) return;

      const containerRect = root.getBoundingClientRect();

      codes.forEach(code => {
        const codeRect = code.getBoundingClientRect();
        const bar = document.createElement('div');
        bar.className = 'code-copy-bar';
        bar.style.position = 'absolute';
        bar.style.zIndex = '10';
        // Overlay the top strip of the code block (where the language label is)
        bar.style.top = (codeRect.top - containerRect.top) + 'px';
        bar.style.left = (codeRect.left - containerRect.left) + 'px';
        bar.style.width = codeRect.width + 'px';

        const btn = document.createElement('button');
        btn.textContent = 'Copy';
        btn.className = 'code-copy-bar-btn';
        btn.addEventListener('click', () => {
          const text = extractText(code);
          navigator.clipboard.writeText(text).then(() => {
            btn.textContent = '✓ Copied';
            setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
          }).catch(() => {});
        });
        bar.appendChild(btn);
        root.appendChild(bar);
        bars.push({ bar, code });
      });
    }, 400);

    return () => {
      clearTimeout(timer);
      bars.forEach(({ bar }) => bar.remove());
    };
  }, [dataReady]);

  const toggleReactions = async () => {
    const next = !features.reactionsEnabled;
    await SET_REACTIONS_ENABLED(id, next).catch(() => {});
    setFeatures(f => ({ ...f, reactionsEnabled: next }));
  };

  const authorUsername = username || postAuthor;

  return (
    <div style={{ minHeight: '100vh' }}>
      <LexicalComposer initialConfig={initialConfig}>
        <CodeHighlightPlugin />
        <LinkPlugin />
        <ClickableLinkPlugin />
        <HistoryPlugin />
        <LoadEditorStatePlugin ready={dataReady} />
        <div className="editor-centered">
          <div className="editor-post-card">
            <TitleBar
              postdata={{ id, title: postTitle, published: postPublished, date: postDate, author: postAuthor }}
              updatePostsFlagCallback={() => {}}
              editMode={false}
            />
            <div style={{ position: 'relative' }} ref={contentRef}>
              <RichTextPlugin
                contentEditable={<ContentEditable className="editor-contenteditable" />}
                placeholder={<div className="editor-placeholder">Enter some text...</div>}
                ErrorBoundary={LexicalErrorBoundary}
              />
            </div>

            {/* Reactions — only if enabled */}
            {features.reactionsEnabled && <ReactionBar postId={id} />}

            {/* Reactions toggle (author only) */}
            {isAuthor && (
              <div className="post-footer">
                <div className="post-author-controls">
                  <button
                    className={`post-toggle-btn${features.reactionsEnabled ? ' active' : ''}`}
                    onClick={toggleReactions}
                  >
                    {features.reactionsEnabled ? 'Reactions on' : 'Reactions off'}
                  </button>
                </div>
              </div>
            )}

            {/* Discussion page link — only shown when discussion is enabled */}
            {features.discussionEnabled && (
              <div style={{ padding: '0 24px 16px', textAlign: 'center' }}>
                <Link
                  to={`/users/${authorUsername}/${id}/discussion`}
                  style={{ fontSize: '14px', color: '#1a73e8', textDecoration: 'none', fontWeight: 500 }}
                >
                  Discussion
                </Link>
              </div>
            )}
          </div>
        </div>
      </LexicalComposer>
    </div>
  );
}
