import './StorageSummary.css';

export function fmtBytes(n) {
  const v0 = Number(n) || 0;
  if (v0 === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0, v = v0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${i === 0 ? v : v.toFixed(1)} ${units[i]}`;
}

/** What each section and item is called, in the order shown. */
const SECTIONS = [
  ['files', 'Files', { postImages: 'Images in posts', audio: 'Audio', profilePicture: 'Profile picture', headerImage: 'Card background image' }],
  ['posts', 'Posts', { content: 'Writing and grids', themes: 'Post themes', wallpapers: 'Post wallpapers' }],
  ['profile', 'Profile', { banner: 'Banner', theme: 'Page theme', wallpaper: 'Wallpaper', bio: 'Bio', links: 'Links', wallpaperPresets: 'Saved wallpapers' }],
  ['library', 'Library', { stickers: 'Stickers', pixelFonts: 'Pixel fonts', sharedPacks: 'Packs you shared' }],
  ['social', 'Messages and comments', { comments: 'Comments', messages: 'Messages you sent', notifications: 'Notifications' }],
];

/**
 * A user's storage (owner and admins only): how much of the file allowance
 * is used, and, folded away, everything they keep, by section. The figures
 * come from the server's one account of storage (StorageAccountService).
 */
export default function StorageSummary({ storage }) {
  const quota = storage.quota || {};
  const limit = quota.limitBytes ?? null;
  const used = Number(quota.usedBytes ?? storage.uploadBytes ?? 0);
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : null;
  const sections = storage.sections || {};

  return (
    <div className="storage-summary">
      <div className="storage-quota">
        <span>Files: <strong>{fmtBytes(used)}</strong>{limit > 0 ? ` of ${fmtBytes(limit)}` : ''}</span>
        {pct !== null && (
          <span className="storage-meter" role="meter" aria-label="Files used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
            <span className={`storage-meter-fill${pct > 85 ? ' is-high' : ''}`} style={{ width: `${pct}%` }} />
          </span>
        )}
      </div>
      {storage.sections && (
        <details className="storage-details">
          <summary>All your storage: {fmtBytes(storage.totalBytes)}</summary>
          <p className="storage-note">
            Only files count toward your allowance. The site also keeps smaller copies of your
            images ({fmtBytes(sections.files?.renditionBytes)}), which don&rsquo;t count.
          </p>
          <dl className="storage-sections">
            {SECTIONS.map(([key, title, names]) => {
              const section = sections[key];
              if (!section) return null;
              return (
                <div key={key} className="storage-section">
                  <dt>{title} <span>{fmtBytes(section.bytes)}</span></dt>
                  {Object.entries(names).map(([item, label]) => {
                    const it = section.items?.[item];
                    if (!it || (!it.bytes && !it.count)) return null;
                    return (
                      <dd key={item}>
                        <span>{label}{it.count > 1 ? ` (${it.count})` : ''}</span>
                        <span>{fmtBytes(it.bytes)}</span>
                      </dd>
                    );
                  })}
                </div>
              );
            })}
          </dl>
        </details>
      )}
    </div>
  );
}
