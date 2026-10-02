import { useEffect, useState, useRef } from 'react';
import './Editor.css';
import './Viewer.css';
import { useBodyWallpaper } from '../../../../TileArt/wallpaper.js';
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
import { usePageTitle } from '../../../../../utils/usePageTitle.js';
import { useDialog } from '../../../../Dialog/Dialog.jsx';
import {
  READ_POST, GET_USER_FROM_POST,
  GET_POST_FEATURES,
  RECORD_POST_VIEW, GET_POST_VIEWS, GET_POST_VOTE, VOTE_POST,
} from '../../BasicTextPostServerApi.js';
import { ImageNode } from './ImageNode.jsx';
import { AudioNode } from './AudioNode.jsx';
import { MathNode } from './MathNode.jsx';
import { TileGridNode } from './TileGrid/TileGridNode.jsx';
import { LinkNode } from '@lexical/link';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { ClickableLinkPlugin } from '@lexical/react/LexicalClickableLinkPlugin';
import { postPath } from '../../../../../utils/postUrl.js';
import { useResolvedPostId } from '../../../../../utils/useResolvedPostId.js';
import ReportDialog from '../../../../Social/ReportDialog.jsx';
import SharePostDialog from '../../../../Social/SharePostDialog.jsx';
import { usePostTheme } from '../../../../PageTheme/PageTheme.jsx';
import Icon from '../../../../Icon/Icon.jsx';
import PostStickies from '../../PostsViewer/PostStickies.jsx';

const VIEWER_NODES = [HeadingNode, ListNode, ListItemNode, CustomCodeNode, CodeHighlightNode, ImageNode, AudioNode, MathNode, TileGridNode, LinkNode];

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

/**
 * For a post that doesn't exist, has moved, or is someone else's draft: the
 * server answers all three the same way, so a draft's existence isn't given
 * away here either.
 */
function PostNotFound({ username }) {
  return (
    <div className="editor-centered" style={{ minHeight: '60vh' }}>
      <div className="editor-post-card viewer-post-card viewer-not-found">
        <h1>Post not found</h1>
        <p>It may have been deleted or moved, or it isn&rsquo;t public.</p>
        <p>{username ? <Link to={`/${username}`}>Back to {username}&rsquo;s profile</Link> : <Link to="/">Home</Link>}</p>
      </div>
    </div>
  );
}

