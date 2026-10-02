import { usePageTitle } from '../../../utils/usePageTitle.js';
import WaterTitle from './WaterTitle.jsx';
import TileGrid from '../Posts/PostRenderer/RichTextPost/TileGrid/TileGrid.jsx';
import { textGrid } from '../../../utils/gridText.js';
import './Home.css';

const ABOUT = "Hi! This is Mae Pigeon's blog authoring website. I created this to be my own, custom, personal blog platform. I began by coding it myself, but switched to vibecoding it using AI to get it into more practical form and develop features when I don't have the time to.";

// The welcome is a grid like the site's other pictures: transparent, the
// page's ink, "Mae Pigeon" a link to her profile.
const aboutGrid = textGrid(ABOUT, { cols: 28, color: '#333333', font: 'small', links: [{ text: 'Mae Pigeon', href: '/maepigeon' }] });

function Home() {
  usePageTitle('Home');

  return (
    <div className="home-page">
      <section className="home-hero">
        <WaterTitle text="webpost.ing" className="home-water-title" />
        <div className="home-hero-sub" role="group" aria-label={ABOUT}>
          <TileGrid data={aboutGrid} editable={false} onChange={() => {}} />
        </div>
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
