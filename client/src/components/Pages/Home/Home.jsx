import { Link } from 'react-router-dom';
import { usePageTitle } from '../../../utils/usePageTitle.js';
import WaterTitle from './WaterTitle.jsx';
import './Home.css';

function Home() {
  usePageTitle('Home');

  return (
    <div className="home-page">
      <section className="home-hero">
        <WaterTitle text="webpost.ing" className="home-water-title" />
        <p className="home-hero-sub">
          Hi! This is <Link to="/maepigeon">Mae Pigeon</Link>'s blog authoring website. I created this to be
          my own, custom, personal blog platform. I began by coding it myself,
          but switched to vibecoding it using AI to get it into more practical
          form and develop features when I don't have the time to.
        </p>
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
