import PixelText from './PixelText.jsx';
import './tips.css';

/**
 * A button in the grid editor's style: a real button (so it can be focused,
 * pressed with the keyboard and read aloud) holding grid pixels: a symbol, a
 * label in the pixel font, or both.
 *
 * `label` is the accessible name and the tooltip; it is drawn as well (or
 * `text`, a shorter form of it) unless `symbol` is given alone, which makes a
 * square tile.
 */
export default function GridButton({
  label, text, symbol = null, showLabel = !symbol, on, disabled, onClick, title, className = '', px = 1.25, ...rest
}) {
  const tile = symbol && !showLabel;
  return (
    <button type="button" className={`${tile ? 'tg-tile' : 'tg-text-btn'} gb${on ? ' is-on' : ''} ${className}`.trim()}
      aria-label={label} data-tip={title || label} aria-pressed={on === undefined ? undefined : Boolean(on)}
      disabled={disabled} onClick={onClick} {...rest}>
      {symbol && <PixelText symbol={symbol} px={tile ? 1.75 : px} />}
      {showLabel && <PixelText text={text ?? label} px={px} />}
    </button>
  );
}
