import { useMemo, useState } from 'react';
import TileGrid from '../Pages/Posts/PostRenderer/RichTextPost/TileGrid/TileGrid.jsx';
import { TEXTURES, texturePreview } from '../Pages/Posts/PostRenderer/RichTextPost/TileGrid/textures.js';
import { normaliseGrid, pixelLayer } from '../Pages/Posts/PostRenderer/RichTextPost/TileGrid/tileGrid.js';
import { TILINGS, MAX_TILE_TILES, sanitiseWallpaper, textureWallpaper, useWallpaperStyle } from './wallpaper.js';
import './WallpaperEditor.css';

const blankWallpaper = (keep) => ({
  v: 3,
  tile: normaliseGrid({ cols: 2, rows: 2, layers: [pixelLayer('Tile')] }),
  tiling: keep?.tiling || 'repeat',
  scale: keep?.scale || 2,
  bg: keep?.bg || '#eeede9',
});

/** A box showing a wallpaper tiled, the way it will look behind a page. */
export function WallpaperSwatch({ value, className = '', children }) {
  const style = useWallpaperStyle(value);
  return <div className={`wp-swatch ${className}`} style={value ? style : undefined}>{children}</div>;
}

/**
 * Pick, draw and tile a wallpaper. The tile is a small grid made in the same
 * designer as post grids; a texture is only a starting point.
 *
 * @param {object|string|null} props.value   the wallpaper, or null for none
 * @param {Function}           props.onChange called with the new wallpaper, or null
 * @param {boolean}            [props.allowNone=true]
 */
export default function WallpaperEditor({ value, onChange, allowNone = true }) {
  const w = sanitiseWallpaper(value);
  const [drawing, setDrawing] = useState(false);
  const previews = useMemo(() => Object.fromEntries(Object.keys(TEXTURES).map(k => [k, texturePreview(k, 28)])), []);

  const set = (patch) => onChange({ ...(w || blankWallpaper()), ...patch });

  return (
    <div className="wp-editor">
      <WallpaperSwatch value={w} className="wp-preview">
        {!w && <span className="wp-none">No wallpaper</span>}
      </WallpaperSwatch>

      <div className="wp-row" role="group" aria-label="Start from">
        <span className="wp-label">Start</span>
        {allowNone && (
          <button type="button" className={`wp-chip${!w ? ' is-on' : ''}`} onClick={() => { setDrawing(false); onChange(null); }}>None</button>
        )}
        <button type="button" className="wp-chip" onClick={() => { onChange(blankWallpaper(w)); setDrawing(true); }}>Blank</button>
        {Object.entries(TEXTURES).map(([k, t]) => (
          <button key={k} type="button" className="wp-chip wp-chip--texture" title={t.label}
            onClick={() => onChange(textureWallpaper(k, { tiling: w?.tiling, scale: w?.scale || 2, bg: w?.bg }))}>
            <img src={previews[k]} alt="" width="18" height="18" />{t.label}
          </button>
        ))}
      </div>

      {w && (
        <>
          <div className="wp-row" role="radiogroup" aria-label="Tiling">
            <span className="wp-label">Tiling</span>
            {Object.entries(TILINGS).map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={w.tiling === k}
                className={`wp-chip${w.tiling === k ? ' is-on' : ''}`} onClick={() => set({ tiling: k })}>{label}</button>
            ))}
          </div>

          <div className="wp-row">
            <span className="wp-label">Pixel</span>
            <input type="range" min="1" max="8" step="1" value={w.scale} aria-label="Pixel size"
              onChange={e => set({ scale: parseInt(e.target.value, 10) })} />
            <span className="wp-value">{w.scale}×</span>
            <span className="wp-label wp-label--gap">Behind</span>
            <label className="wp-colour" style={{ background: w.bg }} title="Colour behind transparent pixels">
              <input type="color" value={w.bg} onChange={e => set({ bg: e.target.value })} aria-label="Colour behind transparent pixels" />
            </label>
            <span className="wp-grow" />
            <button type="button" className={`wp-chip${drawing ? ' is-on' : ''}`} onClick={() => setDrawing(d => !d)}>
              {drawing ? 'Close designer' : 'Draw the tile'}
            </button>
          </div>

          {drawing && (
            <TileGrid
              data={w.tile}
              onChange={tile => set({ tile })}
              editable
              startEditing
              maxCols={MAX_TILE_TILES}
              maxRows={MAX_TILE_TILES}
              onDone={() => setDrawing(false)}
            />
          )}
        </>
      )}
    </div>
  );
}
