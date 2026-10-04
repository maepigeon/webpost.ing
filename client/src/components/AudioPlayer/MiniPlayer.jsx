import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAudioPlayer } from './useAudioPlayer.js';
import { toggle, stop, seek, setVolume, formatClock } from '../../utils/audioPlayer.js';
import GridButton from '../Pages/Posts/PostRenderer/RichTextPost/TileGrid/GridButton.jsx';
import PixelText from '../Pages/Posts/PostRenderer/RichTextPost/TileGrid/PixelText.jsx';
// The in-post player's panel and range styles, and the tile buttons' base look,
// so the two players are one design.
import '../Pages/Posts/PostRenderer/RichTextPost/TileGrid/TileGrid.css';
import '../Pages/Posts/PostRenderer/RichTextPost/AudioNode.css';
import './MiniPlayer.css';

/**
 * Small bar that outlives page changes while a post's audio is loaded. Hidden
 * when nothing is. Close stops the sound as well as hiding the bar. It looks
 * like the audio block in a post: a dark panel of pixel buttons and ranges.
 */
export default function MiniPlayer() {
  const s = useAudioPlayer();
  const [volumeOpen, setVolumeOpen] = useState(false);
  if (!s.src) return null;

  const title = s.title || 'Audio';
  const silent = s.volume === 0;
  return (
    <div className="mini-player" role="region" aria-label="Audio player">
      <GridButton symbol={s.playing ? 'pause' : 'play'} label={s.playing ? 'Pause' : 'Play'} onClick={toggle} />
      <div className="mp-main">
        <div className="mp-title">
          {s.postPath
            ? <Link to={s.postPath} title={`Go to the post: ${title}`}>{title}</Link>
            : <span>{title}</span>}
        </div>
        <div className="mp-progress">
          <input type="range" className="audio-range audio-seek" min={0} max={s.duration || 0} step={0.1}
            value={Math.min(s.currentTime, s.duration || 0)} onChange={(e) => seek(Number(e.target.value))}
            disabled={!s.duration} aria-label="Seek"
            aria-valuetext={`${formatClock(s.currentTime)} of ${formatClock(s.duration)}`} />
          <span className="audio-time" aria-hidden="true">
            <PixelText text={`${formatClock(s.currentTime)}/${formatClock(s.duration)}`} px={1.25} />
          </span>
        </div>
      </div>
      <div className={`mp-volume${volumeOpen ? ' open' : ''}`}>
        <GridButton className="mp-volume-toggle" symbol={silent ? 'mute' : 'volume'} label="Volume"
          aria-expanded={volumeOpen} onClick={() => setVolumeOpen(o => !o)} />
        <input type="range" className="audio-range audio-volume mp-volume-range" min={0} max={1} step={0.05} value={s.volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          aria-label="Volume" aria-valuetext={`${Math.round(s.volume * 100)} percent`} />
      </div>
      <GridButton symbol="cross" label="Close player" title="Close" onClick={stop} />
    </div>
  );
}
