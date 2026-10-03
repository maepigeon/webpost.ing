import { useEffect, useMemo, useRef, useState } from 'react';
import { useUnsavedGuard } from '../../utils/useUnsavedGuard.js';
import {
  getPresets, defaultTheme, FONTS, BORDERS, SHADOWS, CASES, EFFECTS, MAX_STICKER_TILES, sanitiseTheme, ensureThemeFont,
} from './theme.js';
import { ThemePreview } from './PageTheme.jsx';
import WallpaperEditor from '../TileArt/WallpaperEditor.jsx';
import TileGrid from '../Pages/Posts/PostRenderer/RichTextPost/TileGrid/TileGrid.jsx';
import { STICKERS } from '../TileArt/stickers.js';
import { StickerCenter } from '../TileArt/StickerCenter.jsx';
import { GET_PAGE_THEME, SET_PAGE_THEME, GET_POST_THEME, SET_POST_THEME } from '../Pages/Posts/BasicTextPostServerApi.js';
import './ThemeEditor.css';
import { errorMessage } from '../../utils/errorMessage.js';
import ColourPicker from '../TileArt/ColourPicker.jsx';
import { loadDraft } from '../../utils/autosave.js';
import { useAutosave } from '../../utils/useAutosave.js';

/** A small page drawn in a theme: a header card and two posts. */
function Sample({ name = 'you', compact = false }) {
  return (
    <>
      <div className="theme-card theme-sample-header">
        <h1>{name}</h1>
        <p>{compact ? 'writes things down' : 'Writes things down, pins them up, lets them glow.'}</p>
        {!compact && <span className="theme-button">12 followers</span>}
      </div>
      <div className="theme-card theme-sample-post">
        <h2>{compact ? 'Headline' : 'A headline worth reading'}</h2>
        {!compact && <p>The body of a post sits here, with <a href="#sample" onClick={e => e.preventDefault()}>a link</a> in the middle of it.</p>}
      </div>
      {!compact && (
        <div className="theme-card theme-sample-post">
          <h2>Another one</h2>
          <p>Every card on the page shares the same look.</p>
        </div>
      )}
    </>
  );
}

function Field({ label, children }) {
  return (
    <label className="theme-field">
      <span className="theme-field-label">{label}</span>
      {children}
    </label>
  );
}

function Select({ value, options, onChange }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}>
      {Object.entries(options).map(([k, v]) => <option key={k} value={k}>{typeof v === 'string' ? v : v.label}</option>)}
    </select>
  );
}

function Colour({ value, onChange }) {
  return <ColourPicker value={value} onChange={onChange} label="Colour" className="theme-colour-swatch" />;
}

/**
 * A few preset values as buttons, in the grid editor's tile style. These were
 * sliders: fiddly to land on a value, and their read-outs spilled out of the
 * panel. The preset nearest the current value shows as chosen, so a value
 * saved before there were presets still lights one up.
 */
export function Steps({ value, options, onChange, format = v => v, label }) {
  const nearest = options.reduce((a, b) => (Math.abs(b - value) < Math.abs(a - value) ? b : a));
  return (
    <span className="theme-steps" role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button key={o} type="button" role="radio" aria-checked={o === nearest}
          className={`theme-step${o === nearest ? ' is-on' : ''}`} onClick={() => onChange(o)}>{format(o)}</button>
      ))}
    </span>
  );
}

const pct = v => `${Math.round(v * 100)}%`;

/** Pick a sticker to start from, or draw one, in the same designer as everything else. */
function StickerPicker({ value, onChange }) {
  const [drawing, setDrawing] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  return (
    <div className="theme-sticker">
      <div className="theme-chips">
        <button type="button" className={`theme-chip${!value ? ' is-on' : ''}`} onClick={() => { setDrawing(false); onChange(null); }}>None</button>
        {Object.entries(STICKERS).map(([k, s]) => (
          <button key={k} type="button" className="theme-chip" onClick={() => onChange(s.make())}>{s.label}</button>
        ))}
        <button type="button" className={`theme-chip${browsing ? ' is-on' : ''}`}
          onClick={() => { setDrawing(false); setBrowsing(b => !b); }}>Yours…</button>
        {value && (
          <button type="button" className={`theme-chip${drawing ? ' is-on' : ''}`} onClick={() => setDrawing(d => !d)}>
            {drawing ? 'Close designer' : 'Draw'}
          </button>
        )}
      </div>
      {browsing && (
        // A card's sticker is at most MAX_STICKER_TILES square; a bigger one is cropped.
        <StickerCenter onPick={grid => { onChange(grid); setBrowsing(false); }} />
      )}
      {value && drawing && (
        <TileGrid data={value} onChange={onChange} editable startEditing
          maxCols={MAX_STICKER_TILES} maxRows={MAX_STICKER_TILES} onDone={() => setDrawing(false)} />
      )}
    </div>
  );
}

