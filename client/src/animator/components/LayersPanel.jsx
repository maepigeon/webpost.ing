import { useState } from 'react';
import GridButton from '../../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/GridButton.jsx';
import { GridStepper } from '../../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/GridUI.jsx';
import Tile from './Tile.jsx';
import { LIMITS } from '../engine/project.js';

/** The right column: layers, top of the stack first. */
export default function LayersPanel({ session, state }) {
  const { project, layerId } = state;
  const [editing, setEditing] = useState(null);   // layer id being renamed
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState(null);
  const rows = [...project.layers].reverse();
  const current = project.layers.find(l => l.id === layerId);
  const at = project.layers.findIndex(l => l.id === layerId);

  const commitName = (id, value) => { session.renameLayer(id, value); setEditing(null); };

  return (
    <div className="an-panel-body">
      <ul className="an-layers" aria-label="Layers">
        {rows.map((l) => {
          const index = project.layers.indexOf(l);
          return (
            <li key={l.id}
              className={`an-layer${l.id === layerId ? ' is-current' : ''}${over === l.id ? ' is-over' : ''}${l.visible ? '' : ' is-hidden'}`}
              draggable={editing !== l.id}
              onDragStart={(e) => { setDragging(l.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', l.id); }}
              onDragOver={(e) => { if (dragging) { e.preventDefault(); setOver(l.id); } }}
              onDragLeave={() => setOver(o => (o === l.id ? null : o))}
              onDrop={(e) => { e.preventDefault(); if (dragging && dragging !== l.id) session.moveLayer(dragging, index); setDragging(null); setOver(null); }}
              onDragEnd={() => { setDragging(null); setOver(null); }}>
              <Tile icon={l.visible ? 'eye' : 'eyeOff'} label={l.visible ? `Hide ${l.name}` : `Show ${l.name}`} onClick={() => session.setLayerVisible(l.id, !l.visible)} />
              {editing === l.id ? (
                <input className="an-input an-layer-name" autoFocus defaultValue={l.name} maxLength={LIMITS.maxName} aria-label="Layer name"
                  onFocus={e => e.target.select()} onBlur={e => commitName(l.id, e.target.value)}
                  onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') commitName(l.id, e.target.value); if (e.key === 'Escape') setEditing(null); }} />
              ) : (
                <button type="button" className="an-layer-pick" onClick={() => session.setLayer(l.id)} onDoubleClick={() => setEditing(l.id)}
                  aria-current={l.id === layerId} data-tip="Select this layer (double-click to rename)">
                  {l.name}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="an-row">
        <GridButton symbol="plus" label="Add a layer above this one" onClick={() => session.addLayer()} disabled={project.layers.length >= LIMITS.maxLayers} />
        <GridButton symbol="pencil" label="Rename this layer" onClick={() => setEditing(layerId)} />
        <Tile icon="arrowUp" label="Move this layer up" disabled={at >= project.layers.length - 1} onClick={() => session.moveLayer(layerId, at + 1)} />
        <Tile icon="arrowDown" label="Move this layer down" disabled={at <= 0} onClick={() => session.moveLayer(layerId, at - 1)} />
        <GridButton symbol="cross" label={project.layers.length > 1 ? 'Delete this layer' : 'Clear this layer'} onClick={() => session.deleteLayer(layerId)} />
      </div>
      {current && (
        <div className="an-steppers" onPointerUp={() => session.endGesture()} onBlur={() => session.endGesture()}>
          <GridStepper label="Layer opacity percent" short="Opac" value={Math.round(current.opacity * 100)} min={0} max={100}
            onChange={v => session.setLayerOpacity(current.id, v / 100)} />
        </div>
      )}
      <p className="an-hint an-hint-block">Drag a layer to reorder it. Deleting the last layer clears it.</p>
    </div>
  );
}
