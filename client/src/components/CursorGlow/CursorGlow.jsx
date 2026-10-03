import { useEffect, useRef } from 'react';
import { createFrameLoop } from '../../utils/frameLoop.js';
import './CursorGlow.css';

export default function CursorGlow() {
  const glowRef = useRef(null);
  const pos = useRef(null);

  useEffect(() => {
    const el = glowRef.current;
    if (!el) return undefined;

    // One frame for each burst of pointer movement, and none while the pointer
    // rests, the tab is hidden, or the visitor asks for reduced motion (the
    // glow then stays hidden). It used to ask for a frame 60 times a second
    // for as long as the site was open.
    const loop = createFrameLoop(() => {
      if (pos.current) el.style.transform = `translate(${pos.current.x}px, ${pos.current.y}px)`;
      return false;
    }, {
      onStill: () => { pos.current = null; el.style.opacity = ''; },
    });

    const onMove = (e) => {
      if (!loop.wake()) return;
      if (!pos.current) {
        // Reveal on first move
        el.style.opacity = '1';
      }
      pos.current = { x: e.clientX, y: e.clientY };
    };

    document.addEventListener('mousemove', onMove, { passive: true });

    return () => {
      document.removeEventListener('mousemove', onMove);
      loop.stop();
    };
  }, []);

  return <div className="cursor-glow" ref={glowRef} aria-hidden="true" />;
}
