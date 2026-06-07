import { useState, useEffect } from 'react';
import { GET_FOLLOW_STATUS, FOLLOW_USER, UNFOLLOW_USER } from '../Pages/Posts/BasicTextPostServerApi.js';
import './Social.css';

export default function FollowButton({ username }) {
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const loggedIn = !!localStorage.getItem('userName');
  const isOwnProfile = localStorage.getItem('userName') === username;

  useEffect(() => {
    if (!loggedIn || isOwnProfile) { setLoading(false); return; }
    GET_FOLLOW_STATUS(username)
      .then(d => { setFollowing(d.following); setLoading(false); })
      .catch(() => setLoading(false));
  }, [username, loggedIn, isOwnProfile]);

  if (!loggedIn || isOwnProfile) return null;

  const toggle = async () => {
    setLoading(true);
    try {
      if (following) { await UNFOLLOW_USER(username); setFollowing(false); }
      else { await FOLLOW_USER(username); setFollowing(true); }
    } catch {}
    setLoading(false);
  };

  return (
    <button
      className={`follow-btn${following ? ' follow-btn--following' : ''}`}
      onClick={toggle}
      disabled={loading}
    >
      {loading ? '…' : following ? 'Following' : 'Follow'}
    </button>
  );
}
