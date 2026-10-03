import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { defaultTheme, sanitiseTheme, applyThemeToDocument, themeVariables } from './theme.js';
import { wallpaperStyle, renderGridImage, useWallpaperStyle } from '../TileArt/wallpaper.js';
import { TILE } from '../Pages/Posts/PostRenderer/RichTextPost/TileGrid/tileGrid.js';
import { GET_PAGE_THEME, GET_POST_THEME } from '../Pages/Posts/BasicTextPostServerApi.js';
import './themes.css';

/** CSS pixels per grid pixel for a card's sticker. */
const STICKER_SCALE = 2;

// ── The document's current theme ──────────────────────────────────────────────
// Newspaper Life everywhere, except while an author's profile or post is open.

let current = { theme: null, isDefault: true };
const listeners = new Set();

function setDocumentTheme(theme) {
  current = theme ? { theme: sanitiseTheme(theme), isDefault: false } : { theme: null, isDefault: true };
  listeners.forEach(l => l());
}

const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const getCurrent = () => current;

/**
 * Shows a theme on the document while the calling page is mounted, loaded by
 * `load` and kept up to date by `eventName` events that `matches`. Anything
 * else goes back to Newspaper Life.
 */
function useLoadedTheme(key, load, eventName, matches) {
  const [theme, setTheme] = useState(null);

  useEffect(() => {
    if (key == null) return;
    let cancelled = false;
    load()
      .then(data => { if (!cancelled) setTheme(data?.theme || null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // The editor announces a save so its author sees it without reloading.
  useEffect(() => {
    const onSaved = (e) => { if (matches(e.detail)) setTheme(e.detail.theme); };
    window.addEventListener(eventName, onSaved);
    return () => window.removeEventListener(eventName, onSaved);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!theme) return;
    setDocumentTheme(theme);
    return () => setDocumentTheme(null);
  }, [theme]);
}

/** `username`'s profile theme, while their profile is open. */
export function useAuthorTheme(username) {
  useLoadedTheme(username || null, () => GET_PAGE_THEME(username),
    'page-theme-changed', d => d?.username === username);
}

/**
 * A post's own theme, while the post (or its discussion) is open. Posts keep
 * their own theme, so changing the profile theme does not restyle them.
 */
export function usePostTheme(postId) {
  useLoadedTheme(postId == null ? null : String(postId), () => GET_POST_THEME(postId),
    'post-theme-changed', d => String(d?.postId) === String(postId));
}

// ── Pictures ──────────────────────────────────────────────────────────────────

/**
 * The average colour of a CSS `url(...)` image laid over `under`, as #rrggbb:
 * the image is drawn small over that colour and its pixels averaged.
 */
async function averageColour(cssImage, under = '#ffffff') {
  const url = /^url\(["']?(.*?)["']?\)$/.exec(cssImage || '')?.[1];
  if (!url) return null;
  const img = new Image();
  img.src = url;
  await img.decode();
  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = under;
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  const sum = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) { sum[0] += data[i]; sum[1] += data[i + 1]; sum[2] += data[i + 2]; }
  return '#' + sum.map(v => Math.round(v / (size * size)).toString(16).padStart(2, '0')).join('');
}

/** Draws a theme's card texture and sticker; {} until they are ready. */
export function useThemeImages(theme) {
  const card = theme?.card?.texture || null;
  const sticker = theme?.card?.sticker || null;
  const key = useMemo(() => JSON.stringify([card, sticker]), [card, sticker]);
  const [images, setImages] = useState({});
  useEffect(() => {
    let live = true;
    (async () => {
      const next = {};
      if (card) {
        next.card = await wallpaperStyle(card).catch(() => null);
        // What colour the textured card really is, for checking text against it.
        const colour = next.card && await averageColour(next.card.backgroundImage, theme?.card?.bg).catch(() => null);
        if (colour) next.card = { ...next.card, colour };
      }
      if (sticker) {
        const dpr = window.devicePixelRatio || 1;
        const canvas = await renderGridImage(sticker, Math.round(STICKER_SCALE * dpr)).catch(() => null);
        if (canvas) {
          next.sticker = {
            url: canvas.toDataURL('image/png'),
            width: sticker.cols * TILE * STICKER_SCALE,
            height: sticker.rows * TILE * STICKER_SCALE,
          };
        }
      }
      if (live) setImages(next);
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return images;
}

// ── Layers ────────────────────────────────────────────────────────────────────

/** The page background behind everything, and the screen effects in front of it. */
export function ThemeLayers({ theme }) {
  const t = sanitiseTheme(theme);
  const style = useWallpaperStyle(t.page.useProfileWallpaper ? null : t.page.wallpaper);
  return (
    <>
      <div className="th-backdrop" aria-hidden="true"
        data-wallpaper={t.page.useProfileWallpaper ? 'profile' : undefined}
        style={style} />
      {(t.fx.scanlines || t.fx.flicker) && (
        <div className="th-overlay" aria-hidden="true"
          data-scanlines={t.fx.scanlines ? '' : undefined}
          data-flicker={t.fx.flicker ? '' : undefined} />
      )}
    </>
  );
}

/**
 * The document's theme: its variables on <html> and its layers behind the
 * page. Mounted once, in App.
 */
export function DocumentThemeLayers() {
  const { theme: chosen, isDefault } = useSyncExternalStore(subscribe, getCurrent);
  const theme = useMemo(() => chosen || defaultTheme(), [chosen]);
  const images = useThemeImages(theme);
  useEffect(() => applyThemeToDocument(theme, images, { isDefault }), [theme, images, isDefault]);
  return <ThemeLayers theme={theme} />;
}

/** A box that shows a theme regardless of the page around it. */
export function ThemePreview({ theme, children, className = '' }) {
  const images = useThemeImages(theme);
  return (
    <div className={`theme-preview ${className}`} style={themeVariables(theme, images)}>
      <ThemeLayers theme={theme} />
      <div className="theme-preview-content">{children}</div>
    </div>
  );
}
