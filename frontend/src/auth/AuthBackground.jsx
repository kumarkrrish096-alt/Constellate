import { useEffect, useRef } from 'react';

// Astrolabe rings + drifting constellation on a 2D canvas (no dependencies).
export default function AuthBackground() {
    const ref = useRef(null);

    useEffect(() => {
        const cv = ref.current;
        const cx = cv.getContext('2d');
        const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
        let W, H, raf, px = 0, py = 0, tx = 0, ty = 0, t = 0, stars = [];
        let C = { g: '201,162,75', s: '234,223,200' };
        const readColors = () => {
            const st = getComputedStyle(cv);
            C = { g: st.getPropertyValue('--gr').trim() || C.g, s: st.getPropertyValue('--st').trim() || C.s };
        };

        const size = () => {
            const d = Math.min(devicePixelRatio || 1, 1.5);
            W = cv.clientWidth; H = cv.clientHeight;
            cv.width = W * d; cv.height = H * d;
            cx.setTransform(d, 0, 0, d, 0, 0);
            stars = Array.from({ length: W < 700 ? 55 : 130 }, () => ({
                x: Math.random() * W, y: Math.random() * H, z: 0.3 + Math.random() * 0.7,
                vx: (Math.random() - 0.5) * 0.08, vy: (Math.random() - 0.5) * 0.08,
                r: Math.random() * 1.3 + 0.4, dx: 0, dy: 0,
            }));
            if (reduce) draw();
        };

        const ring = (r, w, a, dash, rot) => {
            cx.save(); cx.rotate(rot);
            cx.lineWidth = w; cx.strokeStyle = `rgba(${C.g},${a})`; cx.setLineDash(dash);
            cx.beginPath(); cx.arc(0, 0, r, 0, Math.PI * 2); cx.stroke();
            cx.restore();
        };

        function draw() {
            px += (tx - px) * 0.05; py += (ty - py) * 0.05;
            if (!reduce) t += 0.0025;
            cx.clearRect(0, 0, W, H);

            const R = Math.min(W, H) * (W < 700 ? 0.58 : 0.65);
            cx.save();
            cx.translate(W * 0.5 - px * 14, H * 0.5 - py * 14);
            ring(R, 1.2, 0.35, [], 0); ring(R * 0.93, 0.8, 0.22, [2, 10], t);
            ring(R * 0.8, 1, 0.28, [], 0); ring(R * 0.68, 0.8, 0.2, [1, 6], -t * 1.4);
            ring(R * 0.5, 1, 0.22, [], 0); ring(R * 0.32, 0.8, 0.18, [4, 8], t * 2);
            cx.setLineDash([]); cx.rotate(t * 0.6);
            cx.strokeStyle = `rgba(${C.g},.16)`; cx.lineWidth = 0.8;
            for (let k = 0; k < 2; k++) {
                cx.beginPath();
                for (let i = 0; i < 3; i++) {
                    const a = i * 2.0944 + (k * Math.PI) / 3 - Math.PI / 2;
                    cx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8);
                }
                cx.closePath(); cx.stroke();
            }
            cx.restore();

            for (const s of stars) {
                if (!reduce) {
                    s.x += s.vx; s.y += s.vy;
                    if (s.x < 0) s.x = W; if (s.x > W) s.x = 0;
                    if (s.y < 0) s.y = H; if (s.y > H) s.y = 0;
                }
                s.dx = s.x + px * 30 * s.z; s.dy = s.y + py * 30 * s.z;
            }
            cx.lineWidth = 0.6;
            for (let i = 0; i < stars.length; i++) {
                for (let j = i + 1; j < stars.length; j++) {
                    const a = stars[i], b = stars[j], d = Math.hypot(a.dx - b.dx, a.dy - b.dy);
                    if (d < 110) {
                        cx.strokeStyle = `rgba(${C.g},${0.22 * (1 - d / 110)})`;
                        cx.beginPath(); cx.moveTo(a.dx, a.dy); cx.lineTo(b.dx, b.dy); cx.stroke();
                    }
                }
            }
            for (const s of stars) {
                cx.fillStyle = `rgba(${C.s},${0.35 + 0.5 * s.z})`;
                cx.beginPath(); cx.arc(s.dx, s.dy, s.r * s.z + 0.3, 0, Math.PI * 2); cx.fill();
            }
            if (!reduce) raf = requestAnimationFrame(draw);
        }

        const move = (e) => { tx = e.clientX / W - 0.5; ty = e.clientY / H - 0.5; };
        readColors();
        const mo = new MutationObserver(() => { readColors(); if (reduce) draw(); });
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        size();
        if (!reduce) raf = requestAnimationFrame(draw);
        addEventListener('resize', size);
        addEventListener('pointermove', move);
        return () => {
            cancelAnimationFrame(raf);
            mo.disconnect();
            removeEventListener('resize', size);
            removeEventListener('pointermove', move);
        };
    }, []);

    return (
        <div className="ab" aria-hidden="true">
            <canvas ref={ref} />
            <div className="ab-banner l" />
            <div className="ab-banner r" />
            <div className="ab-grain" />
            <div className="ab-vig" />
        </div>
    );
}
