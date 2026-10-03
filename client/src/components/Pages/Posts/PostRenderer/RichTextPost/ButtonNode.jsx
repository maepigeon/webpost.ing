import { DecoratorNode, $getNodeByKey } from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import GridButton from './TileGrid/GridButton.jsx';
import PixelText from './TileGrid/PixelText.jsx';
import * as player from '../../../../../utils/audioPlayer.js';
import { useAudioPlayer } from '../../../../AudioPlayer/useAudioPlayer.js';
import { UPLOAD_AUDIO, READ_POSTS_BY_USER } from '../../BasicTextPostServerApi.js';
import { describeUploadError } from '../../../../../utils/responsiveImage.js';
import { postPath } from '../../../../../utils/postUrl.js';
import {
  BUTTON_LABEL_MAX, BUTTON_STYLES, BUTTON_ALIGNS, isSitePath, validateTarget, normaliseButton,
} from './buttonTarget.js';
import './ButtonNode.css';

const ACTION_CHOICES = [
  { value: 'link', text: 'Open a web page' },
  { value: 'post', text: 'Open one of my posts' },
  { value: 'audio', text: 'Play audio' },
];
const cap = (s) => s[0].toUpperCase() + s.slice(1);

/** The button as readers see it. Audio buttons follow the app-wide player. */
function ButtonFace({ data, editable }) {
  const { label, action, target, style } = data;
  const shared = useAudioPlayer();
  const location = useLocation();
  const cls = `pb pb--${style}`;
  const text = label || (action === 'audio' ? 'Play' : 'Button');

  if (action === 'audio') {
    const mine = !editable && shared.src === target;
    const playing = mine && shared.playing;
    const click = () => {
      if (editable) return;   // previewing in the editor never starts the mini player
      if (mine) player.toggle(); else player.play({ src: target, title: label, postPath: location.pathname });
    };
    return (
      <button type="button" className={cls} onClick={click} aria-pressed={mine ? playing : undefined}
        aria-label={`${playing ? 'Pause' : 'Play'}: ${text}`}>
        <PixelText symbol={playing ? 'pause' : 'play'} px={1.5} />
        <span className="pb-label">{text}</span>
      </button>
    );
  }
  if (editable) {
    // A plain element while writing, so clicking selects the block instead of leaving.
    return <span className={cls} role="presentation"><span className="pb-label">{text}</span></span>;
  }
  if (isSitePath(target)) {
    return <Link to={target} className={cls}><span className="pb-label">{text}</span></Link>;
  }
  // Off-site: the viewer's click handler asks "you are leaving the site" first.
  return <a href={target} className={cls} target="_blank" rel="noopener noreferrer"><span className="pb-label">{text}</span></a>;
}

function Choices({ legend, value, options, onChange }) {
  return (
    <div className="pb-field" role="group" aria-label={legend}>
      <span className="pb-field-name">{legend}</span>
      <span className="pb-pills">
        {options.map(o => (
          <button key={o.value} type="button" className={`pb-pill${o.value === value ? ' is-on' : ''}`}
            aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.text}</button>
        ))}
      </span>
    </div>
  );
}

