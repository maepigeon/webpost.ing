import { useState, useRef, useEffect, useCallback } from 'react';
import { PRESET_PATTERNS, isValidPattern, patternToStyle, findPresetByImage, pawImage, PAW_DEFAULT_COLOR, starsImage, STARS_DEFAULT_COLOR, STARS_DEFAULT_BG } from './patterns.js';
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
 *   onChange    — called with new value when the user picks/applies a pattern
 *   username    — if provided, user presets are loaded from / saved to the backend
 */
export default function PatternPicker({ value, onChange, username }) {
  // Reflect the active value's CSS in the custom input
  const cssForValue = (v) => {
    if (!v || v === 'none') return '';
    if (v in PRESET_PATTERNS) return PRESET_PATTERNS[v].backgroundImage || '';
    if (v.startsWith('paw-print:')) return pawImage(v.slice('paw-print:'.length).trim());
    if (v.startsWith('stars:')) {
      const rest = v.slice('stars:'.length);
      const idx = rest.indexOf(':');
      const sc = idx >= 0 ? rest.slice(0, idx) : rest;
      const bc = idx >= 0 ? rest.slice(idx + 1) : STARS_DEFAULT_BG;
      return starsImage(sc, bc);
    }
    return v;
  };

  const [customInput, setCustomInput] = useState(() => cssForValue(value));
  const [customError, setCustomError] = useState('');
  const [inputDirty, setInputDirty] = useState(false);
  const [previewStyle, setPreviewStyle] = useState(null);

  // User-saved presets — loaded from backend (or localStorage as fallback)
  const [userPresets, setUserPresets] = useState({});
  const [saveName, setSaveName] = useState('');
  const [showSave, setShowSave] = useState(false);

  // Load user presets on mount
  useEffect(() => {
    if (username) {
      fetch(`/api/users/${username}/presets`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setUserPresets(data); })
        .catch(() => {
          // Fall back to localStorage
          try { setUserPresets(JSON.parse(localStorage.getItem('userPatternPresets') || '{}')); }
          catch { /* ignore */ }
        });
    } else {
      try { setUserPresets(JSON.parse(localStorage.getItem('userPatternPresets') || '{}')); }
      catch { /* ignore */ }
    }
  }, [username]);

  const saveUserPresets = (updated) => {
    setUserPresets(updated);
    if (username) {
      fetch(`/api/users/${username}/presets`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      }).catch(() => localStorage.setItem('userPatternPresets', JSON.stringify(updated)));
    } else {
      localStorage.setItem('userPatternPresets', JSON.stringify(updated));
    }
  };

  const handlePreset = (key) => {
    if (inputDirty && !window.confirm('You have unsaved changes to your custom gradient. Switch anyway?')) return;
    setInputDirty(false);
    setCustomError('');
    setPreviewStyle(null);
    setCustomInput(PRESET_PATTERNS[key].backgroundImage || '');
    onChange(key === 'none' ? '' : key);
  };

  const handleUserPreset = (css) => {
    if (inputDirty && !window.confirm('Replace your current custom gradient with this saved preset?')) return;
    setCustomInput(css);
    setInputDirty(true);
    setCustomError('');
    setPreviewStyle(null);
  };

  const handleCustomChange = (e) => {
    setCustomInput(e.target.value);
    setInputDirty(true);
    setCustomError('');
    setPreviewStyle(null);
  };

  const extractParameterizedKey = useCallback((css, v) => {
    const isPaw = typeof v === 'string' && (v === 'paw-print' || v.startsWith('paw-print:'));
    if (isPaw) {
      const m = css.match(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*[\d.]+)?\s*\)|#[0-9a-fA-F]{3,8}/i);
      if (m) return `paw-print:${m[0]}`;
    }
    const isStars = typeof v === 'string' && (v === 'stars' || v.startsWith('stars:'));
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
        onChange(paramKey);
        setInputDirty(false);
        return;
      }
      setPreviewStyle(patternToStyle(newCss));
      onChange(newCss);
      setInputDirty(false);
    } else {
      setInputDirty(true);
      setPreviewStyle(null);
    }
  }, [onChange, value, extractParameterizedKey]);

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
    if (!v) { onChange(''); setInputDirty(false); return; }
    const paramKey = extractParameterizedKey(v, value);
    if (paramKey) {
      onChange(paramKey);
      setInputDirty(false);
      setPreviewStyle(null);
      return;
    }
    // If CSS exactly matches a preset's backgroundImage, store the preset key instead
    const matchedKey = findPresetByImage(v);
    if (matchedKey) {
      onChange(matchedKey === 'none' ? '' : matchedKey);
      setInputDirty(false);
      setPreviewStyle(null);
      return;
    }
    if (!isValidPattern(v)) {
      setCustomError('Only CSS gradient functions are allowed. URL and script values are blocked.');
      return;
    }
    onChange(v);
    setInputDirty(false);
    setPreviewStyle(null);
  };

  const handleSavePreset = () => {
    if (!saveName.trim() || !customInput.trim()) return;
    const updated = { ...userPresets, [saveName.trim()]: customInput.trim() };
    saveUserPresets(updated);
    setSaveName('');
    setShowSave(false);
  };

  const deleteUserPreset = (name) => {
    const updated = { ...userPresets };
    delete updated[name];
    saveUserPresets(updated);
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
          const active = (key === 'none' && !value) || value === key;
          return (
            <button
              key={key}
              type="button"
              className={`pattern-swatch${active ? ' pattern-swatch--active' : ''}`}
              style={swatchStyle(preset)}
              title={preset.label}
              onClick={() => handlePreset(key)}
            >
              <span className="pattern-swatch-label">{preset.label}</span>
            </button>
          );
        })}
      </div>

      {/* User saved presets */}
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
          {customInput.trim() && (
            <button type="button" className="pattern-picker-save-btn" onClick={() => setShowSave(s => !s)}>
              {showSave ? 'Cancel' : '+ Save preset'}
            </button>
          )}
        </div>
        {showSave && (
          <div className="pattern-picker-save-row">
            <input
              type="text"
              className="pattern-picker-name-input"
              placeholder="Preset name"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSavePreset()}
              maxLength={40}
            />
            <button type="button" className="pattern-picker-apply-btn" onClick={handleSavePreset}>Save</button>
          </div>
        )}
        {customError && <p className="pattern-picker-error">{customError}</p>}
        {previewStyle !== null && (
          <div
            className="pattern-picker-custom-preview"
            style={previewStyle && Object.keys(previewStyle).length > 0
              ? previewStyle
              : { background: '#f5f5f5' }}
          />
        )}
        {customInput.trim() && (
          <ColorEditors css={customInput} onChange={handleColorEdit} />
        )}
      </div>
    </div>
  );
}
