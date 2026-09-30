import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { defaultTheme, sanitiseTheme, applyThemeToDocument, themeVariables } from './theme.js';
import { wallpaperStyle, renderGridImage, useWallpaperStyle } from '../TileArt/wallpaper.js';
import { TILE } from '../Pages/Posts/PostRenderer/RichTextPost/TileGrid/tileGrid.js';
import { GET_PAGE_THEME } from '../Pages/Posts/BasicTextPostServerApi.js';
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
 * Shows `username`'s theme while the calling page is mounted: their profile or
 * one of their posts. Anything else goes back to Newspaper Life.
 */
export function useAuthorTheme(username) {
  const [theme, setTheme] = useState(null);

  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    GET_PAGE_THEME(username)
      .then(data => { if (!cancelled) setTheme(data?.theme || null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [username]);

  // Settings announces a save so the owner sees it without reloading.
  useEffect(() => {
    const onSaved = (e) => { if (e.detail?.username === username) setTheme(e.detail.theme); };
    window.addEventListener('page-theme-changed', onSaved);
    return () => window.removeEventListener('page-theme-changed', onSaved);
  }, [username]);

  useEffect(() => {
    if (!theme) return;
    setDocumentTheme(theme);
    return () => setDocumentTheme(null);
  }, [theme]);
}

// ── Pictures ──────────────────────────────────────────────────────────────────

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
      if (card) next.card = await wallpaperStyle(card).catch(() => null);
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
