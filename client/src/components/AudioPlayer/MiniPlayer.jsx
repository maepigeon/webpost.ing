import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAudioPlayer } from './useAudioPlayer.js';
import { toggle, stop, seek, setVolume, formatClock } from '../../utils/audioPlayer.js';
import './MiniPlayer.css';

/**
 * Small bar that outlives page changes while a post's audio is loaded. Hidden
 * when nothing is. Close stops the sound as well as hiding the bar.
 */
export default function MiniPlayer() {
  const s = useAudioPlayer();
  const trackRef = useRef(null);
  const [volumeOpen, setVolumeOpen] = useState(false);
  if (!s.src) return null;

  const fraction = s.duration ? Math.min(1, s.currentTime / s.duration) : 0;
  const seekFromPointer = (e) => {
    const r = trackRef.current.getBoundingClientRect();
    if (!s.duration || !r.width) return;
    seek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * s.duration);
  };
  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    seekFromPointer(e);
  };
  const onPointerMove = (e) => {
    if (e.buttons) seekFromPointer(e);
  };
  const onKeyDown = (e) => {
    const step = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5 }[e.key];
    if (step !== undefined) { e.preventDefault(); seek(s.currentTime + step); }
    else if (e.key === 'Home') { e.preventDefault(); seek(0); }
    else if (e.key === 'End') { e.preventDefault(); seek(s.duration); }
  };

  const title = s.title || 'Audio';
  return (
    <div className="mini-player" role="region" aria-label="Audio player">
      <button type="button" className="mp-btn" onClick={toggle} aria-label={s.playing ? 'Pause' : 'Play'}>
        <span className={s.playing ? 'mp-icon-pause' : 'mp-icon-play'} aria-hidden="true" />
      </button>
      <div className="mp-main">
        <div className="mp-title">
          {s.postPath
            ? <Link to={s.postPath} title={`Go to the post: ${title}`}>{title}</Link>
            : <span>{title}</span>}
        </div>
        <div className="mp-progress">
          <div ref={trackRef} className="mp-seek" role="slider" tabIndex={0} aria-label="Seek"
            aria-valuemin={0} aria-valuemax={Math.round(s.duration)} aria-valuenow={Math.round(s.currentTime)}
            aria-valuetext={`${formatClock(s.currentTime)} of ${formatClock(s.duration)}`}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onKeyDown={onKeyDown}>
            <div className="mp-seek-fill" style={{ width: `${fraction * 100}%` }} />
          </div>
          <span className="mp-time">{formatClock(s.currentTime)} / {formatClock(s.duration)}</span>
        </div>
      </div>
      <div className={`mp-volume${volumeOpen ? ' open' : ''}`}>
        <button type="button" className="mp-btn mp-volume-toggle" aria-label="Volume"
          aria-expanded={volumeOpen} onClick={() => setVolumeOpen(o => !o)}>
          <span className={s.volume === 0 ? 'mp-icon-mute' : 'mp-icon-vol'} aria-hidden="true" />
        </button>
        <input type="range" className="mp-volume-range" min={0} max={1} step={0.05} value={s.volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          aria-label="Volume" aria-valuetext={`${Math.round(s.volume * 100)} percent`} />
      </div>
      <button type="button" className="mp-btn mp-close" onClick={stop} aria-label="Close player" title="Close">
        <span className="mp-icon-x" aria-hidden="true" />
      </button>
    </div>
  );
}