/**
 * Choose a preset, change anything about it, save it as your own. A preset is
 * only a starting point: the same controls edit every one of them, and its
 * pictures open in the grid designer.
 */
/**
 * @param username  whose theme: the profile's, unless postId is given
 * @param postId    edit this post's own theme instead
 */
export default function ThemeEditor({ username, postId = null }) {
  const load = () => (postId != null ? GET_POST_THEME(postId) : GET_PAGE_THEME(username));
  const store = (theme) => (postId != null ? SET_POST_THEME(postId, theme) : SET_PAGE_THEME(username, theme));
  const presets = useMemo(() => getPresets(), []);
  const [saved, setSaved] = useState(null);          // what is stored; null = Newspaper Life
  const [draft, setDraft] = useState(() => defaultTheme());
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState(false);
  const draftKey = `theme:${postId != null ? `post-${postId}` : username}`;

  useEffect(() => {
    load()
      .then(d => {
        const t = d?.theme ? sanitiseTheme(d.theme) : null;
        const base = t || defaultTheme();
        setSaved(t);
        // Unsaved work from an earlier visit comes back by itself, with a way out.
        const kept = loadDraft(draftKey);
        let back = null;
        if (kept?.data && typeof kept.data === 'object') {
          try { back = sanitiseTheme(kept.data); } catch { back = null; }
        }
        const differs = back && JSON.stringify(back) !== JSON.stringify(sanitiseTheme(base));
        setDraft(differs ? back : base);
        setRestored(!!differs);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [username, postId]); // eslint-disable-line react-hooks/exhaustive-deps

  /** A post can start again from the author's current profile theme. */
  const startFromProfileTheme = async () => {
    try {
      const d = await GET_PAGE_THEME(username);
      setDraft(d?.theme ? sanitiseTheme(d.theme) : defaultTheme());
      setStatus({ ok: true, msg: 'Your profile theme, ready to save for this post.' });
    } catch {
      setStatus({ ok: false, msg: 'Could not load your profile theme.' });
    }
  };

  const set = (group, key) => (value) => {
    // A font chosen here is loaded now, so the preview does not wait for it.
    if (group === 'type' && (key === 'heading' || key === 'body')) ensureThemeFont(value);
    setDraft(d => ({
      ...d,
      preset: 'custom',
      [group]: { ...d[group], [key]: value },
    }));
  };

  const persist = async (theme) => {
    setBusy(true);
    setStatus(null);
    try {
      const res = await store(theme ? sanitiseTheme(theme) : null);
      const t = res?.theme ? sanitiseTheme(res.theme) : null;
      setSaved(t);
      setDraft(t || defaultTheme());
      setRestored(false);
      setStatus({ ok: true, msg: res?.message || 'Saved.' });
      window.dispatchEvent(postId != null
        ? new CustomEvent('post-theme-changed', { detail: { postId, theme: t } })
        : new CustomEvent('page-theme-changed', { detail: { username, theme: t } }));
    } catch (err) {
      setStatus({ ok: false, msg: errorMessage(err, 'Could not save the theme.') });
    } finally {
      setBusy(false);
    }
  };

  const t = sanitiseTheme(draft);
  const dirty = JSON.stringify(t) !== JSON.stringify(sanitiseTheme(saved || defaultTheme()));
  useUnsavedGuard(dirty, 'your theme');

  // The working copy is kept on this device while it differs from what is
  // saved; going back to the saved look (undo, save) drops it.
  const auto = useAutosave(draftKey, loaded && dirty ? t : null);
  const wasDirty = useRef(false);
  useEffect(() => {
    if (wasDirty.current && !dirty) auto.clear();
    wasDirty.current = dirty;
  }, [dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  const undoChanges = () => { setDraft(saved || defaultTheme()); setRestored(false); };

  if (!loaded) return <p className="settings-section-hint">{postId != null ? 'Loading this post’s theme…' : 'Loading your theme…'}</p>;

  return (
    <div className="theme-editor">
      {restored && dirty && (
        <p className="theme-status" role="status">
          Restored your unsaved changes{' '}
          <button type="button" className="settings-btn" onClick={undoChanges}>Undo</button>
        </p>
      )}
      <div className="theme-gallery" role="list">
        {Object.entries(presets).map(([key, p]) => (
          <button key={key} type="button" role="listitem"
            className={`theme-gallery-item${draft.preset === key ? ' is-on' : ''}`}
            onClick={() => setDraft(p.theme)}
            aria-pressed={draft.preset === key}>
            <ThemePreview theme={p.theme} className="theme-preview--mini">
              <Sample name={p.label} compact />
            </ThemePreview>
            <span className="theme-gallery-label">{p.label}</span>
            <span className="theme-gallery-blurb">{p.blurb}</span>
          </button>
        ))}
      </div>

      <div className="theme-workbench">
        <ThemePreview theme={t} className="theme-preview--large">
          <Sample name={username} />
        </ThemePreview>

        <div className="theme-controls">
          <fieldset>
            <legend>Page background</legend>
            <label className="theme-check">
              <input type="checkbox" checked={t.page.useProfileWallpaper}
                onChange={e => set('page', 'useProfileWallpaper')(e.target.checked)} />
              Use my profile wallpaper
            </label>
            {!t.page.useProfileWallpaper && (
              <WallpaperEditor value={t.page.wallpaper} onChange={set('page', 'wallpaper')} />
            )}
          </fieldset>

          <fieldset>
            <legend>Type</legend>
            <Field label="Headings"><Select value={t.type.heading} options={FONTS} onChange={set('type', 'heading')} /></Field>
            <Field label="Body"><Select value={t.type.body} options={FONTS} onChange={set('type', 'body')} /></Field>
            <Field label="Text"><Colour value={t.type.ink} onChange={set('type', 'ink')} /></Field>
            <Field label="Headings colour"><Colour value={t.type.headingInk} onChange={set('type', 'headingInk')} /></Field>
            <Field label="Links"><Colour value={t.type.link} onChange={set('type', 'link')} /></Field>
            <Field label="Buttons and accent"><Colour value={t.type.accent} onChange={set('type', 'accent')} /></Field>
            <Field label="Heading case"><Select value={t.type.headingCase} options={CASES} onChange={set('type', 'headingCase')} /></Field>
            <Field label="Heading size">
              <Steps label="Heading size" value={t.type.headingScale} options={[0.8, 0.9, 1, 1.15, 1.35, 1.6]} onChange={set('type', 'headingScale')} format={pct} />
            </Field>
          </fieldset>

          <fieldset>
            <legend>Cards</legend>
            <Field label="Colour"><Colour value={t.card.bg} onChange={set('card', 'bg')} /></Field>
            <Field label="Opacity">
              <Steps label="Opacity" value={t.card.opacity} options={[1, 0.9, 0.8, 0.65, 0.5, 0.3]} onChange={set('card', 'opacity')} format={pct} />
            </Field>
            <Field label="Border"><Select value={t.card.border} options={BORDERS} onChange={set('card', 'border')} /></Field>
            <Field label="Border colour"><Colour value={t.card.borderColor} onChange={set('card', 'borderColor')} /></Field>
            <Field label="Corners"><Steps label="Corners" value={t.card.radius} options={[0, 2, 6, 12, 20, 28]} onChange={set('card', 'radius')} format={v => `${v}px`} /></Field>
            <Field label="Shadow"><Select value={t.card.shadow} options={SHADOWS} onChange={set('card', 'shadow')} /></Field>
            <span className="theme-field-label">Texture</span>
            <WallpaperEditor value={t.card.texture} onChange={set('card', 'texture')} />
            <span className="theme-field-label">Sticker</span>
            <StickerPicker value={t.card.sticker} onChange={set('card', 'sticker')} />
          </fieldset>

          <fieldset>
            <legend>Effects</legend>
            {Object.entries(EFFECTS).map(([k, label]) => (
              <label key={k} className="theme-check">
                <input type="checkbox" checked={t.fx[k]} onChange={e => set('fx', k)(e.target.checked)} />
                {label}
              </label>
            ))}
          </fieldset>
        </div>
      </div>

      <div className="theme-actions">
        <button type="button" className="settings-btn settings-btn--primary" disabled={busy || !dirty} title={dirty ? undefined : 'No changes yet'}
          onClick={() => persist(draft)}>
          {busy ? 'Saving…' : 'Save theme'}
        </button>
        <button type="button" className="settings-btn" disabled={busy || !dirty} title={dirty ? undefined : 'No changes yet'}
          onClick={undoChanges}>
          Undo changes
        </button>
        <button type="button" className="settings-btn" disabled={busy || saved === null}
          onClick={() => persist(null)}
          title="Go back to the site's default look">
          Restore Newspaper Life
        </button>
        {postId != null && (
          <button type="button" className="settings-btn" disabled={busy} onClick={startFromProfileTheme}
            title="Copy your profile's current theme to start from">
            Start from my profile theme
          </button>
        )}
        {status && <span className={`theme-status${status.ok ? '' : ' theme-status--error'}`} role="status">{status.msg}</span>}
      </div>
    </div>
  );
}
