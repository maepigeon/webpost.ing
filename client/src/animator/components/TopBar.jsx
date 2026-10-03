import GridButton from '../../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/GridButton.jsx';
import { LIMITS } from '../engine/project.js';

function statusText(status) {
  if (!status) return '';
  if (status.state === 'saved') return `Saved ${new Date(status.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  if (status.state === 'saving') return 'Saving...';
  if (status.state === 'dirty') return 'Unsaved changes';
  if (status.state === 'error') return `Not saved: ${status.error}`;
  return status.text || '';
}

export default function TopBar({ state, status, onExit, onDialog, onUndo, onRedo, onName, toolsOpen, layersOpen, onToggleTools, onToggleLayers }) {
  const { project, canUndo, canRedo } = state;
  return (
    <header className="an-top">
      <GridButton text="Exit" label="Leave the animator (your work is saved on this device)" onClick={onExit} />
      <GridButton text="Tools" label="Show or hide the tools" className="an-only-narrow" on={toolsOpen} onClick={onToggleTools} />
      <GridButton text="Layers" label="Show or hide the layers" className="an-only-narrow" on={layersOpen} onClick={onToggleLayers} />
      <input className="an-input an-name" value={project.name} maxLength={LIMITS.maxName} aria-label="Project name" placeholder="Untitled"
        onChange={e => onName(e.target.value)} onKeyDown={e => e.stopPropagation()} />
      <span className="an-size" data-tip="Canvas size in pixels">{project.width} x {project.height}</span>
      <span className="an-sep" aria-hidden="true" />
      <GridButton text="New" label="Start a new animation" onClick={() => onDialog('new')} />
      <GridButton text="Open" label="Open a saved animation" onClick={() => onDialog('open')} />
      <GridButton text="Size" label="Change the canvas size" onClick={() => onDialog('resize')} />
      <GridButton symbol="undo" label="Undo (Ctrl+Z)" onClick={onUndo} disabled={!canUndo} />
      <GridButton symbol="redo" label="Redo (Shift+Ctrl+Z)" onClick={onRedo} disabled={!canRedo} />
      <GridButton text="Export" label="Save a video or picture to your device" onClick={() => onDialog('export')} />
      <span className={`an-status${status && status.state === 'error' ? ' is-error' : ''}`} role="status">{statusText(status)}</span>
    </header>
  );
}
