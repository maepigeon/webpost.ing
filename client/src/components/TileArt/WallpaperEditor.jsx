import { useMemo, useState } from 'react';
import TileGrid from '../Pages/Posts/PostRenderer/RichTextPost/TileGrid/TileGrid.jsx';
import { TEXTURES, texturePreview, DEFAULT_PAW_OPTIONS } from '../Pages/Posts/PostRenderer/RichTextPost/TileGrid/textures.js';
import { normaliseGrid, pixelLayer } from '../Pages/Posts/PostRenderer/RichTextPost/TileGrid/tileGrid.js';
import { TILINGS, MAX_TILE_TILES, sanitiseWallpaper, textureWallpaper, useWallpaperStyle } from './wallpaper.js';
import PawOptions from './PawOptions.jsx';
import './WallpaperEditor.css';

/** Pixel sizes offered as buttons (it used to be a slider). */
const PIXEL_SIZES = [1, 2, 3, 4, 6, 8];

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
  // The texture the wallpaper was last made from. Its options (paw colours)
  // show while it is; drawing on the tile ends that, since changing them
  // remakes the tile from scratch.
  const [texture, setTexture] = useState(null);
  const [pawOptions, setPawOptions] = useState(DEFAULT_PAW_OPTIONS);

  const fromTexture = (k, options) => {
    setTexture(k);
    // A rainbow or gradient repeats with the tile, so give it the tallest one
    // allowed: eight rows of paws from top colour back round to top colour.
    const rows = ['rainbow', 'gradient'].includes(options?.colouring) ? MAX_TILE_TILES : undefined;
    onChange(textureWallpaper(k, { tiling: w?.tiling, scale: w?.scale || 2, bg: w?.bg, options, rows }));
  };
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
          <button type="button" className={`wp-chip${!w ? ' is-on' : ''}`} onClick={() => { setDrawing(false); setTexture(null); onChange(null); }}>None</button>
        )}
        <button type="button" className="wp-chip" onClick={() => { setTexture(null); onChange(blankWallpaper(w)); setDrawing(true); }}>Blank</button>
        {Object.entries(TEXTURES).map(([k, t]) => (
          <button key={k} type="button" className={`wp-chip wp-chip--texture${texture === k ? ' is-on' : ''}`} title={t.label}
            onClick={() => fromTexture(k, k === 'paws' ? pawOptions : undefined)}>
            <img src={previews[k]} alt="" width="18" height="18" />{t.label}
          </button>
        ))}
      </div>

      {texture === 'paws' && (
        <div className="wp-row">
          <PawOptions value={pawOptions} onChange={o => { setPawOptions(o); fromTexture('paws', o); }} />
        </div>
      )}

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
            <span role="radiogroup" aria-label="Pixel size" className="wp-sizes">
              {PIXEL_SIZES.map(n => (
                <button key={n} type="button" role="radio" aria-checked={w.scale === n}
                  className={`wp-chip${w.scale === n ? ' is-on' : ''}`} onClick={() => set({ scale: n })}>{n}×</button>
              ))}
            </span>
            <span className="wp-label wp-label--gap">Behind</span>
            <label className="wp-colour" style={{ background: w.bg }} title="Colour behind transparent pixels">
              <input type="color" value={w.bg} onChange={e => set({ bg: e.target.value })} aria-label="Colour behind transparent pixels" />
            </label>
            <span className="wp-grow" />
            <button type="button" className={`wp-chip${drawing ? ' is-on' : ''}`} onClick={() => { setTexture(null); setDrawing(d => !d); }}>
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
