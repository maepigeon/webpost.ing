import { useState, useRef, useEffect, useCallback } from 'react';
import { PRESET_PATTERNS, isValidPattern, patternToStyle, findPresetByImage, pawImage, PAW_DEFAULT_COLOR, starsImage, STARS_DEFAULT_COLOR, STARS_DEFAULT_BG, extractBgColor, extractScale, stripBgColor, DEFAULT_BG_COLOR } from './patterns.js';
import { BASE_URL } from '../../config.js';
import { useDialog } from '../Dialog/Dialog.jsx';
import './PatternPicker.css';

// ── Color helpers ────────────────────────────────────────────────────────────

const COLOR_RE = /rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*[\d.]+)?\s*\)|hsla?\([^)]+\)|#[0-9a-fA-F]{3,8}\b/g;

function parseColors(css) {
  const matches = css.match(COLOR_RE) || [];
  // unique while preserving order
  return [...new Map(matches.map(c => [c.toLowerCase(), c])).values()];
}

// Use an off-screen canvas to convert any CSS color to #rrggbb
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
  if (/^rgba/i.test(color)) return 1;
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

// ── Color editor strip ───────────────────────────────────────────────────────

function ColorEditors({ css, onChange }) {
  const colors = parseColors(css);
  if (!colors.length) return null;

  const handleColorChange = (oldColor, newHex) => {
    const alpha = getAlpha(oldColor);
    const newColor = hexAlphaToRgba(newHex, alpha);
    onChange(css.split(oldColor).join(newColor), newColor, oldColor);
  };

  const handleAlphaChange = (oldColor, newAlpha) => {
    const hex = cssColorToHex(oldColor);
    const newColor = hexAlphaToRgba(hex, newAlpha);
    onChange(css.split(oldColor).join(newColor), newColor, oldColor);
  };

  return (
    <div className="pattern-color-editors">
      <div className="pattern-picker-section-label">Colors in pattern</div>
      {colors.map((color, i) => {
        const hex = cssColorToHex(color);
        const alpha = getAlpha(color);
        const hasAlpha = /rgba|hsla/i.test(color);
        return (
          <div key={i} className="pattern-color-row">
            <span className="pattern-color-swatch" style={{ background: color }} />
            <span className="pattern-color-label">Color {i + 1}</span>
            <input
              type="color"
              className="pattern-color-hex"
              value={hex}
              onChange={e => handleColorChange(color, e.target.value)}
              title="Pick color"
            />
            {hasAlpha && (
              <label className="pattern-color-alpha-label" title="Opacity">
                <input
                  type="range"
                  min="0" max="1" step="0.01"
                  value={alpha}
                  className="pattern-color-alpha"
                  onChange={e => handleAlphaChange(color, parseFloat(e.target.value))}
                />
                <span className="pattern-color-alpha-val">{Math.round(alpha * 100)}%</span>
              </label>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Background pattern picker.
 *
 * Props:
 *   value       — current stored pattern value (preset key or gradient string)
 *   onChange    — called with new value when the user confirms a change (Apply)
 *   onPreview   — (optional) called with new value for live preview without saving
 *   username    — if provided, user presets are loaded from / saved to the backend
 */
export default function PatternPicker({ value, onChange, onPreview, username }) {
  const { confirm } = useDialog();
  // Build a stored value from a pattern (stripping existing suffixes), color, and scale.
  const buildValue = (pattern, color, s) => {
    const base = pattern ? pattern.split('|')[0] : '';
    let v = base;
    if (color && color !== DEFAULT_BG_COLOR) v += '|' + color;
    if (s && s !== 1) v += '|scale:' + s;
    return v;
  };

  const withBgColor = (pattern, color) => buildValue(pattern, color, scale);

  // Return base CSS for a stored value (strips all suffixes)
  const cssForValue = (v) => {
    const p = stripBgColor(v) || '';
    const base = p.split('|')[0] || '';
    if (!base || base === 'none') return '';
    if (base in PRESET_PATTERNS) return PRESET_PATTERNS[base].backgroundImage || '';
    if (base.startsWith('paw-print:')) return pawImage(base.slice('paw-print:'.length).trim());
    if (base.startsWith('stars:')) {
      const rest = base.slice('stars:'.length);
      const idx = rest.indexOf(':');
      const sc = idx >= 0 ? rest.slice(0, idx) : rest;
      const bc = idx >= 0 ? rest.slice(idx + 1) : STARS_DEFAULT_BG;
      return starsImage(sc, bc);
    }
    return base;
  };

  const [customInput, setCustomInput] = useState(() => cssForValue(value));
  const [customError, setCustomError] = useState('');
  const [inputDirty, setInputDirty] = useState(false);
  const [previewStyle, setPreviewStyle] = useState(null);
  // Pending preset: set when user clicks a swatch but hasn't confirmed (Apply) yet
  const [pendingPreset, setPendingPreset] = useState(null); // { key, value }
  const [bgColor, setBgColor] = useState(() => extractBgColor(value) || DEFAULT_BG_COLOR);
  const [scale, setScale] = useState(() => extractScale(value));

  // Sync bgColor and scale when value prop changes from outside
  useEffect(() => {
    setBgColor(extractBgColor(value) || DEFAULT_BG_COLOR);
    setScale(extractScale(value));
  }, [value]);

  // User-saved presets — loaded from backend (or localStorage as fallback)
  const [userPresets, setUserPresets] = useState({});
  const [saveName, setSaveName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [pendingSaveCss, setPendingSaveCss] = useState('');
  const [presetSaveError, setPresetSaveError] = useState('');

  // Load user presets on mount
  useEffect(() => {
    const loadFromStorage = () => {
      try { setUserPresets(JSON.parse(localStorage.getItem('userPatternPresets') || '{}')); }
      catch { /* ignore */ }
    };
    if (username) {
      fetch(`${BASE_URL}/api/users/${username}/presets`, { credentials: 'include' })
        .then(r => {
          if (r.ok) return r.json();
          loadFromStorage();
          return null;
        })
        .then(data => { if (data) setUserPresets(data); })
        .catch(loadFromStorage);
    } else {
      loadFromStorage();
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
        if (!r.ok) {
          r.text().then(msg => setPresetSaveError(`Preset save failed: ${msg || r.status}`));
          localStorage.setItem('userPatternPresets', JSON.stringify(updated));
        }
      }).catch(() => localStorage.setItem('userPatternPresets', JSON.stringify(updated)));
    } else {
      localStorage.setItem('userPatternPresets', JSON.stringify(updated));
    }
  };

  const handlePreset = async (key) => {
    if (inputDirty && !(await confirm('You have unsaved changes to your custom gradient. Switch anyway?'))) return;
    setInputDirty(false);
    setCustomError('');
    setPreviewStyle(null);
    setCustomInput(PRESET_PATTERNS[key].backgroundImage || '');
    const newValue = withBgColor(key === 'none' ? '' : key, bgColor);
    if (onPreview) {
      // Preview mode: show visually but wait for Apply to confirm
      setPendingPreset({ key, value: newValue });
      onPreview(newValue);
    } else {
      // Immediate apply (no preview prop = old behavior)
      setPendingPreset(null);
      onChange(newValue);
    }
  };

  const applyPendingPreset = () => {
    if (!pendingPreset) return;
    onChange(pendingPreset.value);
    setPendingPreset(null);
  };

  const cancelPendingPreset = () => {
    if (!pendingPreset) return;
    onPreview?.(value); // revert to saved value
    setPendingPreset(null);
  };

  const handleUserPreset = async (css) => {
    if (inputDirty && !(await confirm('Replace your current custom gradient with this saved preset?'))) return;
    setCustomInput(css);
    setInputDirty(false);
    setCustomError('');
    setPreviewStyle(null);
    // Auto-apply immediately
    if (isValidPattern(css)) {
      onChange(withBgColor(css, bgColor));
    }
  };

  const handleCustomChange = (e) => {
    setCustomInput(e.target.value);
    setInputDirty(true);
    setCustomError('');
    setPreviewStyle(null);
  };

  const extractParameterizedKey = useCallback((css, v) => {
    // Use only the base (strip all suffixes) to determine pattern type
    const base = typeof v === 'string' ? (stripBgColor(v) || '').split('|')[0] : '';
    const isPaw = base === 'paw-print' || base.startsWith('paw-print:');
    if (isPaw) {
      const m = css.match(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*[\d.]+)?\s*\)|#[0-9a-fA-F]{3,8}/i);
      if (m) return `paw-print:${m[0]}`;
    }
    const isStars = base === 'stars' || base.startsWith('stars:');
    if (isStars) {
      const colors = parseColors(css);
      if (colors.length >= 1) {
        const starColor = colors[0];
        const bgColor = colors.length > 1 ? colors[colors.length - 1] : null;
        return bgColor ? `stars:${starColor}:${bgColor}` : `stars:${starColor}`;
      }
    }
    return null;
  }, []);

  const handleColorEdit = useCallback((newCss) => {
    setCustomInput(newCss);
    setCustomError('');
    if (isValidPattern(newCss)) {
      const paramKey = extractParameterizedKey(newCss, value);
      if (paramKey) {
        setPreviewStyle(patternToStyle(paramKey));
        onChange(withBgColor(paramKey, bgColor));
        setInputDirty(false);
        return;
      }
      setPreviewStyle(patternToStyle(newCss));
      onChange(withBgColor(newCss, bgColor));
      setInputDirty(false);
    } else {
      setInputDirty(true);
      setPreviewStyle(null);
    }
  }, [onChange, value, extractParameterizedKey, bgColor, withBgColor]);

  const handleTest = () => {
    const v = customInput.trim();
    if (!v) { setPreviewStyle({}); return; }
    const paramKey = extractParameterizedKey(v, value);
    if (paramKey) {
      setCustomError('');
      setPreviewStyle(patternToStyle(paramKey));
      return;
    }
    // If the input exactly matches a preset's CSS, use the full preset style (incl. backgroundPosition)
    const matchedKey = findPresetByImage(v);
    if (matchedKey) {
      setCustomError('');
      setPreviewStyle(patternToStyle(matchedKey));
      return;
    }
    if (!isValidPattern(v)) {
      setCustomError('Only CSS gradient functions are allowed (e.g. linear-gradient(...)). URL and script values are blocked.');
      return;
    }
    setCustomError('');
    setPreviewStyle(patternToStyle(v));
  };

  const handleApply = () => {
    const v = customInput.trim();
    if (!v) { onChange(withBgColor('', bgColor)); setInputDirty(false); return; }
    const paramKey = extractParameterizedKey(v, value);
    if (paramKey) {
      onChange(withBgColor(paramKey, bgColor));
      setInputDirty(false);
      setPreviewStyle(null);
      return;
    }
    const matchedKey = findPresetByImage(v);
    if (matchedKey) {
      onChange(withBgColor(matchedKey === 'none' ? '' : matchedKey, bgColor));
      setInputDirty(false);
      setPreviewStyle(null);
      return;
    }
    if (!isValidPattern(v)) {
      setCustomError('Only CSS gradient functions are allowed. URL and script values are blocked.');
      return;
    }
    onChange(withBgColor(v, bgColor));
    setInputDirty(false);
    setPreviewStyle(null);
    setPendingSaveCss(v);
    setSaveName('');
    setShowSaveDialog(true);
  };

  const handleSavePreset = () => {
    if (!saveName.trim() || !pendingSaveCss.trim()) return;
    const updated = { ...userPresets, [saveName.trim()]: pendingSaveCss.trim() };
    saveUserPresets(updated);
    setSaveName('');
    setShowSaveDialog(false);
    setPendingSaveCss('');
  };

  const handleDismissSaveDialog = () => {
    setShowSaveDialog(false);
    setSaveName('');
    setPendingSaveCss('');
  };

  const deleteUserPreset = (name) => {
    const updated = { ...userPresets };
    delete updated[name];
    saveUserPresets(updated);
  };

  const handleBgColorChange = (color) => {
    setBgColor(color);
    const currentPattern = stripBgColor(value) || '';
    onChange(buildValue(currentPattern, color, scale));
  };

  const handleScaleChange = (newScale) => {
    setScale(newScale);
    const currentPattern = stripBgColor(value) || '';
    onChange(buildValue(currentPattern, bgColor, newScale));
  };

  // Build swatch inline style for a preset
  const swatchStyle = ({ backgroundImage, backgroundSize, backgroundPosition }) => {
    if (!backgroundImage) return { background: '#fff' };
    const s = { backgroundImage, backgroundSize: backgroundSize || '20px 20px' };
    if (backgroundPosition) s.backgroundPosition = backgroundPosition;
    return s;
  };

  return (
    <div className="pattern-picker">
      {/* Built-in preset swatches */}
      <div className="pattern-picker-presets">
        {Object.entries(PRESET_PATTERNS).map(([key, preset]) => {
          const isPending = pendingPreset?.key === key;
          const active = !pendingPreset && ((key === 'none' && !value) || value === key);
          return (
            <button
              key={key}
              type="button"
              className={`pattern-swatch${active ? ' pattern-swatch--active' : ''}${isPending ? ' pattern-swatch--pending' : ''}`}
              style={swatchStyle(preset)}
              title={preset.label}
              onClick={() => handlePreset(key)}
            >
              <span className="pattern-swatch-label">{preset.label}</span>
            </button>
          );
        })}
      </div>
      {pendingPreset && (
        <div className="pattern-picker-pending-bar">
          <span className="pattern-picker-pending-label">Previewing — save this wallpaper?</span>
          <button type="button" className="pattern-picker-apply-btn" onClick={applyPendingPreset}>Apply</button>
          <button type="button" className="pattern-picker-test-btn" onClick={cancelPendingPreset}>Cancel</button>
        </div>
      )}

      {/* Page background color */}
      <div className="pattern-picker-section">
        <div className="pattern-picker-section-label">Background color</div>
        <div className="pattern-color-row">
          <input
            type="color"
            className="pattern-color-hex"
            value={bgColor}
            onChange={e => handleBgColorChange(e.target.value)}
            title="Page background color"
          />
          <span className="pattern-color-label">{bgColor}</span>
          {bgColor !== DEFAULT_BG_COLOR && (
            <button
              type="button"
              className="pattern-picker-test-btn"
              style={{ marginLeft: 8 }}
              onClick={() => handleBgColorChange(DEFAULT_BG_COLOR)}
            >Reset</button>
          )}
        </div>
      </div>

      {/* Pattern tile scale */}
      <div className="pattern-picker-section">
        <div className="pattern-picker-section-label">Pattern scale &nbsp;
          <span style={{ fontWeight: 400, color: '#666' }}>{scale.toFixed(2)}×</span>
          {scale !== 1 && (
            <button type="button" className="pattern-picker-test-btn" style={{ marginLeft: 8 }}
              onClick={() => handleScaleChange(1)}>Reset</button>
          )}
        </div>
        <input
          type="range"
          min="0.25" max="4" step="0.05"
          value={scale}
          className="pattern-scale-slider"
          onChange={e => handleScaleChange(parseFloat(e.target.value))}
        />
      </div>

      {/* User saved presets */}
      {presetSaveError && <p className="pattern-picker-error">{presetSaveError}</p>}
      {Object.keys(userPresets).length > 0 && (
        <div className="pattern-picker-section">
          <div className="pattern-picker-section-label">My presets</div>
          <div className="pattern-picker-presets">
            {Object.entries(userPresets).map(([name, css]) => (
              <div key={name} className="pattern-user-preset-item">
                <button
                  type="button"
                  className="pattern-swatch"
                  style={isValidPattern(css) ? { backgroundImage: css, backgroundSize: '16px 16px' } : { background: '#eee' }}
                  title={name}
                  onClick={() => handleUserPreset(css)}
                >
                  <span className="pattern-swatch-label">{name}</span>
                </button>
                <button
                  type="button"
                  className="pattern-user-preset-delete"
                  onClick={() => deleteUserPreset(name)}
                  title="Remove"
                >×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Custom gradient input */}
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
            value={customInput}
            onChange={handleCustomChange}
            maxLength={2000}
          />
        </div>
        <div className="pattern-picker-btn-row">
          <button type="button" className="pattern-picker-test-btn" onClick={handleTest}>Test</button>
          <button type="button" className="pattern-picker-apply-btn" onClick={handleApply}>Apply</button>
        </div>

        {/* Glass save-preset dialog */}
        {showSaveDialog && (
          <div className="pattern-save-overlay" onClick={handleDismissSaveDialog}>
            <div className="pattern-save-dialog" onClick={e => e.stopPropagation()}>
              <p className="pattern-save-dialog-title">Save as preset?</p>
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
                <button type="button" className="pattern-save-dialog-cancel" onClick={handleDismissSaveDialog}>Skip</button>
                <button type="button" className="pattern-save-dialog-save" onClick={handleSavePreset} disabled={!saveName.trim()}>Save preset</button>
              </div>
            </div>
          </div>
        )}
        {customError && <p className="pattern-picker-error">{customError}</p>}
        {previewStyle !== null && (
          <div
            className="pattern-picker-custom-preview"
            style={(() => {
              if (!previewStyle || Object.keys(previewStyle).filter(k => k !== '_bgColor').length === 0)
                return { background: '#f5f5f5' };
              const { _bgColor, ...rest } = previewStyle;
              return { ...rest, ...((_bgColor) ? { backgroundColor: _bgColor } : {}) };
            })()}
          />
        )}
        {customInput.trim() && (
          <ColorEditors css={customInput} onChange={handleColorEdit} />
        )}
      </div>
    </div>
  );
}
