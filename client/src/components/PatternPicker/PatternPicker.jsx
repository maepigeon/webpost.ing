import { useState, useRef, useEffect } from 'react';
import {
  PRESET_PATTERNS, PRESET_COLOR_SLOTS, DEFAULT_BG_COLOR,
  parseWallpaper, buildWallpaper, wallpaperToStyle,
  renderPresetStyle, isValidCustomCss,
} from './patterns.js';
import { BASE_URL } from '../../config.js';
import { useDialog } from '../Dialog/Dialog.jsx';
import './PatternPicker.css';

// ── Color helpers ─────────────────────────────────────────────────────────────

const COLOR_RE = /rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*[\d.]+)?\s*\)|hsla?\([^)]+\)|#[0-9a-fA-F]{3,8}\b/g;

function parseColors(css) {
  const matches = css.match(COLOR_RE) || [];
  return [...new Map(matches.map(c => [c.toLowerCase(), c])).values()];
}

function cssColorToHex(color) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  } catch { return '#000000'; }
}

function getAlpha(color) {
  const m = color.match(/rgba\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/i);
  if (m) return parseFloat(m[1]);
  if (/hsla/i.test(color)) {
    const ma = color.match(/,\s*([\d.]+)\s*\)$/);
    return ma ? parseFloat(ma[1]) : 1;
  }
  return 1;
}

function hexAlphaToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (alpha >= 1) return `rgb(${r},${g},${b})`;
  return `rgba(${r},${g},${b},${Math.round(alpha * 100) / 100})`;
}

