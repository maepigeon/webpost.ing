import { useMemo, useRef, useState, useEffect } from 'react';
import TileGrid from '../PostRenderer/RichTextPost/TileGrid/TileGrid.jsx';
import { bannerInfo, BANNER_COLS, INFO_ROWS } from './bannerGrid.js';
import './ProfileBanner.css';

/** Banner width (px) from which its own rows use narrow letters. */
const NARROW_FROM = 560;

/**
 * The top of a profile: a tile grid 32 tiles wide. The first four rows are
 * the site's (who, follow counts, join date, public posts) with the avatar on
 * the right across them; under them, the owner's own rows, drawn in the grid
 * editor on the Customize page.
 *
 * The follow counts open their lists, and the avatar its popup, as before.
 */
export default function ProfileBanner({
  username, followers, following, joined, publicPosts, grid,
  avatarSrc, online, onAvatarClick, onFollowers, onFollowing,
}) {
  // Letters two to a tile while the banner is wide enough to read them so;
  // one to a tile on a phone, where narrow ones would be too small.
  const ref = useRef(null);
  const [narrow, setNarrow] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width >= NARROW_FROM));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const info = useMemo(
    () => bannerInfo({ username, followers, following, joined, publicPosts, narrow }),
    [username, followers, following, joined, publicPosts, narrow]);
  const at = (h) => ({ left: `${h.from * 100}%`, width: `${(h.to - h.from) * 100}%`, top: `${100 / INFO_ROWS}%`, height: `${100 / INFO_ROWS}%` });

  return (
    <div className="profile-banner" ref={ref}>
      <h1 className="visually-hidden">{username}</h1>
      <div className="profile-banner-info" role="group" aria-label={info.label}>
        <TileGrid data={info.grid} editable={false} onChange={() => {}} linksActive={false} />
        {info.hits && (
          <>
            <button type="button" className="profile-banner-hit" style={at(info.hits.followers)} onClick={onFollowers}
              aria-label={`${followers} followers: show them`} />
            <button type="button" className="profile-banner-hit" style={at(info.hits.following)} onClick={onFollowing}
              aria-label={`${following} following: show them`} />
          </>
        )}
        <button type="button" className="profile-banner-avatar" onClick={onAvatarClick}
          style={{ width: `${(INFO_ROWS / BANNER_COLS) * 100}%` }} aria-label={`${username}'s profile picture`}>
          {avatarSrc
            ? <img src={avatarSrc} alt="" className="squircle" />
            : <span className="profile-banner-initial squircle" aria-hidden="true">{username?.[0]?.toUpperCase()}</span>}
          {online && <span className="profile-banner-online" title="Online" />}
        </button>
      </div>
      {grid && (
        <div className="profile-banner-rows">
          <TileGrid data={grid} editable={false} onChange={() => {}} />
        </div>
      )}
    </div>
  );
}