function ButtonEditor({ data, onChange }) {
  const [targetText, setTargetText] = useState(data.target);
  const [problem, setProblem] = useState('');
  const [posts, setPosts] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const me = localStorage.getItem('userName');

  // Own posts for the picker: the first page is enough, a path can be typed for the rest.
  useEffect(() => {
    if (data.action !== 'post' || posts || !me) return;
    READ_POSTS_BY_USER(me, 50, 0).then(list => setPosts(Array.isArray(list) ? list : [])).catch(() => setPosts([]));
  }, [data.action, posts, me]);

  // Only a valid target is saved; the last good one stays until the field is valid again.
  const setTarget = (value, patch = {}) => {
    setTargetText(value);
    const message = validateTarget(patch.action || data.action, value);
    setProblem(value.trim() && message ? message : '');
    if (!message) onChange({ ...patch, target: value.trim() });
  };
  const setAction = (action) => {
    const next = { action };
    // A target for one action is rarely right for another.
    if (validateTarget(action, targetText)) { setTargetText(''); setProblem(''); } else next.target = targetText.trim();
    onChange(next);
  };
  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const { url, name } = await UPLOAD_AUDIO(file);
      setTarget(url, data.label ? {} : { label: (name || file.name).slice(0, BUTTON_LABEL_MAX) });
    } catch (err) {
      setProblem(describeUploadError(err));
    } finally {
      setBusy(false);
    }
  };

  const stop = (e) => e.stopPropagation();   // typing here is not the editor's typing
  return (
    <div className="pb-form" onKeyDown={stop} onMouseDown={stop} onClick={stop}>
      <label className="pb-field">
        <span className="pb-field-name">Label</span>
        <input type="text" className="pb-input" value={data.label} maxLength={BUTTON_LABEL_MAX}
          onChange={(e) => onChange({ label: e.target.value })} placeholder="What the button says" />
      </label>
      <Choices legend="What it does" value={data.action} options={ACTION_CHOICES} onChange={setAction} />

      {data.action === 'link' && (
        <label className="pb-field">
          <span className="pb-field-name">Web address</span>
          <input type="url" className="pb-input" value={targetText} placeholder="https://example.com"
            onChange={(e) => setTarget(e.target.value)} />
        </label>
      )}
      {data.action === 'post' && (
        <>
          <label className="pb-field">
            <span className="pb-field-name">Your posts</span>
            <select className="pb-input" value="" onChange={(e) => e.target.value && setTarget(e.target.value)}
              disabled={!posts || posts.length === 0}>
              <option value="">{posts ? (posts.length ? 'Choose a post' : 'No posts yet') : 'Loading'}</option>
              {(posts || []).map(p => {
                const path = postPath(me, p);
                return <option key={p.id} value={path}>{(p.title || `Post #${p.id}`).replace(/<[^>]*>/g, '')}</option>;
              })}
            </select>
          </label>
          <label className="pb-field">
            <span className="pb-field-name">or a path</span>
            <input type="text" className="pb-input" value={targetText} placeholder="/name/post"
              onChange={(e) => setTarget(e.target.value)} />
          </label>
        </>
      )}
      {data.action === 'audio' && (
        <div className="pb-field">
          <span className="pb-field-name">Audio file</span>
          <input ref={fileRef} type="file" accept=".mp3,audio/mpeg" onChange={upload}
            style={{ display: 'none' }} tabIndex={-1} aria-hidden="true" />
          <span className="pb-pills">
            <GridButton label="Upload audio" disabled={busy} onClick={() => fileRef.current?.click()} />
            <span className="pb-file">{targetText ? targetText.split('/').pop() : 'None yet'}</span>
          </span>
        </div>
      )}
      {problem && <div className="pb-problem" role="alert">{problem}</div>}

      <Choices legend="Look" value={data.style} onChange={(style) => onChange({ style })}
        options={BUTTON_STYLES.map(v => ({ value: v, text: cap(v) }))} />
      <Choices legend="Place" value={data.align} onChange={(align) => onChange({ align })}
        options={BUTTON_ALIGNS.map(v => ({ value: v, text: cap(v) }))} />
    </div>
  );
}

function ButtonComponent({ data, nodeKey, editable = true }) {
  const [editor] = useLexicalComposerContext();
  const [selected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey);
  // A button with no target yet is brand new: open its form straight away.
  const open = editable && (selected || Boolean(validateTarget(data.action, data.target)));

  const withNode = useCallback((fn) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (node) fn(node);
    });
  }, [editor, nodeKey]);
  const change = (patch) => withNode(node => node.setData(patch));
  const move = (direction) => withNode((node) => {
    const other = direction === 'up' ? node.getPreviousSibling() : node.getNextSibling();
    if (!other) return;
    node.remove();
    if (direction === 'up') other.insertBefore(node); else other.insertAfter(node);
  });
  const remove = () => withNode(node => node.remove());
  const select = (e) => {
    if (!editable) return;
    e.stopPropagation();
    clearSelection();
    setSelected(true);
  };

  return (
    <div className={`pb-wrap pb-align--${data.align}${open ? ' is-editing' : ''}${selected ? ' is-selected' : ''}`}
      onClick={select}>
      <ButtonFace data={data} editable={editable} />
      {open && (
        <>
          <ButtonEditor data={data} onChange={change} />
          <div className="pb-row" onClick={(e) => e.stopPropagation()}>
            <GridButton label="Move up" text="Up" onClick={() => move('up')} />
            <GridButton label="Move down" text="Down" onClick={() => move('down')} />
            <GridButton label="Delete button" text="Delete" onClick={remove} />
          </div>
        </>
      )}
    </div>
  );
}

export class ButtonNode extends DecoratorNode {
  __data;

  static getType() { return 'button'; }

  static clone(node) {
    return new ButtonNode(node.__data, node.__key);
  }

  constructor(data, key) {
    super(key);
    this.__data = normaliseButton(data);
  }

  static importJSON(json) {
    return new ButtonNode(json);
  }

  exportJSON() {
    return { type: 'button', version: 1, ...this.__data };
  }

  getData() { return this.getLatest().__data; }

  setData(patch) {
    const self = this.getWritable();
    self.__data = normaliseButton({ ...self.__data, ...patch });
    return self;
  }

  createDOM() {
    const el = document.createElement('div');
    el.className = 'pb-block';
    el.dataset.align = this.__data.align;
    return el;
  }

  updateDOM(prev, dom) {
    // Alignment lives on the outer element, so the row rules can see it.
    if (prev.__data.align !== this.__data.align) dom.dataset.align = this.__data.align;
    return false;
  }

  isInline() { return false; }

  decorate(editor) {
    return <ButtonComponent data={this.__data} nodeKey={this.__key} editable={editor.isEditable()} />;
  }
}

export function $createButtonNode(data = {}) {
  return new ButtonNode(data);
}

export function $isButtonNode(node) {
  return node instanceof ButtonNode;
}
