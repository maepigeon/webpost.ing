import { useEffect, useRef, useState } from 'react';
import GridButton from '../../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/GridButton.jsx';
import { GridStepper } from '../../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/GridUI.jsx';
import { frameSignature, renderFrameTo } from '../engine/compositor.js';
import { LIMITS } from '../engine/project.js';

const THUMB_H = 52;

function Thumb({ project, index, current, onPick, onDragStart, onDrop, dragging, over, setOver }) {
  const ref = useRef(null);
  const frame = project.frames[index];
  const sig = frameSignature(project, frame);
  const w = Math.max(28, Math.min(104, Math.round(THUMB_H * project.width / project.height)));
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    renderFrameTo(c, project, index, { background: '#f2f2f2' });
    // The signature stands for everything the picture depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, index, w]);
  useEffect(() => {
    if (current && ref.current && ref.current.scrollIntoView) ref.current.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [current]);
  return (
    <li className={`an-thumb${current ? ' is-current' : ''}${over === frame.id ? ' is-over' : ''}`} draggable
      onDragStart={(e) => { onDragStart(frame.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', frame.id); }}
      onDragOver={(e) => { if (dragging) { e.preventDefault(); setOver(frame.id); } }}
      onDrop={(e) => { e.preventDefault(); onDrop(index); }}
      onDragEnd={() => onDrop(null)}>
      <button type="button" onClick={onPick} aria-label={`Frame ${index + 1}${frame.hold > 1 ? `, held ${frame.hold}` : ''}`} aria-current={current}
        data-tip={`Frame ${index + 1}. Drag to move it.`}>
        <canvas ref={ref} width={w} height={THUMB_H} />
        <span className="an-thumb-n">{index + 1}{frame.hold > 1 ? ` x${frame.hold}` : ''}</span>
      </button>
    </li>
  );
}

/** The bottom bar: transport and settings, then the filmstrip. */
export default function Timeline({ session, state, playing, loop, onion, onTogglePlay, onLoop, onOnion }) {
  const { project, frameIndex } = state;
  const frame = project.frames[frameIndex];
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState(null);

  const drop = (toIndex) => {
    if (toIndex !== null && dragging) {
      const from = project.frames.findIndex(f => f.id === dragging);
      if (from >= 0 && from !== toIndex) session.moveFrame(from, toIndex);
    }
    setDragging(null); setOver(null);
  };

  return (
    <div className="an-timeline">
      <div className="an-transport">
        <GridButton text="<" label="Previous frame (,)" onClick={() => session.stepFrame(-1)} disabled={frameIndex === 0 || playing} />
        <GridButton symbol={playing ? 'pause' : 'play'} label={playing ? 'Pause (Space)' : 'Play (Space)'} on={playing} onClick={onTogglePlay} />
        <GridButton text=">" label="Next frame (.)" onClick={() => session.stepFrame(1)} disabled={frameIndex >= project.frames.length - 1 || playing} />
        <GridButton text="Loop" label="Loop playback" on={loop} onClick={() => onLoop(!loop)} />
        <GridStepper label="Frames per second" short="FPS" value={project.fps} min={LIMITS.minFps} max={LIMITS.maxFps} onChange={v => session.setFps(v)} />
        <GridStepper label="Onion skin: frames shown before and after" short="Onion" value={onion} min={0} max={3} onChange={onOnion} />
        <GridStepper label="Hold: how many frame-times this frame stays" short="Hold" value={frame.hold} min={1} max={LIMITS.maxHold} onChange={v => session.setHold(v)} />
        <span className="an-sep" aria-hidden="true" />
        <GridButton symbol="plus" label="New frame after this one (N)" onClick={() => session.addFrame()} disabled={playing || project.frames.length >= LIMITS.maxFrames} />
        <GridButton text="Copy" label="Duplicate this frame" onClick={() => session.duplicateFrame()} disabled={playing} />
        <GridButton text="<<" label="Move this frame earlier" onClick={() => session.moveFrame(frameIndex, frameIndex - 1)} disabled={frameIndex === 0 || playing} />
        <GridButton text=">>" label="Move this frame later" onClick={() => session.moveFrame(frameIndex, frameIndex + 1)} disabled={frameIndex >= project.frames.length - 1 || playing} />
        <GridButton symbol="cross" label={project.frames.length > 1 ? 'Delete this frame' : 'Clear this frame'} onClick={() => session.deleteFrame()} disabled={playing} />
        <span className="an-count" aria-live="polite">{frameIndex + 1} / {project.frames.length}</span>
      </div>
      <ul className="an-filmstrip" aria-label="Frames">
        {project.frames.map((f, i) => (
          <Thumb key={f.id} project={project} index={i} current={i === frameIndex} dragging={dragging} over={over} setOver={setOver}
            onPick={() => session.setFrame(i)} onDragStart={setDragging} onDrop={drop} />
        ))}
      </ul>
    </div>
  );
}
