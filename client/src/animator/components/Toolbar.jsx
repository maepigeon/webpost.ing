import GridButton from '../../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/GridButton.jsx';
import { GridStepper } from '../../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/GridUI.jsx';
import ColourPicker from '../../components/TileArt/ColourPicker.jsx';

const TOOL_LIST = [
  ['brush', 'Brush', 'Brush (B): soft round brush, pressure aware'],
  ['pixel', 'Pixel', 'Pixel brush (P): hard square dots, no smoothing'],
  ['eraser', 'Erase', 'Eraser (E)'],
  ['fill', 'Fill', 'Fill (G): colour a closed area'],
  ['pick', 'Pick', 'Pick a colour from the drawing (I)'],
  ['pan', 'Move', 'Move the view (H, or hold Space, or two fingers)'],
];

/** The left column: tools, size and opacity, colour. `tool` = { kind, size, opacity, hardness, smoothing, colour }. */
export default function Toolbar({ tool, onChange }) {
  const set = (patch) => onChange({ ...tool, ...patch });
  const paints = tool.kind === 'brush' || tool.kind === 'pixel' || tool.kind === 'eraser';
  return (
    <div className="an-panel-body">
      <div className="an-tools-grid" role="group" aria-label="Tools">
        {TOOL_LIST.map(([kind, text, tip]) => (
          <GridButton key={kind} text={text} label={tip.split(':')[0].replace(/ \(.*\)/, '')} title={tip}
            on={tool.kind === kind} onClick={() => set({ kind })} />
        ))}
      </div>
      {paints && (
        <div className="an-steppers">
          <GridStepper label="Brush size" short="Size" value={tool.size} min={1} max={200} onChange={v => set({ size: v })} />
          <GridStepper label="Opacity percent" short="Opac" value={tool.opacity} min={1} max={100} onChange={v => set({ opacity: v })} />
          {tool.kind === 'brush' && (
            <>
              <GridStepper label="Hardness percent: how sharp the edge is" short="Hard" value={tool.hardness} min={0} max={100} onChange={v => set({ hardness: v })} />
              <GridStepper label="Smoothing percent: steadies the line" short="Calm" value={tool.smoothing} min={0} max={90} onChange={v => set({ smoothing: v })} />
            </>
          )}
        </div>
      )}
      {tool.kind === 'fill' && (
        <div className="an-steppers">
          <GridStepper label="Opacity percent" short="Opac" value={tool.opacity} min={1} max={100} onChange={v => set({ opacity: v })} />
        </div>
      )}
      <div className="an-colour">
        <ColourPicker value={tool.colour} onChange={colour => set({ colour })} label="Colour" className="colour-swatch an-swatch" />
        <span className="an-hint">{tool.colour}</span>
      </div>
      <p className="an-hint an-hint-block">Pen pressure changes size and strength. Touch moves and zooms the view while a pen is in use.</p>
    </div>
  );
}
