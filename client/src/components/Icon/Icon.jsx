/**
 * Small line icons for buttons that hold a single symbol.
 *
 * Text glyphs such as "+", "✕" and "▲" sit wherever the font puts them — a
 * plus is drawn above the middle of its line — so a round button with one in
 * it never looks centred however it is laid out. These are drawn on a 24-unit
 * square with the symbol in the exact middle, and inherit the text colour.
 */
const PATHS = {
  plus:        <path d="M12 5v14M5 12h14" />,
  close:       <path d="M6 6l12 12M18 6L6 18" />,
  check:       <path d="M5 12.5l4.5 4.5L19 7.5" />,
  back:        <path d="M19 12H5M11 6l-6 6 6 6" />,
  up:          <path d="M12 19V5M6 11l6-6 6 6" />,
  down:        <path d="M12 5v14M6 13l6 6 6-6" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  voteUp:      <path d="M12 6l7 10H5z" fill="currentColor" stroke="none" />,
  voteDown:    <path d="M12 18L5 8h14z" fill="currentColor" stroke="none" />,
};

export default function Icon({ name, size = '1em', strokeWidth = 2.4, className = '', title }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      style={{ display: 'block', flexShrink: 0 }}
    >
      {title && <title>{title}</title>}
      {PATHS[name]}
    </svg>
  );
}
