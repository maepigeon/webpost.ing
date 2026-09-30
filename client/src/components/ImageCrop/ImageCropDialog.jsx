import { useEffect, useRef, useState, useCallback } from 'react';
import './ImageCropDialog.css';

/**
 * Crop an image before it is uploaded.
 *
 * Cropping client-side means the server never receives the discarded pixels,
 * so trimming a 6 MB photo down to a detail is not blocked by the upload size
 * limit for bytes that were going to be thrown away anyway.
 *
 * Deliberately dependency-free: a canvas and pointer events do the whole job,
 * and the usual libraries for this are larger than the file you are reading.
 *
 * @param {File}     file      the image the user picked
 * @param {Function} onCancel  called if they back out
 * @param {Function} onConfirm called with a File — the cropped image, or the
 *                             original untouched if they chose not to crop
 */
export default function ImageCropDialog({ file, onCancel, onConfirm }) {
  const [imageUrl, setImageUrl] = useState(null);
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [aspect, setAspect] = useState('free');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Crop rectangle in *displayed* pixels; converted to natural pixels on apply.
  const [crop, setCrop] = useState(null);

  const imgRef = useRef(null);
  const frameRef = useRef(null);
  const dragRef = useRef(null);

  // Object URLs leak until revoked, and one editor session can open many.
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onImageLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    setNatural({ width: img.naturalWidth, height: img.naturalHeight });
    const w = img.clientWidth * 0.8;
    const h = img.clientHeight * 0.8;
    setCrop({ x: (img.clientWidth - w) / 2, y: (img.clientHeight - h) / 2, w, h });
  };

  /** Clamps a crop box inside the displayed image and honours the aspect lock. */
  const constrain = useCallback((next) => {
    const img = imgRef.current;
    if (!img) return next;
    const maxW = img.clientWidth;
    const maxH = img.clientHeight;
    const ratio = aspect === 'free' ? null : (() => {
      const [aw, ah] = aspect.split(':').map(Number);
      return ah / aw;
    })();

    let { x, y, w, h } = next;
    w = Math.max(24, w);
    h = Math.max(24, h);
    if (ratio) h = w * ratio;

    if (w > maxW) { w = maxW; if (ratio) h = w * ratio; }
    if (h > maxH) { h = maxH; if (ratio) w = h / ratio; }

    x = Math.min(Math.max(0, x), maxW - w);
    y = Math.min(Math.max(0, y), maxH - h);
    return { x, y, w, h };
  }, [aspect]);

  // Re-apply the constraint when the aspect lock changes.
  useEffect(() => { setCrop(c => (c ? constrain(c) : c)); }, [aspect, constrain]);

  const startDrag = (mode) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!frameRef.current || !crop) return;
    const rect = frameRef.current.getBoundingClientRect();
    dragRef.current = {
      mode,
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      origin: { ...crop },
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = frameRef.current.getBoundingClientRect();
    const dx = (e.clientX - rect.left) - drag.startX;
    const dy = (e.clientY - rect.top) - drag.startY;
    const o = drag.origin;

    if (drag.mode === 'move') {
      setCrop(constrain({ ...o, x: o.x + dx, y: o.y + dy }));
      return;
    }
    // Resize from the dragged corner, keeping the opposite corner fixed.
    let { x, y, w, h } = o;
    if (drag.mode.includes('e')) w = o.w + dx;
    if (drag.mode.includes('s')) h = o.h + dy;
    if (drag.mode.includes('w')) { w = o.w - dx; x = o.x + dx; }
    if (drag.mode.includes('n')) { h = o.h - dy; y = o.y + dy; }
    setCrop(constrain({ x, y, w, h }));
  };

  const endDrag = () => { dragRef.current = null; };

  /** Renders the selected region to a canvas and hands back a File. */
  const apply = async () => {
    const img = imgRef.current;
    if (!img || !crop) return;
    setBusy(true);
    setError('');
    try {
      const scale = natural.width / img.clientWidth;
      const sx = Math.round(crop.x * scale);
      const sy = Math.round(crop.y * scale);
      const sw = Math.max(1, Math.round(crop.w * scale));
      const sh = Math.max(1, Math.round(crop.h * scale));

      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d');

      // PNG keeps transparency; anything else is flattened onto white so a
      // transparent source does not come out black once encoded as JPEG.
      const isPng = file.type === 'image/png';
      if (!isPng) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, sw, sh);
      }
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

      const type = isPng ? 'image/png' : 'image/jpeg';
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          b => (b ? resolve(b) : reject(new Error('Could not render the crop'))),
          type,
          isPng ? undefined : 0.92,
        );
      });

      const base = (file.name || 'image').replace(/\.[^.]+$/, '');
      onConfirm(new File([blob], `${base}-cropped.${isPng ? 'png' : 'jpg'}`, { type }));
    } catch (err) {
      setError(err?.message || 'Could not crop this image.');
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const scale = natural.width && imgRef.current?.clientWidth
    ? natural.width / imgRef.current.clientWidth
    : null;
  const cropPx = crop && scale
    ? { w: Math.round(crop.w * scale), h: Math.round(crop.h * scale) }
    : null;

  return (
    <div className="crop-overlay" onMouseDown={onCancel}>
      <div className="crop-dialog" onMouseDown={e => e.stopPropagation()} role="dialog" aria-label="Crop image">
        <p className="crop-title">Crop image</p>

        <div
          className="crop-frame"
          ref={frameRef}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
        >
          {imageUrl && (
            <img ref={imgRef} src={imageUrl} alt="" className="crop-image"
                 onLoad={onImageLoad} draggable={false} />
          )}
          {crop && (
            <>
              {/* Four panels dim everything outside the selection. */}
              <div className="crop-shade" style={{ left: 0, top: 0, right: 0, height: crop.y }} />
              <div className="crop-shade" style={{ left: 0, top: crop.y + crop.h, right: 0, bottom: 0 }} />
              <div className="crop-shade" style={{ left: 0, top: crop.y, width: crop.x, height: crop.h }} />
              <div className="crop-shade" style={{ left: crop.x + crop.w, top: crop.y, right: 0, height: crop.h }} />

              <div
                className="crop-box"
                style={{ left: crop.x, top: crop.y, width: crop.w, height: crop.h }}
                onPointerDown={startDrag('move')}
              >
                {['nw', 'ne', 'sw', 'se'].map(corner => (
                  <span key={corner}
                        className={`crop-handle crop-handle--${corner}`}
                        onPointerDown={startDrag(corner)} />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="crop-controls">
          <span className="crop-controls-label">Ratio</span>
          {[['free', 'Free'], ['1:1', 'Square'], ['4:3', '4:3'], ['16:9', '16:9'], ['3:4', 'Portrait']].map(([value, label]) => (
            <button key={value} type="button"
                    className={`crop-ratio-btn${aspect === value ? ' crop-ratio-btn--active' : ''}`}
                    onClick={() => setAspect(value)}>{label}</button>
          ))}
          {cropPx && <span className="crop-dimensions">{cropPx.w} × {cropPx.h}</span>}
        </div>

        {error && <p className="crop-error">{error}</p>}

        <div className="crop-actions">
          <button type="button" className="crop-btn crop-btn--ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="crop-btn crop-btn--ghost" onClick={() => onConfirm(file)} disabled={busy}>
            Upload original
          </button>
          <button type="button" className="crop-btn crop-btn--primary" onClick={apply} disabled={busy || !crop}>
            {busy ? 'Cropping…' : 'Crop & upload'}
          </button>
        </div>
      </div>
    </div>
  );
}
