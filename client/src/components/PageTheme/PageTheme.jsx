import { useEffect, useState, useSyncExternalStore } from 'react';
import { DEFAULT_THEME, sanitiseTheme, applyThemeToDocument, themeStyle } from './theme.js';
import { patternToStyle } from '../PatternPicker/patterns.js';
import { GET_PAGE_THEME } from '../Pages/Posts/BasicTextPostServerApi.js';
import './themes.css';

// ── The document's current theme ──────────────────────────────────────────────
// Newspaper Life everywhere, except while an author's profile or post is open.

let current = DEFAULT_THEME;
let removeCurrent = applyThemeToDocument(DEFAULT_THEME, { isDefault: true });
const listeners = new Set();

function setDocumentTheme(theme) {
  removeCurrent();
  current = sanitiseTheme(theme || DEFAULT_THEME);
  removeCurrent = applyThemeToDocument(current, { isDefault: !theme });
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

// ── Layers ────────────────────────────────────────────────────────────────────

/** The page texture behind everything, and the effects in front of it. */
export function ThemeLayers({ theme }) {
  const t = sanitiseTheme(theme);
  const paw = t.page.texture === 'rainbow-paws' ? patternToStyle('paw-print') : null;
  return (
    <>
      <div className="th-backdrop" data-texture={t.page.texture} aria-hidden="true">
        {paw && (
          <div className="th-paws" style={{
            WebkitMaskImage: paw.backgroundImage, maskImage: paw.backgroundImage,
            WebkitMaskSize: paw.backgroundSize, maskSize: paw.backgroundSize,
            WebkitMaskPosition: paw.backgroundPosition, maskPosition: paw.backgroundPosition,
          }} />
        )}
      </div>
      {(t.fx.scanlines || t.fx.flicker) && (
        <div className="th-overlay" aria-hidden="true"
          data-scanlines={t.fx.scanlines ? '' : undefined}
          data-flicker={t.fx.flicker ? '' : undefined} />
      )}
    </>
  );
}

/** Layers for whatever theme the document is showing. Mounted once, in App. */
export function DocumentThemeLayers() {
  const theme = useSyncExternalStore(subscribe, getCurrent);
  return <ThemeLayers theme={theme} />;
}

/** A box that shows a theme regardless of the page around it. */
export function ThemePreview({ theme, children, className = '' }) {
  return (
    <div className={`theme-preview ${className}`} style={themeStyle(theme)}>
      <ThemeLayers theme={theme} />
      <div className="theme-preview-content">{children}</div>
    </div>
  );
}
