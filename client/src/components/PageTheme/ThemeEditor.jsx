import { useEffect, useMemo, useState } from 'react';
import {
  getPresets, defaultTheme, FONTS, BORDERS, SHADOWS, CASES, EFFECTS, MAX_STICKER_TILES, sanitiseTheme,
} from './theme.js';
import { ThemePreview } from './PageTheme.jsx';
import WallpaperEditor from '../TileArt/WallpaperEditor.jsx';
import TileGrid from '../Pages/Posts/PostRenderer/RichTextPost/TileGrid/TileGrid.jsx';
import { STICKERS } from '../TileArt/stickers.js';
import { GET_PAGE_THEME, SET_PAGE_THEME } from '../Pages/Posts/BasicTextPostServerApi.js';
import './ThemeEditor.css';
import { errorMessage } from '../../utils/errorMessage.js';

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
          <p>Cards take turns leaning, if the theme tilts them.</p>
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
  return <input type="color" value={value} onChange={e => onChange(e.target.value)} />;
}

function Slider({ value, min, max, step, onChange, format = v => v }) {
  return (
    <span className="theme-slider">
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} />
      <span>{format(value)}</span>
    </span>
  );
}

/** Pick a sticker to start from, or draw one, in the same designer as everything else. */
function StickerPicker({ value, onChange }) {
  const [drawing, setDrawing] = useState(false);
  return (
    <div className="theme-sticker">
      <div className="theme-chips">
        <button type="button" className={`theme-chip${!value ? ' is-on' : ''}`} onClick={() => { setDrawing(false); onChange(null); }}>None</button>
        {Object.entries(STICKERS).map(([k, s]) => (
          <button key={k} type="button" className="theme-chip" onClick={() => onChange(s.make())}>{s.label}</button>
        ))}
        {value && (
          <button type="button" className={`theme-chip${drawing ? ' is-on' : ''}`} onClick={() => setDrawing(d => !d)}>
            {drawing ? 'Close designer' : 'Draw'}
          </button>
        )}
      </div>
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
export default function ThemeEditor({ username }) {
  const presets = useMemo(() => getPresets(), []);
  const [saved, setSaved] = useState(null);          // what is stored; null = Newspaper Life
  const [draft, setDraft] = useState(() => defaultTheme());
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    GET_PAGE_THEME(username)
      .then(d => {
        const t = d?.theme ? sanitiseTheme(d.theme) : null;
        setSaved(t);
        setDraft(t || defaultTheme());
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [username]);

  const set = (group, key) => (value) => setDraft(d => ({
    ...d,
    preset: 'custom',
    [group]: { ...d[group], [key]: value },
  }));

  const persist = async (theme) => {
    setBusy(true);
    setStatus(null);
    try {
      const res = await SET_PAGE_THEME(username, theme ? sanitiseTheme(theme) : null);
      const t = res?.theme ? sanitiseTheme(res.theme) : null;
      setSaved(t);
      setDraft(t || defaultTheme());
      setStatus({ ok: true, msg: res?.message || 'Saved.' });
      window.dispatchEvent(new CustomEvent('page-theme-changed', { detail: { username, theme: t } }));
    } catch (err) {
      setStatus({ ok: false, msg: errorMessage(err, 'Could not save the theme.') });
    } finally {
      setBusy(false);
    }
  };

  const t = sanitiseTheme(draft);
  const dirty = JSON.stringify(t) !== JSON.stringify(sanitiseTheme(saved || defaultTheme()));

  if (!loaded) return <p className="settings-section-hint">Loading your theme…</p>;

  return (
    <div className="theme-editor">
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
            <Field label="Accent"><Colour value={t.type.accent} onChange={set('type', 'accent')} /></Field>
            <Field label="Heading case"><Select value={t.type.headingCase} options={CASES} onChange={set('type', 'headingCase')} /></Field>
            <Field label="Heading size">
              <Slider value={t.type.headingScale} min={0.7} max={1.8} step={0.05} onChange={set('type', 'headingScale')} format={v => `${Math.round(v * 100)}%`} />
            </Field>
          </fieldset>

          <fieldset>
            <legend>Cards</legend>
            <Field label="Colour"><Colour value={t.card.bg} onChange={set('card', 'bg')} /></Field>
            <Field label="Opacity">
              <Slider value={t.card.opacity} min={0} max={1} step={0.05} onChange={set('card', 'opacity')} format={v => `${Math.round(v * 100)}%`} />
            </Field>
            <Field label="Border"><Select value={t.card.border} options={BORDERS} onChange={set('card', 'border')} /></Field>
            <Field label="Border colour"><Colour value={t.card.borderColor} onChange={set('card', 'borderColor')} /></Field>
            <Field label="Corners"><Slider value={t.card.radius} min={0} max={28} step={1} onChange={set('card', 'radius')} format={v => `${v}px`} /></Field>
            <Field label="Shadow"><Select value={t.card.shadow} options={SHADOWS} onChange={set('card', 'shadow')} /></Field>
            <Field label="Tilt"><Slider value={t.card.tilt} min={0} max={5} step={0.1} onChange={set('card', 'tilt')} format={v => `${v.toFixed(1)}°`} /></Field>
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
        <button type="button" className="settings-btn settings-btn--primary" disabled={busy || !dirty}
          onClick={() => persist(draft)}>
          {busy ? 'Saving…' : 'Save theme'}
        </button>
        <button type="button" className="settings-btn" disabled={busy || !dirty}
          onClick={() => setDraft(saved || defaultTheme())}>
          Undo changes
        </button>
        <button type="button" className="settings-btn" disabled={busy || saved === null}
          onClick={() => persist(null)}
          title="Go back to the site's default look">
          Restore Newspaper Life
        </button>
        {status && <span className={`theme-status${status.ok ? '' : ' theme-status--error'}`} role="status">{status.msg}</span>}
      </div>
    </div>
  );
}