function swatchStyleOf({ backgroundImage, backgroundSize, backgroundPosition }) {
  if (!backgroundImage) return { background: '#fff' };
  const s = { backgroundImage, backgroundSize: backgroundSize || '20px 20px' };
  if (backgroundPosition) s.backgroundPosition = backgroundPosition;
  return s;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Background pattern and color picker.
 *
 * Props:
 *   value     — stored JSON v2 wallpaper string (or legacy pipe format)
 *   onChange  — called with new stored string when user confirms a change
 *   onPreview — (optional) called during live preview without saving
 *   username  — if provided, user presets are persisted to the backend
 */
export default function PatternPicker({ value, onChange, onPreview, username }) {
  const { confirm } = useDialog();

  // ── State ──────────────────────────────────────────────────────────────────

  const [wdata, setWdata]           = useState(() => parseWallpaper(value));
  const [customCss, setCustomCss]   = useState(() => parseWallpaper(value).css || '');
  const [customError, setCustomError] = useState('');
  const [inputDirty, setInputDirty] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName]     = useState('');
  const [presetSaveError, setPresetSaveError] = useState('');
  const [userPresets, setUserPresets] = useState({});

  // Always-current refs so handlers never capture stale closures
  const wdataRef = useRef(wdata);
  wdataRef.current = wdata;
  const scaleRef = useRef(wdata.scale);
  scaleRef.current = wdata.scale;
  const inputDirtyRef = useRef(false);
  useEffect(() => { inputDirtyRef.current = inputDirty; }, [inputDirty]);

  // Sync when the parent updates value (e.g. after server load)
  useEffect(() => {
    if (!inputDirtyRef.current) {
      const w = parseWallpaper(value);
      setWdata(w);
      setCustomCss(w.css || '');
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ────────────────────────────────────────────────────────────────

  const applyWdata = (next) => {
    setWdata(next);
    onChange(buildWallpaper(next));
  };

  const previewWdata = (next) => {
    setWdata(next);
    onPreview?.(buildWallpaper(next));
  };

  // ── Load / save user presets ───────────────────────────────────────────────

  useEffect(() => {
    const fromStorage = () => {
      try { setUserPresets(JSON.parse(localStorage.getItem('userPatternPresets') || '{}')); } catch { /* ignore */ }
    };
    if (username) {
      fetch(`${BASE_URL}/api/users/${username}/presets`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(d => d ? setUserPresets(d) : fromStorage())
        .catch(fromStorage);
    } else {
      fromStorage();
    }
  }, [username]);

  const saveUserPresets = (updated) => {
    setUserPresets(updated);
    setPresetSaveError('');
    if (username) {
      fetch(`${BASE_URL}/api/users/${username}/presets`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      }).then(r => {
        if (!r.ok) r.text().then(msg => setPresetSaveError(`Save failed: ${msg || r.status}`));
      }).catch(() => localStorage.setItem('userPatternPresets', JSON.stringify(updated)));
    } else {
      localStorage.setItem('userPatternPresets', JSON.stringify(updated));
    }
  };

  // ── Preset swatch click ────────────────────────────────────────────────────

  const handlePreset = async (key) => {
    if (inputDirty && !(await confirm('Replace your custom gradient?'))) return;
    setInputDirty(false);
    setCustomCss('');
    setCustomError('');
    const slots = PRESET_COLOR_SLOTS[key] || [];
    applyWdata({ ...wdataRef.current, pattern: key, colors: slots.map(s => s.default), css: undefined });
  };

  // ── User preset click ──────────────────────────────────────────────────────

  const handleUserPreset = async (stored) => {
    if (inputDirty && !(await confirm('Replace your current gradient with this saved preset?'))) return;
    const w = parseWallpaper(stored);
    setInputDirty(false);
    setCustomCss(w.css || '');
    setCustomError('');
    setWdata(w);
    onChange(buildWallpaper(w));
  };

  // ── Pattern color change ───────────────────────────────────────────────────

  const handleColorChange = (idx, hex) => {
    const w = wdataRef.current;
    const slots = PRESET_COLOR_SLOTS[w.pattern] || [];
    const colors = [...w.colors];
    while (colors.length <= idx) colors.push(slots[colors.length]?.default || '#000000');
    colors[idx] = hex;
    applyWdata({ ...w, colors });
  };

  const previewColorChange = (idx, hex) => {
    const w = wdataRef.current;
    const slots = PRESET_COLOR_SLOTS[w.pattern] || [];
    const colors = [...w.colors];
    while (colors.length <= idx) colors.push(slots[colors.length]?.default || '#000000');
    colors[idx] = hex;
    previewWdata({ ...w, colors });
  };

  // ── Custom CSS color edit (string-replace) ─────────────────────────────────

  const handleCustomColorEdit = (oldColor, newHex) => {
    const alpha = getAlpha(oldColor);
    const newColor = hexAlphaToRgba(newHex, alpha);
    const newCss = customCss.split(oldColor).join(newColor);
    setCustomCss(newCss);
    applyWdata({ ...wdataRef.current, css: newCss });
  };

  const handleCustomAlphaEdit = (oldColor, newAlpha) => {
    const newColor = hexAlphaToRgba(cssColorToHex(oldColor), newAlpha);
    const newCss = customCss.split(oldColor).join(newColor);
    setCustomCss(newCss);
    applyWdata({ ...wdataRef.current, css: newCss });
  };

  // ── Background color ───────────────────────────────────────────────────────

  const handleBgColorPreview = (hex) => previewWdata({ ...wdataRef.current, bgColor: hex });
  const commitBgColor = (hex)         => applyWdata({ ...wdataRef.current, bgColor: hex });

  // Attach DOM 'change' listener to bg input to save when picker closes
  const bgInputRef = useRef(null);
  const latestOnChangeRef = useRef(onChange);
  latestOnChangeRef.current = onChange;
  useEffect(() => {
    const el = bgInputRef.current;
    if (!el) return;
    const onClose = () => {
      const next = { ...wdataRef.current, bgColor: el.value };
      setWdata(next);
      latestOnChangeRef.current(buildWallpaper(next));
    };
    el.addEventListener('change', onClose);
    return () => el.removeEventListener('change', onClose);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scale ──────────────────────────────────────────────────────────────────

  const handleScaleChange = (s) => {
    scaleRef.current = s;
    previewWdata({ ...wdataRef.current, scale: s });
  };

  const commitScale = (explicit) => {
    const s = typeof explicit === 'number' ? explicit : scaleRef.current;
    applyWdata({ ...wdataRef.current, scale: s });
  };

  // ── Custom CSS input ───────────────────────────────────────────────────────

  const handleCustomCssChange = (e) => {
    setCustomCss(e.target.value);
    setInputDirty(true);
    setCustomError('');
  };

  const applyCustomCss = () => {
    const css = customCss.trim();
    if (!css) {
      applyWdata({ ...wdataRef.current, pattern: 'none', css: undefined });
      setInputDirty(false);
      return;
    }
    if (!isValidCustomCss(css)) {
      setCustomError('Only CSS gradient functions are allowed.');
      return;
    }
    applyWdata({ ...wdataRef.current, pattern: 'custom', css });
    setInputDirty(false);
    setCustomError('');
  };

  // ── Save preset dialog ─────────────────────────────────────────────────────

  const openSaveDialog = () => {
    setSaveName('');
    setShowSaveDialog(true);
  };

  const handleSavePreset = () => {
    if (!saveName.trim()) return;
    saveUserPresets({ ...userPresets, [saveName.trim()]: buildWallpaper(wdataRef.current) });
    setSaveName('');
    setShowSaveDialog(false);
  };

  const handleDismissSaveDialog = () => {
    setShowSaveDialog(false);
    setSaveName('');
  };

  const deleteUserPreset = (name) => {
    const updated = { ...userPresets };
    delete updated[name];
    saveUserPresets(updated);
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const { pattern, scale, bgColor, colors } = wdata;
  const colorSlots = PRESET_COLOR_SLOTS[pattern] || [];
  const cssColors  = pattern === 'custom' ? parseColors(customCss) : [];
  const canSave    = pattern !== 'none' && (pattern !== 'custom' || isValidCustomCss(customCss));

  // Active swatch renders user's current colors; inactive swatches use defaults
  const swatchStyleFor = (key) => {
    if (key === 'none') return { background: bgColor };
    if (key === pattern) return swatchStyleOf(renderPresetStyle(key, colors));
    return swatchStyleOf(PRESET_PATTERNS[key]);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="pattern-picker">

      {/* ── 1. Built-in preset swatches ─────────────────────────────────────── */}
      <div className="pattern-picker-presets">
        {Object.entries(PRESET_PATTERNS).map(([key, preset]) => (
          <button
            key={key}
            type="button"
            className={`pattern-swatch${pattern === key ? ' pattern-swatch--active' : ''}`}
            style={swatchStyleFor(key)}
            title={preset.label}
            onClick={() => handlePreset(key)}
          >
            <span className="pattern-swatch-label">{preset.label}</span>
          </button>
        ))}
      </div>

      {/* ── 2. Colors (pattern slots + custom CSS colors + background) ───────── */}
      <div className="pattern-picker-section">
        <div className="pattern-picker-section-label">Colors</div>

        {colorSlots.map((slot, i) => {
          const hex = colors[i] || slot.default;
          return (
            <div key={i} className="pattern-color-row">
              <span className="pattern-color-swatch" style={{ background: hex }} />
              <span className="pattern-color-label">{slot.label}</span>
              <input
                type="color"
                className="pattern-color-hex"
                value={hex}
                onChange={e => previewColorChange(i, e.target.value)}
                onBlur={e => handleColorChange(i, e.target.value)}
                title={slot.label}
              />
              {hex !== slot.default && (
                <button type="button" className="pattern-picker-cancel-btn"
                  onClick={() => handleColorChange(i, slot.default)}>Reset</button>
              )}
            </div>
          );
        })}

        {cssColors.map((color, i) => {
          const hex = cssColorToHex(color);
          const alpha = getAlpha(color);
          const hasAlpha = /rgba|hsla/i.test(color);
          return (
            <div key={i} className="pattern-color-row">
              <span className="pattern-color-swatch" style={{ background: color }} />
              <span className="pattern-color-label">Color {i + 1}</span>
              <input type="color" className="pattern-color-hex" value={hex}
                onChange={e => handleCustomColorEdit(color, e.target.value)} title="Pick color" />
              {hasAlpha && (
                <label className="pattern-color-alpha-label" title="Opacity">
                  <input type="range" min="0" max="1" step="0.01" value={alpha}
                    className="pattern-color-alpha"
                    onChange={e => handleCustomAlphaEdit(color, parseFloat(e.target.value))} />
                  <span className="pattern-color-alpha-val">{Math.round(alpha * 100)}%</span>
                </label>
              )}
            </div>
          );
        })}

        {/* Background color — always last */}
        <div className="pattern-color-row">
          <span className="pattern-color-swatch" style={{ background: bgColor }} />
          <span className="pattern-color-label">Background</span>
          <input
            ref={bgInputRef}
            type="color"
            className="pattern-color-hex"
            value={bgColor}
            onChange={e => handleBgColorPreview(e.target.value)}
            title="Page background color"
          />
          {bgColor !== DEFAULT_BG_COLOR && (
            <button type="button" className="pattern-picker-cancel-btn"
              onClick={() => commitBgColor(DEFAULT_BG_COLOR)}>Reset</button>
          )}
        </div>
      </div>

      {/* ── 3. Scale slider ─────────────────────────────────────────────────── */}
      {pattern !== 'none' && (
        <div className="pattern-picker-section">
          <div className="pattern-picker-section-label">
            Scale &nbsp;<span style={{ fontWeight: 400, color: '#666' }}>{scale.toFixed(2)}×</span>
            {scale !== 1 && (
              <button type="button" className="pattern-picker-cancel-btn" style={{ marginLeft: 8 }}
                onClick={() => { handleScaleChange(1); commitScale(1); }}>Reset</button>
            )}
          </div>
          <input
            type="range" min="0.25" max="4" step="0.05" value={scale}
            className="pattern-scale-slider"
            onChange={e => handleScaleChange(parseFloat(e.target.value))}
            onPointerUp={() => commitScale()}
            onKeyUp={() => commitScale()}
          />
        </div>
      )}

      {/* ── 4. Custom gradient input ─────────────────────────────────────────── */}
      <div className="pattern-picker-custom">
        <div className="pattern-picker-custom-header">
          <span className="pattern-picker-custom-label">Custom gradient</span>
          {inputDirty && <span className="pattern-picker-warning">⚠ Unsaved</span>}
        </div>
        <div className="pattern-picker-custom-row">
          <input
            className="pattern-picker-custom-input"
            type="text"
            placeholder="e.g. linear-gradient(135deg, #f5f7fa, #c3cfe2)"
            value={customCss}
            onChange={handleCustomCssChange}
            onBlur={() => { if (inputDirty && customCss.trim()) applyCustomCss(); else setInputDirty(false); }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyCustomCss(); } }}
            maxLength={2000}
          />
        </div>
        <div className="pattern-picker-btn-row">
          {canSave && (
            <button type="button" className="pattern-picker-save-btn" onClick={openSaveDialog}>
              💾 Save as preset
            </button>
          )}
        </div>
        {customError && <p className="pattern-picker-error">{customError}</p>}

        {showSaveDialog && (
          <div className="pattern-save-overlay" onClick={handleDismissSaveDialog}>
            <div className="pattern-save-dialog" onClick={e => e.stopPropagation()}>
              <p className="pattern-save-dialog-title">Save as preset</p>
              <input
                type="text"
                className="pattern-save-dialog-input"
                placeholder="Give it a name…"
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSavePreset(); if (e.key === 'Escape') handleDismissSaveDialog(); }}
                maxLength={40}
                autoFocus
              />
              <div className="pattern-save-dialog-btns">
                <button type="button" className="pattern-save-dialog-cancel" onClick={handleDismissSaveDialog}>Cancel</button>
                <button type="button" className="pattern-save-dialog-save" onClick={handleSavePreset} disabled={!saveName.trim()}>Save</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 5. My saved presets ─────────────────────────────────────────────── */}
      {presetSaveError && <p className="pattern-picker-error">{presetSaveError}</p>}
      {Object.keys(userPresets).length > 0 && (
        <div className="pattern-picker-section">
          <div className="pattern-picker-section-label">My presets</div>
          <div className="pattern-picker-presets">
            {Object.entries(userPresets).map(([name, stored]) => {
              const pd = parseWallpaper(stored);
              const ps = pd.pattern === 'custom'
                ? { backgroundImage: pd.css || '' }
                : renderPresetStyle(pd.pattern, pd.colors);
              return (
                <div key={name} className="pattern-user-preset-item">
                  <button
                    type="button"
                    className="pattern-swatch"
                    style={ps.backgroundImage ? swatchStyleOf(ps) : { background: pd.bgColor || DEFAULT_BG_COLOR }}
                    title={name}
                    onClick={() => handleUserPreset(stored)}
                  >
                    <span className="pattern-swatch-label">{name}</span>
                  </button>
                  <button type="button" className="pattern-user-preset-delete"
                    onClick={() => deleteUserPreset(name)} title="Remove">×</button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
