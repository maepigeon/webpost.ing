import React from 'react';
import { GET_RECENTLY_ACTIVE_USERS, GET_USER_AVATAR } from '../Posts/BasicTextPostServerApi.js';
import { IMAGES_BASE_URL } from '../../../config.js';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import WaterTitle from './WaterTitle.jsx';
import { usePageTitle } from '../../../utils/usePageTitle.js';
import './Home.css';

function UserCard({ username }) {
  const [avatarSrc, setAvatarSrc] = useState(null);
  useEffect(() => {
    GET_USER_AVATAR(username)
      .then(d => setAvatarSrc(d?.avatarPath ? IMAGES_BASE_URL + d.avatarPath : null))
      .catch(() => {});
  }, [username]);

  return (
    <Link className="home-user-card" to={`/users/${username}`}>
      <div className="home-user-avatar">
        {avatarSrc
          ? <img src={avatarSrc} alt={username} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
          : username?.[0]?.toUpperCase()
        }
      </div>
      <span className="home-user-name">{username}</span>
    </Link>
  );
}

function Home() {
  usePageTitle('Home');
  const [usersArray, setUsersArray] = useState([]);
  const loggedIn = !!localStorage.getItem('userName');

  useEffect(() => {
    GET_RECENTLY_ACTIVE_USERS().then(data => setUsersArray(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  return (
    <div className="home-page">
      {/* ── Hero ── */}
      <section className="home-hero">
        <WaterTitle text="webpost.ing" className="home-water-title" />
        <p className="home-hero-sub">
          A cozy, invite-only corner of the web for writing, sharing ideas,
          and connecting with others.
        </p>
        <div className="home-hero-actions">
          {loggedIn ? (
            <Link to="/editor" className="home-cta-btn home-cta-btn--write">
              Write something
            </Link>
          ) : (
            <Link to="/routes/Login" className="home-cta-btn home-cta-btn--primary">
              Log in →
            </Link>
          )}
          <Link to="/search" className="home-cta-btn home-cta-btn--secondary">
            Browse posts
          </Link>
        </div>
      </section>

      {/* ── Users ── */}
      <div className="home-divider">
        <span className="home-divider-line" />
        <span className="home-divider-text">Recently online</span>
        <span className="home-divider-line" />
      </div>

      <section className="home-users-section">
        {usersArray.length === 0
          ? <p style={{ color: '#aaa', textAlign: 'center', padding: '24px 0', fontSize: '0.9rem' }}>No users yet.</p>
          : (
            <div className={`home-users-grid${usersArray.length < 5 ? ' home-users-grid--centered' : ''}`}>
              {usersArray.map((record, i) => (
                <UserCard key={i} username={record.username} />
              ))}
            </div>
          )
        }
      </section>

      {/* ── Footer ── */}
      <footer className="home-footer">
        <p style={{ margin: 0 }}>
          Created by <a href="https://www.maepigeon.com">Mae Pigeon</a>
          {' · '}
          <a href="https://github.com/maepigeon/webpost.ing/">GitHub</a>
        </p>
      </footer>
    </div>
  );
}

export default Home;
