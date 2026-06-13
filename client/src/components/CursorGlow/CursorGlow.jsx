import { useEffect, useRef } from 'react';
import './CursorGlow.css';

export default function CursorGlow() {
  const glowRef = useRef(null);
  const raf = useRef(null);
  const pos = useRef(null);

  useEffect(() => {
    const el = glowRef.current;
    if (!el) return;

    const onMove = (e) => {
      if (!pos.current) {
        // Reveal on first move
        el.style.opacity = '1';
      }
      pos.current = { x: e.clientX, y: e.clientY };
    };

    const render = () => {
      if (pos.current) {
        el.style.transform = `translate(${pos.current.x}px, ${pos.current.y}px)`;
      }
      raf.current = requestAnimationFrame(render);
    };

    document.addEventListener('mousemove', onMove, { passive: true });
    raf.current = requestAnimationFrame(render);

    return () => {
      document.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  return <div className="cursor-glow" ref={glowRef} aria-hidden="true" />;
}
