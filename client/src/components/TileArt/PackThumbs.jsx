import { useEffect, useState } from 'react';
import { renderGridImage } from './wallpaper.js';
import { bitsFromHex, glyphSize } from '../Pages/Posts/PostRenderer/RichTextPost/TileGrid/tileGrid.js';

/**
 * Small pictures of what is in a pack: a sticker drawn from its grid, or one
 * custom character drawn from its bitmap. Shared by the messages page, the
 * share dialog and the Stickers section of Customize.
 */

/** A sticker's grid as an <img>, crisp at `scale` CSS pixels per grid pixel. */
export function StickerThumb({ grid, name, scale = 2 }) {
  const [src, setSrc] = useState(null);
  const key = JSON.stringify(grid ?? null);
  useEffect(() => {
    let live = true;
    const dpr = window.devicePixelRatio || 1;
    renderGridImage(grid, Math.max(1, Math.round(scale * dpr)))
      .then(c => { if (live && c) setSrc({ url: c.toDataURL('image/png'), w: c.width / dpr, h: c.height / dpr }); })
      .catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, scale]);
  if (!src) return <span className="pack-thumb pack-thumb--loading" aria-label={name} />;
  return <img className="pack-thumb" src={src.url} width={src.w} height={src.h} alt={name} title={name} />;
}

/** One custom character's bitmap, drawn in the current text colour. */
export function GlyphThumb({ ch, hex, scale = 2 }) {
  const { w, h } = glyphSize(hex);
  const bits = bitsFromHex(hex, w);
  const rects = [];
  bits.forEach((on, i) => { if (on) rects.push(<rect key={i} x={i % w} y={Math.floor(i / w)} width="1" height="1" />); });
  return (
    <svg className="pack-glyph" viewBox={`0 0 ${w} ${h}`} width={w * scale} height={h * scale}
      shapeRendering="crispEdges" role="img" aria-label={ch}>
      <title>{ch}</title>
      {rects}
    </svg>
  );
}

/** Up to `max` previews of a pack's contents. */
export function PackPreview({ kind, body, max = 12 }) {
  if (kind === 'stickers' && Array.isArray(body)) {
    return (
      <div className="pack-preview">
        {body.slice(0, max).map((s, i) => <StickerThumb key={i} grid={s.grid} name={s.name} scale={1} />)}
        {body.length > max && <span className="pack-more">+{body.length - max}</span>}
      </div>
    );
  }
  if (kind === 'symbols' && body && typeof body === 'object') {
    const entries = Object.entries(body);
    return (
      <div className="pack-preview">
        {entries.slice(0, max).map(([ch, hex]) => <GlyphThumb key={ch} ch={ch} hex={hex} scale={1.5} />)}
        {entries.length > max && <span className="pack-more">+{entries.length - max}</span>}
      </div>
    );
  }
  return null;
}
