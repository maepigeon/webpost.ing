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
import ReactionBar from '../../../../Social/ReactionBar.jsx';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useDialog } from '../../../../Dialog/Dialog.jsx';
import {
  READ_POST, GET_USER_FROM_POST,
  GET_POST_FEATURES, GET_PINNED_POST, SET_PINNED_POST, UNPIN_POST,
  RECORD_POST_VIEW, GET_POST_VIEWS, GET_POST_VOTE, VOTE_POST,
} from '../../BasicTextPostServerApi.js';
import { ImageNode } from './ImageNode.jsx';
import { MathNode } from './MathNode.jsx';
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

// Linkifies #hashtag text nodes after every Lexical update settles (debounced 200ms).
// Runs inside LexicalComposer so registerUpdateListener tells us exactly when Lexical is done.
function HashtagLinkerPlugin({ contentRef, navigate }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    let timer = null;
    const linkify = () => {
      const root = contentRef.current;
      if (!root) return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName;
          if (tag === 'A' || tag === 'CODE' || tag === 'SCRIPT') return NodeFilter.FILTER_REJECT;
          if (parent.closest('code, pre, .editor-code, .code-copy-bar')) return NodeFilter.FILTER_REJECT;
          return /#\w/.test(node.textContent) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      });
      const matches = [];
      let node;
      while ((node = walker.nextNode())) matches.push(node);
      for (const textNode of matches) {
        const text = textNode.textContent;
        if (!/#\w/.test(text)) continue;
        const frag = document.createDocumentFragment();
        const parts = text.split(/(#[\w]{1,50})/g);
        parts.forEach(part => {
          if (/^#[\w]{1,50}$/.test(part)) {
            const tag = part.slice(1);
            const a = document.createElement('a');
            a.href = `/search?tag=${encodeURIComponent(tag)}`;
            a.textContent = part;
            a.className = 'hashtag-link';
            a.addEventListener('click', e => { e.preventDefault(); navigate(`/search?tag=${encodeURIComponent(tag)}`); });
            frag.appendChild(a);
          } else if (part) {
            frag.appendChild(document.createTextNode(part));
          }
        });
        if (textNode.parentNode) textNode.parentNode.replaceChild(frag, textNode);
      }
    };
    const unsub = editor.registerUpdateListener(() => {
      clearTimeout(timer);
      timer = setTimeout(linkify, 200);
    });
    return () => { unsub(); clearTimeout(timer); };
  }, [editor, contentRef, navigate]);
  return null;
}

export default function RichTextViewer() {
  const { id, username } = useParams();
  const navigate = useNavigate();
  const { confirm } = useDialog();

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
  const [shareCopied, setShareCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const shareRef = useRef(null);
  const [isPinned, setIsPinned] = useState(false);
  const [viewCounts, setViewCounts] = useState(null); // { total_views, unique_views }
  const [postScore, setPostScore] = useState(0);
  const [userPostVote, setUserPostVote] = useState(0); // -1, 0, or 1
  const loggedIn = !!localStorage.getItem('userName');

  useEffect(() => {
    if (!shareOpen) return;
    function handleClick(e) {
      if (shareRef.current && !shareRef.current.contains(e.target)) setShareOpen(false);
    }
    function handleKey(e) { if (e.key === 'Escape') setShareOpen(false); }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [shareOpen]);

  useEffect(() => {
    if (!postLoaded || !isAuthor) return;
    GET_PINNED_POST(postAuthor)
      .then(p => setIsPinned(p && p.id === parseInt(id)))
      .catch(() => setIsPinned(false));
    GET_POST_VIEWS(id).then(setViewCounts).catch(() => {});
  }, [postLoaded, isAuthor, postAuthor, id]);

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
    RECORD_POST_VIEW(id);
    GET_POST_VOTE(id).then(d => { setPostScore(d.score); setUserPostVote(d.userVote); }).catch(() => {});
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

  // Intercept external link clicks in post content to show a warning dialog.
  useEffect(() => {
    const root = contentRef.current;
    if (!root || !dataReady) return;
    const handler = (e) => {
      const anchor = e.target.closest('a[href]');
      if (!anchor) return;
      const url = anchor.getAttribute('href');
      if (!url) return;
      try {
        if (new URL(url).origin === window.location.origin) return;
      } catch { return; }
      e.preventDefault();
      confirm(`You are leaving this site.\n\n${url}\n\nContinue?`).then(ok => {
        if (ok) window.open(url, '_blank', 'noopener,noreferrer');
      });
    };
    root.addEventListener('click', handler);
    return () => root.removeEventListener('click', handler);
  }, [dataReady]);

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
        btn.textContent = 'copy to clipboard';
        btn.className = 'code-copy-bar-btn';
        btn.addEventListener('click', () => {
          const text = extractText(code);
          navigator.clipboard.writeText(text).then(() => {
            btn.textContent = '✓ copied';
            setTimeout(() => { btn.textContent = 'copy to clipboard'; }, 1500);
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

  // Hashtag linkification is handled by HashtagLinkerPlugin inside LexicalComposer (see below)

  const authorUsername = username || postAuthor;

  return (
    <div style={{ minHeight: '100vh' }}>
      <LexicalComposer initialConfig={initialConfig}>
        <CodeHighlightPlugin />
        <LinkPlugin />
        <ClickableLinkPlugin />
        <HistoryPlugin />
        <LoadEditorStatePlugin ready={dataReady} />
        <HashtagLinkerPlugin contentRef={contentRef} navigate={navigate} />
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

            {/* Post footer: author controls + reactions + share + discussion — all one row */}
            <div className="post-footer">
              {/* Post vote */}
              <div className="post-vote-bar">
                <button
                  className={`post-vote-btn${userPostVote === 1 ? ' post-vote-btn--up' : ''}`}
                  disabled={!loggedIn}
                  title="Upvote"
                  onClick={async () => {
                    const next = userPostVote === 1 ? 0 : 1;
                    const delta = next - userPostVote;
                    setPostScore(s => s + delta);
                    setUserPostVote(next);
                    try { const d = await VOTE_POST(id, next); setPostScore(d.score); setUserPostVote(d.userVote); }
                    catch { setPostScore(s => s - delta); setUserPostVote(userPostVote); }
                  }}
                >▲</button>
                <span className="post-vote-score">{postScore}</span>
                <button
                  className={`post-vote-btn${userPostVote === -1 ? ' post-vote-btn--down' : ''}`}
                  disabled={!loggedIn}
                  title="Downvote"
                  onClick={async () => {
                    const next = userPostVote === -1 ? 0 : -1;
                    const delta = next - userPostVote;
                    setPostScore(s => s + delta);
                    setUserPostVote(next);
                    try { const d = await VOTE_POST(id, next); setPostScore(d.score); setUserPostVote(d.userVote); }
                    catch { setPostScore(s => s - delta); setUserPostVote(userPostVote); }
                  }}
                >▼</button>
              </div>
              {isAuthor && (
                <div className="post-author-controls">
                  <Link to={`/editor/${id}`}>
                    <button className="viewer-edit-btn">Edit post</button>
                  </Link>
                </div>
              )}
              {features.reactionsEnabled && <ReactionBar postId={parseInt(id)} isOwner={isAuthor} />}
              <div className="share-menu-wrapper" ref={shareRef}>
                <button
                  className="viewer-share-btn"
                  onClick={() => setShareOpen(o => !o)}
                >
                  Share
                </button>
                {shareOpen && (
                  <div className="share-menu">
                    {[
                      { label: 'X (Twitter)', build: (u, t) => `https://x.com/intent/tweet?text=${t}&url=${u}` },
                      { label: 'Bluesky',     build: (u, t) => `https://bsky.app/intent/compose?text=${t}+${u}` },
                      { label: 'Reddit',      build: (u, t) => `https://www.reddit.com/submit?url=${u}&title=${t}` },
                      { label: 'LinkedIn',    build: (u, t) => `https://www.linkedin.com/shareArticle?mini=true&url=${u}&title=${t}` },
                      { label: 'Facebook',    build: (u)    => `https://www.facebook.com/sharer/sharer.php?u=${u}` },
                    ].map(({ label, build }) => (
                      <button
                        key={label}
                        className="share-menu-item"
                        onClick={() => {
                          const u = encodeURIComponent(window.location.href);
                          const t = encodeURIComponent(postTitle);
                          window.open(build(u, t), '_blank', 'noopener,noreferrer');
                          setShareOpen(false);
                        }}
                      >
                        {label}
                      </button>
                    ))}
                    <div className="share-menu-divider" />
                    <button
                      className="share-menu-item"
                      onClick={() => {
                        navigator.clipboard.writeText(window.location.href).then(() => {
                          setShareCopied(true);
                          setShareOpen(false);
                          setTimeout(() => setShareCopied(false), 2000);
                        }).catch(() => {});
                      }}
                    >
                      {shareCopied ? '✓ Copied!' : 'Copy link'}
                    </button>
                  </div>
                )}
              </div>
              {features.discussionEnabled && (
                <Link
                  to={`/users/${authorUsername}/${id}/discussion`}
                  style={{ fontSize: '14px', color: '#1a73e8', textDecoration: 'none', fontWeight: 500 }}
                >
                  Discussion
                </Link>
              )}
              {isAuthor && viewCounts && Number(viewCounts.total_views) > 0 && (
                <span style={{ fontSize: '13px', color: '#888', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                  👁 {Number(viewCounts.total_views).toLocaleString()} {Number(viewCounts.unique_views) > 0 ? `(${Number(viewCounts.unique_views).toLocaleString()} unique)` : ''}
                </span>
              )}
            </div>
          </div>
        </div>
      </LexicalComposer>
    </div>
  );
}
