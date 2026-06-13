import { useEffect, useRef } from 'react';

export default function WaterTitle({ text = 'webpost.ing', className }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const W = Math.round(canvas.offsetWidth * dpr) || 600;
    const H = Math.round(canvas.offsetHeight * dpr) || 100;
    canvas.width = W;
    canvas.height = H;

    // Wave simulation grid
    const GS = 3; // 1 wave cell = GS canvas pixels
    const GW = Math.ceil(W / GS) + 2;
    const GH = Math.ceil(H / GS) + 2;
    let cur = new Float32Array(GW * GH);
    let prv = new Float32Array(GW * GH);
    const gdx = new Float32Array(GW * GH);
    const gdy = new Float32Array(GW * GH);

    // Off-screen canvas — static text, never redrawn
    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const octx = off.getContext('2d');

    const drawText = () => {
      octx.clearRect(0, 0, W, H);
      const fontSize = H * 0.68;
      octx.font = `900 ${fontSize}px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif`;
      if ('letterSpacing' in octx) octx.letterSpacing = `${-0.04 * fontSize}px`;
      octx.textAlign = 'center';
      octx.textBaseline = 'middle';
      octx.fillStyle = '#1a4fcc';
      octx.fillText(text, W / 2, H / 2);
    };

    const addDrop = (px, py, strength) => {
      const gx = Math.round((px / W) * (GW - 2)) + 1;
      const gy = Math.round((py / H) * (GH - 2)) + 1;
      if (gx < 1 || gx >= GW - 1 || gy < 1 || gy >= GH - 1) return;
      cur[gy * GW + gx] += strength;
    };

    // Expanding ring wavefront for mousedown
    const addRipple = (px, py, strength, radius = 7) => {
      const steps = 32;
      for (let s = 0; s < steps; s++) {
        const a = (s / steps) * Math.PI * 2;
        const gx = Math.round((px / W) * (GW - 2)) + 1 + Math.round(Math.cos(a) * radius);
        const gy = Math.round((py / H) * (GH - 2)) + 1 + Math.round(Math.sin(a) * radius * 0.55);
        if (gx >= 1 && gx < GW - 1 && gy >= 1 && gy < GH - 1) {
          cur[gy * GW + gx] += strength;
        }
      }
    };

    const DAMP    = 0.940;
    const DISP    = 0.015; // subtle overall displacement
    const DIFFUSE = 0.07;  // frequency-selective noise suppression

    // Teal highlight colour for distorted pixels (#00e8d8 — bright aqua-teal)
    const TEAL_R = 0, TEAL_G = 232, TEAL_B = 216;

    let animId;
    let lastAutoDrop = 0;
    let srcPixels    = null;
    let mounted      = true;

    // For cursor interpolation: track previous canvas-space position
    let prevCX = null, prevCY = null, prevT = null;

    const tick = (t) => {
      if (!mounted) return;
      if (!srcPixels) {
        try { srcPixels = octx.getImageData(0, 0, W, H); } catch {}
      }

      // Tiny ambient drips
      if (t - lastAutoDrop > 900 + Math.random() * 900) {
        lastAutoDrop = t;
        addDrop(
          (0.2 + Math.random() * 0.6) * W,
          (0.25 + Math.random() * 0.5) * H,
          40 + Math.random() * 30,
        );
      }

      // ── Wave equation ───────────────────────────────────────────────────
      for (let y = 1; y < GH - 1; y++) {
        for (let x = 1; x < GW - 1; x++) {
          const i = y * GW + x;
          const next = (cur[i - 1] + cur[i + 1] + cur[i - GW] + cur[i + GW]) * 0.5 - prv[i];
          prv[i] = next * DAMP;
        }
      }
      const tmp = cur; cur = prv; prv = tmp;

      // ── Diffusion — kills high-freq noise, preserves smooth wave fronts ──
      for (let y = 1; y < GH - 1; y++) {
        for (let x = 1; x < GW - 1; x++) {
          const i = y * GW + x;
          const avg4 = (cur[i - 1] + cur[i + 1] + cur[i - GW] + cur[i + GW]) * 0.25;
          cur[i] = cur[i] + (avg4 - cur[i]) * DIFFUSE;
        }
      }

      // ── Gradient field ──────────────────────────────────────────────────
      for (let y = 1; y < GH - 1; y++) {
        for (let x = 1; x < GW - 1; x++) {
          const i = y * GW + x;
          gdx[i] = cur[i + 1]  - cur[i - 1];
          gdy[i] = cur[i + GW] - cur[i - GW];
        }
      }

      // ── Render: bilinear displacement + bilinear source + colour shift ───
      if (srcPixels) {
        const dstData = ctx.createImageData(W, H);
        const sd = srcPixels.data;
        const dd = dstData.data;

        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            // Bilinear wave-grid position
            const gxf = Math.min(Math.max(x / GS + 1, 1.01), GW - 2.01);
            const gyf = Math.min(Math.max(y / GS + 1, 1.01), GH - 2.01);
            const gxi = gxf | 0;
            const gyi = gyf | 0;
            const ft  = gxf - gxi;
            const fs  = gyf - gyi;
            const ft1 = 1 - ft, fs1 = 1 - fs;

            const gi00 = gyi * GW + gxi;
            const gi10 = gi00 + 1;
            const gi01 = gi00 + GW;
            const gi11 = gi00 + GW + 1;

            // Bilinear gradient interpolation → smooth displacement
            const dxF = (gdx[gi00]*ft1*fs1 + gdx[gi10]*ft*fs1 + gdx[gi01]*ft1*fs + gdx[gi11]*ft*fs) * DISP * W;
            const dyF = (gdy[gi00]*ft1*fs1 + gdy[gi10]*ft*fs1 + gdy[gi01]*ft1*fs + gdy[gi11]*ft*fs) * DISP * H;

            // Bilinear source sampling (anti-aliased)
            const sxf = x + dxF;
            const syf = y + dyF;
            const sxi = sxf | 0;
            const syi = syf | 0;
            const txs = sxf - sxi, tys = syf - syi;

            const sxi0 = sxi     < 0 ? 0 : sxi     >= W ? W-1 : sxi;
            const syi0 = syi     < 0 ? 0 : syi     >= H ? H-1 : syi;
            const sxi1 = sxi + 1 < 0 ? 0 : sxi + 1 >= W ? W-1 : sxi + 1;
            const syi1 = syi + 1 < 0 ? 0 : syi + 1 >= H ? H-1 : syi + 1;

            const w00 = (1-txs)*(1-tys), w10 = txs*(1-tys);
            const w01 = (1-txs)*tys,     w11 = txs*tys;

            const si00 = (syi0*W + sxi0)*4, si10 = (syi0*W + sxi1)*4;
            const si01 = (syi1*W + sxi0)*4, si11 = (syi1*W + sxi1)*4;

            const di = (y*W + x)*4;

            let r = sd[si00]*w00 + sd[si10]*w10 + sd[si01]*w01 + sd[si11]*w11;
            let g = sd[si00+1]*w00 + sd[si10+1]*w10 + sd[si01+1]*w01 + sd[si11+1]*w11;
            let b = sd[si00+2]*w00 + sd[si10+2]*w10 + sd[si01+2]*w01 + sd[si11+2]*w11;
            const a = sd[si00+3]*w00 + sd[si10+3]*w10 + sd[si01+3]*w01 + sd[si11+3]*w11;

            // ── Colour shift: blue → teal → white as distortion grows ──────
            // 3-stop gradient mapped to displacement magnitude.
            // Normalise over 12px so the shift is gradual.
            if (a > 8) {
              const dispMag = Math.sqrt(dxF * dxF + dyF * dyF);
              const t2 = Math.min(dispMag / 40, 1);
              if (t2 > 0.01) {
                // Smoothstep easing — gentle S-curve, no harsh snap
                const ease = t2 * t2 * (3 - 2 * t2);
                // First half  (ease 0 → 0.5): source colour → teal
                // Second half (ease 0.5 → 1): teal → white
                if (ease < 0.5) {
                  const f = ease * 2;
                  r = r * (1 - f) + TEAL_R * f;
                  g = g * (1 - f) + TEAL_G * f;
                  b = b * (1 - f) + TEAL_B * f;
                } else {
                  const f = (ease - 0.5) * 2;
                  r = TEAL_R * (1 - f) + 255 * f;
                  g = TEAL_G * (1 - f) + 255 * f;
                  b = TEAL_B * (1 - f) + 255 * f;
                }
              }
            }

            dd[di]   = r;
            dd[di+1] = g;
            dd[di+2] = b;
            dd[di+3] = a;
          }
        }
        ctx.putImageData(dstData, 0, 0);
      }

      animId = requestAnimationFrame(tick);
    };

    let isPressed = false;

    const onMouseMove = (e) => {
      const r  = canvas.getBoundingClientRect();
      const cx = (e.clientX - r.left) / r.width  * W;
      const cy = (e.clientY - r.top)  / r.height * H;
      const now = performance.now();

      // Velocity (canvas-px per ms), capped for stability
      let vel = 0;
      if (prevCX !== null && prevT !== null) {
        const dt   = Math.max(now - prevT, 1);
        const dist = Math.hypot(cx - prevCX, cy - prevCY);
        vel = Math.min(dist / dt, 6);

        // ── Interpolate drops along the path since the last sample ──────────
        // Ensures fast swipes create a continuous wave trail, not sparse dots
        const steps = Math.max(1, Math.ceil(dist / (GS * 1.5))); // one drop per ~1.5 grid cells
        for (let s = 1; s <= steps; s++) {
          const frac = s / steps;
          const ix = prevCX + (cx - prevCX) * frac;
          const iy = prevCY + (cy - prevCY) * frac;
          const strength = isPressed
            ? (60 + vel * 55) / steps
            : (8  + vel * 18) / steps;
          addDrop(ix, iy, strength);
        }
      } else {
        // First sample — single drop
        const strength = isPressed ? 80 : 12;
        addDrop(cx, cy, strength);
      }

      prevCX = cx; prevCY = cy; prevT = now;
    };

    const onMouseDown = (e) => {
      isPressed = true;
      const r = canvas.getBoundingClientRect();
      addRipple(
        (e.clientX - r.left) / r.width  * W,
        (e.clientY - r.top)  / r.height * H,
        700, 10,
      );
    };

    const onMouseLeave = () => { prevCX = null; prevCY = null; prevT = null; };
    const onMouseUp    = () => { isPressed = false; };

    // ── Touch support (mobile) ────────────────────────────────────────────
    const onTouchStart = (e) => {
      isPressed = true;
      const t = e.touches[0];
      const r = canvas.getBoundingClientRect();
      addRipple(
        (t.clientX - r.left) / r.width  * W,
        (t.clientY - r.top)  / r.height * H,
        600, 9,
      );
    };

    const onTouchMove = (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const r = canvas.getBoundingClientRect();
      const cx = (touch.clientX - r.left) / r.width  * W;
      const cy = (touch.clientY - r.top)  / r.height * H;
      const now = performance.now();

      if (prevCX !== null && prevT !== null) {
        const dt   = Math.max(now - prevT, 1);
        const dist = Math.hypot(cx - prevCX, cy - prevCY);
        const vel  = Math.min(dist / dt, 6);
        const steps = Math.max(1, Math.ceil(dist / (GS * 1.5)));
        for (let s = 1; s <= steps; s++) {
          const frac = s / steps;
          addDrop(prevCX + (cx - prevCX) * frac, prevCY + (cy - prevCY) * frac,
            (50 + vel * 40) / steps);
        }
      } else {
        addDrop(cx, cy, 55);
      }
      prevCX = cx; prevCY = cy; prevT = now;
    };

    const onTouchEnd = () => { isPressed = false; prevCX = null; prevCY = null; prevT = null; };

    document.fonts.ready.then(() => {
      if (!mounted) return;
      drawText();
      srcPixels = null;

      // Initial splash — flood the whole surface with energy so the first
      // thing the user sees is full teal→white distortion damping to rest.
      const splashCount = 18;
      for (let i = 0; i < splashCount; i++) {
        const px = (0.05 + (i / (splashCount - 1)) * 0.9) * W;
        const py = (0.1 + Math.random() * 0.8) * H;
        addDrop(px, py, 900 + Math.random() * 400);
      }
      // A few extra ripple rings for texture
      addRipple(W * 0.25, H * 0.5, 600, 8);
      addRipple(W * 0.5,  H * 0.5, 700, 10);
      addRipple(W * 0.75, H * 0.5, 600, 8);

      animId = requestAnimationFrame(tick);
    });

    canvas.addEventListener('mousemove',  onMouseMove);
    canvas.addEventListener('mousedown',  onMouseDown);
    canvas.addEventListener('mouseleave', onMouseLeave);
    canvas.addEventListener('mouseup',    onMouseUp);
    window.addEventListener('mouseup',    onMouseUp);
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove',  onTouchMove,  { passive: false });
    canvas.addEventListener('touchend',   onTouchEnd,   { passive: true });

    return () => {
      mounted = false;
      cancelAnimationFrame(animId);
      canvas.removeEventListener('mousemove',  onMouseMove);
      canvas.removeEventListener('mousedown',  onMouseDown);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      canvas.removeEventListener('mouseup',    onMouseUp);
      window.removeEventListener('mouseup',    onMouseUp);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove',  onTouchMove);
      canvas.removeEventListener('touchend',   onTouchEnd);
    };
  }, [text]);

  return <canvas ref={canvasRef} className={className} />;
}
