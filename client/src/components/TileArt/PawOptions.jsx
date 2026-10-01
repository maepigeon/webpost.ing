import { PAW_COLOURINGS, DEFAULT_PAW_OPTIONS, MAX_PAW_STOPS } from '../Pages/Posts/PostRenderer/RichTextPost/TileGrid/textures.js';
import Icon from '../Icon/Icon.jsx';
import './PawOptions.css';

/**
 * How the Paws texture is coloured: a dropdown, then a colour for "One
 * colour", or a row of colour stops for "My gradient" (top to bottom, two to
 * six of them). Buttons and swatches only, no sliders.
 *
 * Used wherever Paws can be chosen: the wallpaper editor and the grid
 * editor's texture fill.
 */
export default function PawOptions({ value, onChange }) {
  const o = { ...DEFAULT_PAW_OPTIONS, ...(value || {}) };
  const set = (patch) => onChange({ ...o, ...patch });
  const setStop = (i, c) => set({ stops: o.stops.map((s, j) => (j === i ? c : s)) });

  return (
    <div className="paw-options" role="group" aria-label="Paw colours">
      <label className="paw-options-label">
        Paws
        <select value={o.colouring} onChange={e => set({ colouring: e.target.value })}>
          {Object.entries(PAW_COLOURINGS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </label>

      {o.colouring === 'single' && (
        <label className="paw-swatch" style={{ background: o.colour }} title="Paw colour">
          <input type="color" value={o.colour} onChange={e => set({ colour: e.target.value })} aria-label="Paw colour" />
        </label>
      )}

      {o.colouring === 'gradient' && (
        <span className="paw-stops">
          {o.stops.map((c, i) => (
            <span key={i} className="paw-stop">
              <label className="paw-swatch" style={{ background: c }} title={`Colour ${i + 1} of ${o.stops.length}, top to bottom`}>
                <input type="color" value={c} onChange={e => setStop(i, e.target.value)} aria-label={`Gradient colour ${i + 1}`} />
              </label>
              {o.stops.length > 2 && (
                <button type="button" className="paw-stop-remove" aria-label={`Remove colour ${i + 1}`}
                  onClick={() => set({ stops: o.stops.filter((_, j) => j !== i) })}>
                  <Icon name="close" size={10} />
                </button>
              )}
            </span>
          ))}
          {o.stops.length < MAX_PAW_STOPS && (
            <button type="button" className="paw-stop-add" aria-label="Add a colour"
              onClick={() => set({ stops: [...o.stops, o.stops[o.stops.length - 1]] })}>
              <Icon name="plus" size={12} />
            </button>
          )}
        </span>
      )}
    </div>
  );
}
