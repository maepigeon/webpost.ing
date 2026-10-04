import PixelIcon from '../../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/PixelIcon.jsx';

/** A square pixel-art icon button in the grid editor's tile style (same classes as GridButton's tile). */
export default function Tile({ icon, label, on, disabled, onClick, className = '', size = 14, ...rest }) {
  return (
    <button type="button" className={`tg-tile gb${on ? ' is-on' : ''} ${className}`.trim()} aria-label={label} data-tip={label}
      aria-pressed={on === undefined ? undefined : Boolean(on)} disabled={disabled} onClick={onClick} {...rest}>
      <PixelIcon name={icon} size={size} />
    </button>
  );
}
