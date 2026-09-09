import { useEffect, useState } from 'react';
import { LIST_MY_UPLOADS } from '../Pages/Posts/BasicTextPostServerApi.js';
import { IMAGES_BASE_URL } from '../../config.js';
import { prefixSrcset } from '../../utils/responsiveImage.js';
import './ImagePicker.css';

/**
 * Choose an image: one already uploaded, or a new file.
 *
 * Re-uploading the same picture is the common case — a header, a logo, a
 * diagram reused across posts — and each copy costs the user storage quota and
 * the server a duplicate file. Offering the library first makes reuse the easy
 * path rather than the one nobody knows about.
 *
 * @param {Function} onSelect  called with { url, srcset, name } for a library pick
 * @param {Function} onUpload  called with a File when the user picks a new one
 * @param {Function} onClose
 */
export default function ImagePicker({ onSelect, onUpload, onClose }) {
  const [images, setImages] = useState(null);   // null = still loading
  const [error, setError] = useState('');

  useEffect(() => {
    LIST_MY_UPLOADS()
      .then(data => setImages(data.images || []))
      .catch(() => { setError('Could not load your images.'); setImages([]); });
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="imgpick-overlay" onMouseDown={onClose}>
      <div className="imgpick-dialog" onMouseDown={e => e.stopPropagation()} role="dialog" aria-label="Choose an image">
        <div className="imgpick-header">
          <p className="imgpick-title">Choose an image</p>
          <label className="imgpick-upload">
            Upload a new one
            <input
              type="file"
              accept="image/*"
              onChange={e => { const f = e.target.files[0]; e.target.value = ''; if (f) onUpload(f); }}
            />
          </label>
        </div>

        {images === null && <p className="imgpick-status">Loading your images…</p>}
        {error && <p className="imgpick-error">{error}</p>}

        {images !== null && images.length === 0 && !error && (
          <p className="imgpick-status">
            You have not uploaded any images yet. Upload one and it will appear here
            next time.
          </p>
        )}

        {images !== null && images.length > 0 && (
          <ul className="imgpick-grid">
            {images.map(image => (
              <li key={image.id}>
                <button
                  type="button"
                  className="imgpick-item"
                  onClick={() => onSelect(image)}
                  title={image.name || 'Untitled image'}
                >
                  <img
                    src={IMAGES_BASE_URL + image.url}
                    srcSet={prefixSrcset(image.srcset, IMAGES_BASE_URL)}
                    sizes="160px"
                    alt={image.name || ''}
                    loading="lazy"
                    decoding="async"
                  />
                  <span className="imgpick-name">{image.name || 'Untitled'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="imgpick-actions">
          <button type="button" className="imgpick-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
