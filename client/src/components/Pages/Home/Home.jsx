import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '../../../utils/usePageTitle.js';
import WaterTitle from './WaterTitle.jsx';
import TileGrid from '../Posts/PostRenderer/RichTextPost/TileGrid/TileGrid.jsx';
import { textGrid } from '../../../utils/gridText.js';
import { GET_RECENTLY_ACTIVE_USERS, GET_USER_AVATAR } from '../Posts/BasicTextPostServerApi.js';
import { IMAGES_BASE_URL } from '../../../config.js';
import './Home.css';

const TAGLINE = 'A place to post writing, pixel art and grids on a page that looks the way you want.';
const INK = '#333333';
const mini = (text, cols) => textGrid(text, { cols, color: INK, font: 'pixel' });

// Small live pictures for the "What you can make" cards, built from text.
const CARDS = [
  { title: 'Posts', text: 'Each post can have its own theme: colours, fonts and background.', art: () => mini('Aa Post', 4) },
  { title: 'Grids', text: '16x16 tiles of pixel art and text.', art: () => mini('16x16', 3) },
  { title: 'Profiles', text: 'Banner, wallpaper, stickers.', art: () => mini('@you', 2) },
  { title: 'Messages', text: 'Comments and private messages.', art: () => mini('hi!', 2) },
];

function Person({ username }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let live = true;
    GET_USER_AVATAR(username)
      .then(d => { if (live) setSrc(d?.avatarPath ? IMAGES_BASE_URL + d.avatarPath : null); })
      .catch(() => {});
    return () => { live = false; };
  }, [username]);
  return (
    <Link to={`/${username}`} className="home-person">
      <span className="home-person-avatar" aria-hidden="true">
        {src ? <img src={src} alt="" /> : username?.[0]?.toUpperCase()}
      </span>
      <span className="home-person-name">{username}</span>
    </Link>
  );
}

const ABOUT = "Hi! This is Mae Pigeon's blog authoring website. I created this to be my own, custom, personal blog platform. I began by coding it myself, but switched to vibecoding it using AI to get it into more practical form and develop features when I don't have the time to.";

// The welcome is a grid like the site's other pictures: transparent, the
// page's ink, "Mae Pigeon" a link to her profile. On a narrow screen it has
// fewer, bigger tiles and full-height letters, so it stays readable.
const aboutGrid = (narrow) => textGrid(ABOUT, narrow
  ? { cols: 14, color: '#333333', font: 'pixel', links: [{ text: 'Mae Pigeon', href: '/maepigeon' }] }
  : { cols: 28, color: '#333333', font: 'small', links: [{ text: 'Mae Pigeon', href: '/maepigeon' }] });
const NARROW = '(max-width: 600px)';

function Home() {
  usePageTitle('Home');
  const [narrow, setNarrow] = useState(() => window.matchMedia?.(NARROW).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(NARROW);
    if (!mq) return undefined;
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const grid = useMemo(() => aboutGrid(narrow), [narrow]);
  const cards = useMemo(() => CARDS.map(c => ({ ...c, grid: c.art() })), []);
  const signedIn = !!localStorage.getItem('userName');
  const [people, setPeople] = useState([]);
  useEffect(() => {
    GET_RECENTLY_ACTIVE_USERS()
      .then(d => setPeople(Array.isArray(d) ? d.slice(0, 12) : []))
      .catch(() => {});
  }, []);

  return (
    <div className="home-page">
      <section className="home-hero">
        <WaterTitle text="webpost.ing" className="home-water-title" />
        <div className="home-hero-sub" role="group" aria-label={ABOUT}>
          <TileGrid data={grid} editable={false} onChange={() => {}} />
        </div>
        <p className="home-tagline">{TAGLINE}</p>
        <div className="home-cta">
          {signedIn ? (
            <>
              <Link to="/editor" className="home-btn home-btn--primary">New post</Link>
              <Link to="/discover" className="home-btn">Discover</Link>
            </>
          ) : (
            <>
              <Link to="/routes/NewAccount" className="home-btn home-btn--primary">Create an account</Link>
              <Link to="/discover" className="home-btn">Look around</Link>
            </>
          )}
        </div>
      </section>

      <section className="home-section" aria-labelledby="home-make">
        <h2 id="home-make" className="home-h2">What you can make</h2>
        <ul className="home-cards">
          {cards.map(c => (
            <li key={c.title} className="home-card">
              <div className="home-card-art" aria-hidden="true">
                <TileGrid data={c.grid} editable={false} onChange={() => {}} />
              </div>
              <h3 className="home-card-title">{c.title}</h3>
              <p className="home-card-text">{c.text}</p>
            </li>
          ))}
        </ul>
      </section>

      {people.length > 0 && (
        <section className="home-section" aria-labelledby="home-here">
          <h2 id="home-here" className="home-h2">Recently here</h2>
          <div className="home-people">
            {people.map(u => <Person key={u.username} username={u.username} />)}
          </div>
          <Link to="/discover?tab=people" className="home-more">See everyone</Link>
        </section>
      )}

      {/* ── Footer ── */}
      <footer className="home-footer">
        <p style={{ margin: 0 }}>
          Created by <a href="https://www.maepigeon.com">Mae Pigeon</a>
          {' · '}
          <a href="https://github.com/maepigeon/webpost.ing/">GitHub</a>
          {' · '}
          <Link to="/search">Search</Link>
          {' · '}
          <Link to="/stickers">Stickers</Link>
        </p>
      </footer>
    </div>
  );
}

export default Home;