function RichTextViewerBody({ id }) {
  // The route segment is "{id}-{slug}"; the slug is cosmetic and a stale or
  // hand-edited one still resolves to the right post.
  const { id: idParam, username } = useParams();

  const navigate = useNavigate();
  const { linkWarning } = useDialog();

  const [postTitle, setPostTitle] = useState('');
  usePageTitle(postTitle || null);
  const [postDate, setPostDate] = useState('');
  const [postPublished, setPostPublished] = useState(false);
  const [postAuthor, setPostAuthor] = useState('');
  usePostTheme(id);
  const [backgroundPattern, setBackgroundPattern] = useState('');
  const [dataReady, setDataReady] = useState(false);
  const [postLoaded, setPostLoaded] = useState(false);
  // The post doesn't exist, or is someone else's draft (the server answers
  // 404 for both, so a draft's existence isn't given away).
  const [notFound, setNotFound] = useState(false);
  const [features, setFeatures] = useState({ reactionsEnabled: false, discussionEnabled: false, votesEnabled: false });
  // The author's chosen URL slug, if they set one.
  const [postSlug, setPostSlug] = useState(null);
  // Rewrite the address bar to the canonical slugged URL once the title is
  // known. replace, not push, so Back still goes where the reader came from,
  // and only when it actually differs so this cannot loop.
  useEffect(() => {
    if (!postTitle || !id || !username) return;
    const canonical = postPath(username, { id, title: postTitle, slug: postSlug });
    if (window.location.pathname !== canonical) {
      window.history.replaceState(null, '', canonical + window.location.search + window.location.hash);
    }
  }, [postTitle, postSlug, id, username]);

  const me = localStorage.getItem('userName');
  const isAuthor = me && me === postAuthor;
  const [showReport, setShowReport] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const shareRef = useRef(null);
  const [showDmShare, setShowDmShare] = useState(false);
  const [dmSentTo, setDmSentTo] = useState('');
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
    GET_POST_VIEWS(id).then(setViewCounts).catch(() => {});
  }, [postLoaded, isAuthor, postAuthor, id]);

  useEffect(() => {
    READ_POST(id).then(data => {
      setPostTitle(data.title);
      setPostSlug(data.slug || null);
      setPostDate(data.date);
      setPostPublished(data.published);
      setBackgroundPattern(data.backgroundPattern || '');
      localStorage.setItem('currentPostData', data.description);
      setDataReady(true);
      GET_USER_FROM_POST(id).then(author => {
        setPostAuthor(author);
        setPostLoaded(true);
      }).catch(() => setPostLoaded(true));
    }).catch(() => setNotFound(true));
    GET_POST_FEATURES(id)
      .then(d => setFeatures({ reactionsEnabled: d.reactionsEnabled, discussionEnabled: d.discussionEnabled, votesEnabled: !!d.votesEnabled }))
      .catch(() => {});
    RECORD_POST_VIEW(id);
    GET_POST_VOTE(id).then(d => { setPostScore(d.score); setUserPostVote(d.userVote); }).catch(() => {});
  }, [id]);

  // Redirect non-owners away from unpublished posts
  useEffect(() => {
    if (!postLoaded) return;
    if (!postPublished && me !== postAuthor) navigate('/');
  }, [postLoaded, postPublished, me, postAuthor, navigate]);

  // The author's wallpaper, behind the whole page.
  useBodyWallpaper(backgroundPattern);

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
      linkWarning(url).then(ok => {
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

  // Used to render an empty card reading "Draft — only you can see it", with
  // Report and Share buttons, and leave an unhandled error in the console.
  if (notFound) return <PostNotFound username={username} />;

  return (
    <div className="th-scope" style={{ minHeight: '100vh' }}>
      <LexicalComposer initialConfig={initialConfig}>
        <CodeHighlightPlugin />
        <LinkPlugin />
        <ClickableLinkPlugin />
        <HistoryPlugin />
        <LoadEditorStatePlugin ready={dataReady} />
        <HashtagLinkerPlugin contentRef={contentRef} navigate={navigate} />
        <div className="editor-centered">
          <div className="editor-post-card viewer-post-card">
            <PostStickies username={postAuthor} postId={id} />
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
              {/* Vote controls only for signed-in readers. They were rendered
                  disabled for everyone else, which offers an action that can
                  never be taken; the score itself is still shown. The author
                  can turn voting off, which hides the score as well. */}
              {!features.votesEnabled ? null : loggedIn ? (
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
                  aria-label="Upvote"
                ><Icon name="voteUp" size={14} /></button>
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
                  aria-label="Downvote"
                ><Icon name="voteDown" size={14} /></button>
              </div>
              ) : (
                <div className="post-vote-bar post-vote-bar--readonly" title="Sign in to vote">
                  <span className="post-vote-score">{postScore}</span>
                  <span className="post-vote-caption">{Math.abs(postScore) === 1 ? 'point' : 'points'}</span>
                </div>
              )}
              {isAuthor && (
                <div className="post-author-controls">
                  <button type="button" className="viewer-edit-btn" onClick={() => navigate(`/editor/${id}`)}>Edit post</button>
                </div>
              )}
              {features.reactionsEnabled && <ReactionBar postId={parseInt(id)} isOwner={isAuthor} />}
              {/* Reporting your own post would be noise, and signing in is
                  required, so the trigger only appears when it can be used. */}
              {me && !isAuthor && (
                <button type="button" className="report-trigger"
                        onClick={() => setShowReport(true)}
                        title="Report this post to the moderators">
                  Report
                </button>
              )}
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
                    {loggedIn && (
                      <>
                        <div className="share-menu-divider" />
                        <button
                          className="share-menu-item"
                          onClick={() => { setShowDmShare(true); setShareOpen(false); }}
                        >
                          Send in a message
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
              {dmSentTo && <span role="status" style={{ fontSize: '13px', color: '#555' }}>Sent to {dmSentTo}</span>}
              {features.discussionEnabled && (
                <Link
                  to={`/${authorUsername}/${idParam}/discussion`}
                  style={{ fontSize: '14px', color: '#333333', textDecoration: 'none', fontWeight: 500 }}
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

      {showDmShare && (
        <SharePostDialog post={{ id: parseInt(id), title: postTitle }}
          onSent={who => { setDmSentTo(who); setTimeout(() => setDmSentTo(''), 3000); }}
          onClose={() => setShowDmShare(false)} />
      )}
      {showReport && (
        <ReportDialog postId={parseInt(id)} postTitle={postTitle} onClose={() => setShowReport(false)} />
      )}
    </div>
  );
}

/**
 * Profile links name a post by its slug, so the id may have to be looked up
 * before anything can load. Keyed on the id so moving between posts starts
 * from a clean slate.
 */
export default function RichTextViewer() {
  const { id: segment, username } = useParams();
  const { id, missing } = useResolvedPostId(username, segment);
  if (missing) return <PostNotFound username={username} />;
  if (id == null) return null;
  return <RichTextViewerBody key={id} id={id} />;
}
