import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { usePageTitle } from '../../../utils/usePageTitle.js';
import WaterTitle from './WaterTitle.jsx';
import { textGrid } from '../../../utils/gridText.js';
import './Home.css';

// The grid component is the whole grid editor; the welcome only shows a grid,
// so it is fetched on its own, after the page, and not with the first script.
const TileGrid = lazy(() => import('../Posts/PostRenderer/RichTextPost/TileGrid/TileGrid.jsx'));

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

  return (
    <div className="home-page">
      <section className="home-hero">
        <WaterTitle text="webpost.ing" className="home-water-title" />
        <div className="home-hero-sub" role="group" aria-label={ABOUT}>
          {/* Until it arrives, an empty box of the grid's own shape, so nothing below moves. */}
          <Suspense fallback={<div style={{ aspectRatio: `${grid.cols} / ${grid.rows}` }} aria-hidden="true" />}>
            <TileGrid data={grid} editable={false} onChange={() => {}} />
          </Suspense>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="home-footer">
        <p style={{ margin: 0 }}>
          Created by <a href="https://www.maepigeon.com">Mae Pigeon</a>
        </p>
      </footer>
    </div>
  );
}

export default Home;
