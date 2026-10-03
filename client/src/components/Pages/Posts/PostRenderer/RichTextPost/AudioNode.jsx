import { DecoratorNode, $getNodeByKey } from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { IMAGES_BASE_URL } from '../../../../../config.js';
import GridButton from './TileGrid/GridButton.jsx';
import PixelText from './TileGrid/PixelText.jsx';
import * as player from '../../../../../utils/audioPlayer.js';
import { useAudioPlayer } from '../../../../AudioPlayer/useAudioPlayer.js';
import './AudioNode.css';

/** 83 seconds reads "1:23"; anything unknown or not finite reads "0:00". */
export function formatTime(seconds) {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function AudioComponent({ src, title, nodeKey, editable = true }) {
  const [editor] = useLexicalComposerContext();
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [failed, setFailed] = useState(false);
  // Readers play through the app-wide player so the sound outlives the page;
  // the editor keeps its own element so previewing never starts the mini player.
  const shared = useAudioPlayer();
  const location = useLocation();
  const mine = !editable && shared.src === src;
  const lastLevel = useRef(1);

  // The <audio> element is the source of truth; this mirrors it into state so
  // the grid-drawn controls always show what the browser is actually doing.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return undefined;
    const sync = () => {
      setTime(a.currentTime);
      setDuration(Number.isFinite(a.duration) ? a.duration : 0);
      setPlaying(!a.paused && !a.ended);
      setVolume(a.volume);
      setMuted(a.muted);
    };
    const events = ['timeupdate', 'loadedmetadata', 'durationchange', 'play', 'pause', 'ended', 'volumechange'];
    events.forEach(ev => a.addEventListener(ev, sync));
    sync();
    return () => events.forEach(ev => a.removeEventListener(ev, sync));
  }, [src]);

  const toggle = () => {
    if (!editable) {
      if (mine) player.toggle(); else player.play({ src, title, postPath: location.pathname });
      return;
    }
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => setFailed(true)); else a.pause();
  };
  const restart = () => {
    if (!editable) { if (mine) player.seek(0); return; }
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = 0;
    setTime(0);
  };
  const seek = (e) => {
    const a = audioRef.current;
    const t = Number(e.target.value);
    if (!editable) { if (mine) player.seek(t); return; }
    if (a) a.currentTime = t;
    setTime(t);
  };
  const setLevel = (e) => {
    const a = audioRef.current;
    const v = Number(e.target.value);
    if (!editable) { player.setVolume(v); return; }
    if (!a) return;
    a.volume = v;
    // Dragging up from silence should be heard, so it un-mutes.
    a.muted = v === 0;
  };
  const toggleMute = () => {
    if (!editable) {
      if (shared.volume > 0) { lastLevel.current = shared.volume; player.setVolume(0); }
      else player.setVolume(lastLevel.current || 1);
      return;
    }
    const a = audioRef.current;
    if (a) a.muted = !a.muted;
  };

  const withNode = useCallback((fn) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (node) fn(node);
    });
  }, [editor, nodeKey]);
  const move = (direction) => withNode((node) => {
    const other = direction === 'up' ? node.getPreviousSibling() : node.getNextSibling();
    if (!other) return;
    node.remove();
    if (direction === 'up') other.insertBefore(node); else other.insertAfter(node);
  });
  const remove = () => withNode((node) => node.remove());

  // What the controls show: the shared player's state for a reader's block
  // that owns the current track, idle otherwise.
  const view = editable
    ? { playing, time, duration, volume, muted }
    : { playing: mine && shared.playing, time: mine ? shared.currentTime : 0, duration: mine ? shared.duration : 0, volume: shared.volume, muted: false };
  const silent = view.muted || view.volume === 0;
  const label = title || 'Audio';

  return (
    <div className="audio-block" role="group" aria-label={`Audio: ${label}`}
      // Space, Enter and the arrows belong to the player's controls here, not
      // to the editor's own key handling.
      onKeyDown={(e) => e.stopPropagation()}>
      {editable && (
        <audio ref={audioRef} src={IMAGES_BASE_URL + src} preload="metadata"
          onError={() => setFailed(true)} onLoadedData={() => setFailed(false)} />
      )}
      <div className="audio-title">
        <PixelText symbol="audio" px={1.25} />
        <span className="audio-title-text">{label}</span>
      </div>
      <div className="audio-row">
        <GridButton symbol={view.playing ? 'pause' : 'play'} label={view.playing ? 'Pause' : 'Play'} onClick={toggle} />
        <GridButton symbol="restart" label="Restart" title="Back to the start" onClick={restart} />
        <input type="range" className="audio-range audio-seek" min={0} max={view.duration || 0} step={0.1}
          value={Math.min(view.time, view.duration || 0)} onChange={seek} disabled={!view.duration}
          aria-label="Seek" aria-valuetext={`${formatTime(view.time)} of ${formatTime(view.duration)}`} />
        <span className="audio-time" aria-hidden="true">
          <PixelText text={`${formatTime(view.time)}/${formatTime(view.duration)}`} px={1.25} />
        </span>
        <GridButton symbol={silent ? 'mute' : 'volume'} label={silent ? 'Unmute' : 'Mute'} onClick={toggleMute} />
        <input type="range" className="audio-range audio-volume" min={0} max={1} step={0.05}
          value={view.muted ? 0 : view.volume} onChange={setLevel}
          aria-label="Volume" aria-valuetext={`${Math.round((view.muted ? 0 : view.volume) * 100)} percent`} />
      </div>
      {failed && <div className="audio-error" role="alert">This audio could not be played.</div>}
      {editable && (
        <div className="audio-row audio-edit">
          <GridButton label="Move up" text="Up" onClick={() => move('up')} />
          <GridButton label="Move down" text="Down" onClick={() => move('down')} />
          <GridButton label="Delete audio" text="Delete" onClick={remove} />
        </div>
      )}
    </div>
  );
}

export class AudioNode extends DecoratorNode {
  __src;
  __title;

  static getType() { return 'audio'; }

  static clone(node) {
    return new AudioNode(node.__src, node.__title, node.__key);
  }

  constructor(src, title = '', key) {
    super(key);
    this.__src = src;
    this.__title = title;
  }

  static importJSON(serializedNode) {
    return new AudioNode(serializedNode.src, serializedNode.title ?? '');
  }

  exportJSON() {
    return { type: 'audio', version: 1, src: this.__src, title: this.__title };
  }

  createDOM() {
    return document.createElement('div');
  }

  updateDOM() { return false; }
  isInline() { return false; }

  decorate(editor) {
    return (
      <AudioComponent
        src={this.__src}
        title={this.__title}
        nodeKey={this.__key}
        editable={editor.isEditable()}
      />
    );
  }
}

export function $createAudioNode(src, title = '') {
  return new AudioNode(src, title);
}

export function $isAudioNode(node) {
  return node instanceof AudioNode;
}
