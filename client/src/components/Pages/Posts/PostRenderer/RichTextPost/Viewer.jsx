import { useEffect, useState } from 'react';
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
import { CodeNode, CodeHighlightNode, registerCodeHighlighting } from '@lexical/code';
import TitleBar from './TitleBar';
import { useParams, useNavigate } from 'react-router-dom';
import {
  READ_POST, GET_USER_FROM_POST,
  GET_POST_FEATURES, SET_REACTIONS_ENABLED,
} from '../../BasicTextPostServerApi.js';
import { ImageNode } from './ImageNode.jsx';
import { MathNode } from './MathNode.jsx';
import ReactionBar from '../../../../Social/ReactionBar.jsx';
import DiscussionSection from '../../../../Social/DiscussionSection.jsx';
import { LinkNode } from '@lexical/link';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { ClickableLinkPlugin } from '@lexical/react/LexicalClickableLinkPlugin';

const VIEWER_NODES = [HeadingNode, ListNode, ListItemNode, CodeNode, CodeHighlightNode, ImageNode, MathNode, LinkNode];

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

function CopyCodePlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;
    const entered = new WeakMap();

    const onEnter = (e) => {
      const el = e.target.closest('code.editor-code');
      if (!el || entered.has(el)) return;
      const btn = document.createElement('button');
      btn.textContent = '⎘ Copy';
      btn.className = 'code-copy-overlay-btn';
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        btn.remove();
        const text = el.innerText;
        el.appendChild(btn);
        navigator.clipboard.writeText(text).then(() => {
          btn.textContent = '✓';
          setTimeout(() => { btn.textContent = '⎘ Copy'; }, 1500);
        }).catch(() => {});
      });
      el.appendChild(btn);
      entered.set(el, btn);
      el.addEventListener('mouseleave', () => { btn.remove(); entered.delete(el); }, { once: true });
    };

    root.addEventListener('mouseenter', onEnter, true);
    return () => root.removeEventListener('mouseenter', onEnter, true);
  }, [editor]);
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
  const [features, setFeatures] = useState({ reactionsEnabled: false });

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
      .then(d => setFeatures({ reactionsEnabled: d.reactionsEnabled }))
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
    return () => {
      document.body.style.backgroundImage = '';
      document.body.style.backgroundSize = '';
      document.body.style.backgroundPosition = '';
    };
  }, [backgroundPattern]);

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
        <CopyCodePlugin />
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
            <div style={{ position: 'relative' }}>
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

            {/* Inline discussion section */}
            <DiscussionSection postId={id} postAuthor={postAuthor} />
          </div>
        </div>
      </LexicalComposer>
    </div>
  );
}
