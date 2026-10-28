import { N as defN, E as defE, C as defC, CO as defCO, F as defF, U as defU, god as defGod, cyc as defCyc, maxB as defMaxB, PAL } from './data';

export function Atlas(cv, o = {}, env, dataOverride) {
  const pal = () => PAL[env.theme()];

  const initData = dataOverride || o.data;
  let N = initData?.N || defN;
  let E = initData?.E || defE;
  let C = initData?.C || defC;
  let CO = initData?.CO || defCO;
  let F = initData?.F || defF;
  let U = initData?.U || defU;
  let god = initData?.god !== undefined ? initData.god : defGod;
  let cyc = initData?.cyc || defCyc;
  let maxB = initData?.maxB || defMaxB;

  const x = cv.getContext('2d');
  let P = N.map(() => ({ x: 0, y: 0, fx: 0, fy: 0, tx: 0, ty: 0 }));
  let W = 0, H = 0, dp = 1, v = { x: 0, y: 0, k: 1 }, tv = { x: 0, y: 0, k: 1 }, formed = false;
  const a = { mode: 'force', sel: -1, hov: -1, hi: null, q: null, co: false, cv };

  a.setData = (d) => {
    if (!d) return;
    N = d.N || defN;
    E = d.E || defE;
    C = d.C || defC;
    CO = d.CO || defCO;
    F = d.F || defF;
    U = d.U || defU;
    god = d.god !== undefined ? d.god : defGod;
    cyc = d.cyc || defCyc;
    maxB = d.maxB || defMaxB;
    P = N.map(() => ({ x: 0, y: 0, fx: 0, fy: 0, tx: 0, ty: 0 }));
    formed = false;
    a.sel = -1;
    a.hi = null;
    a.q = null;
    a.reset();
    a.resize();
  };

  a.resize = () => {
    const r = cv.getBoundingClientRect();
    if (!r.width) return;
    W = r.width;
    H = r.height;
    dp = Math.min(devicePixelRatio || 1, 2);
    cv.width = W * dp;
    cv.height = H * dp;
    const sy = (H / 2) * 0.74, sx = Math.min((W / 2) * 0.86, sy * 1.9);

    N.forEach((n, i) => {
      const p = P[i];
      if (!p) return;
      const u = U[i] || { x: 0, y: 0 };
      p.fx = u.x * sx;
      p.fy = u.y * sy;
      const b = Math.pow(n.bl / (maxB || 1), 0.55);
      p.ty = (-0.82 + 1.64 * b) * sy;
      p.tx = ((n.k - 2.5) * 0.36 + (((i * 37) % 17) / 17 - 0.5) * 0.34) * sx * 0.95;
    });

    if (!formed) {
      a.form();
      formed = true;
    }
  };

  a.form = () => {
    if (env.calm()) return;
    N.forEach((n, i) => {
      const p = P[i];
      if (!p) return;
      const an = Math.random() * 6.28, r = (1.2 + Math.random()) * Math.max(W, H) * 0.5;
      p.x = Math.cos(an) * r;
      p.y = Math.sin(an) * r;
    });
  };

  a.setMode = (m) => { a.mode = m; };
  a.select = (i) => { a.sel = i; a.hi = null; };
  a.focus = (i) => {
    const p = P[i];
    if (p) tv = { x: a.mode === 'tree' ? p.tx : p.fx, y: a.mode === 'tree' ? p.ty : p.fy, k: 1.8 };
  };
  a.reset = () => { tv = { x: 0, y: 0, k: 1 }; };
  a.zoom = (f) => { tv.k = Math.max(0.6, Math.min(4, tv.k * f)); };
  a.setHi = (s) => { a.hi = s; a.sel = -1; };
  a.setQ = (q) => { a.q = q; };

  const wp = (px, py) => [(px - W / 2) / v.k + v.x, (py - H / 2) / v.k + v.y];
  const pick = (px, py) => {
    const [w, h] = wp(px, py);
    let b = -1, bd = 14 / v.k;
    N.forEach((n, i) => {
      const p = P[i];
      if (!p) return;
      const d = Math.hypot(p.x - w, p.y - h);
      if (d < bd) {
        bd = d;
        b = i;
      }
    });
    return b;
  };

  a.tick = (dt) => {
    if (!W) a.resize();
    if (!W) return;
    const cm = env.calm(), e = cm ? 1 : Math.min(1, dt * 3.5);
    N.forEach((n, i) => {
      const p = P[i];
      if (!p) return;
      const tx = a.mode === 'tree' ? p.tx : p.fx, ty = a.mode === 'tree' ? p.ty : p.fy;
      p.x += (tx - p.x) * e;
      p.y += (ty - p.y) * e;
    });
    const ev = cm ? 1 : Math.min(1, dt * 5);
    v.x += (tv.x - v.x) * ev;
    v.y += (tv.y - v.y) * ev;
    v.k += (tv.k - v.k) * ev;
    draw();
  };

  function draw() {
    const p = pal(), k = v.k;
    x.setTransform(dp, 0, 0, dp, 0, 0);
    x.clearRect(0, 0, W, H);
    x.translate(W / 2, H / 2);
    x.scale(k, k);
    x.translate(-v.x, -v.y);

    const g = 64, x0 = v.x - W / 2 / k, x1 = v.x + W / 2 / k, y0 = v.y - H / 2 / k, y1 = v.y + H / 2 / k;
    x.lineWidth = 1 / k;
    for (let gx = Math.floor(x0 / g) * g; gx <= x1; gx += g) {
      x.strokeStyle = `rgba(${p.gr},${gx % (g * 4) === 0 ? 0.1 : 0.045})`;
      x.beginPath();
      x.moveTo(gx, y0);
      x.lineTo(gx, y1);
      x.stroke();
    }
    for (let gy = Math.floor(y0 / g) * g; gy <= y1; gy += g) {
      x.strokeStyle = `rgba(${p.gr},${gy % (g * 4) === 0 ? 0.1 : 0.045})`;
      x.beginPath();
      x.moveTo(x0, gy);
      x.lineTo(x1, gy);
      x.stroke();
    }

    const s = a.sel, sn = s >= 0 ? N[s] : null;
    const lit = (i) => {
      if (sn) return i === s || sn.fwd.has(i) || sn.rev.has(i);
      if (a.hi) return a.hi.has(i);
      if (a.q) return a.q.has(i);
      return true;
    };

    C.forEach((ids, kk) => {
      if (!ids || ids.length < 3 || kk >= F.length) return;
      const hv = hull(ids.map((i) => P[i] && [P[i].x, P[i].y]).filter(Boolean));
      if (hv.length < 3) return;
      let cx0 = 0, cy0 = 0;
      hv.forEach((q) => { cx0 += q[0]; cy0 += q[1]; });
      cx0 /= hv.length;
      cy0 /= hv.length;
      const ex = hv.map((q) => {
        const dx = q[0] - cx0, dy = q[1] - cy0, d = Math.hypot(dx, dy) || 1;
        return [q[0] + (dx / d) * 18, q[1] + (dy / d) * 18];
      }), n = ex.length, mid = (A, B) => [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];

      x.beginPath();
      let m0 = mid(ex[n - 1], ex[0]);
      x.moveTo(m0[0], m0[1]);
      for (let i = 0; i < n; i++) {
        const c = ex[i], m = mid(ex[i], ex[(i + 1) % n]);
        x.quadraticCurveTo(c[0], c[1], m[0], m[1]);
      }
      x.closePath();
      x.fillStyle = `rgba(${p.gr},.04)`;
      x.fill();
      x.strokeStyle = `rgba(${p.gr},.2)`;
      x.lineWidth = 1 / k;
      x.stroke();
      const top = Math.min(...ex.map((q) => q[1]));
      x.font = `${11 / k}px JetBrains Mono,monospace`;
      x.textAlign = 'center';
      x.fillStyle = `rgba(${p.gr},.7)`;
      x.fillText((F[kk] || 'MODULE').toUpperCase(), cx0, top - 6 / k);
      x.textAlign = 'left';
    });

    E.forEach((e) => {
      const A = P[e.a], B = P[e.b];
      if (!A || !B) return;
      let c = `rgba(${p.ink},.16)`, w = 0.8, ar = false, dash = false;
      if (sn) {
        const up = (e.a === s || sn.rev.has(e.a)) && (e.b === s || sn.rev.has(e.b));
        const dn = (e.a === s || sn.fwd.has(e.a)) && (e.b === s || sn.fwd.has(e.b));
        if (up) { c = p.hot; w = 1.4; ar = true; }
        else if (dn) { c = p.gold; w = 1.4; ar = true; }
        else c = `rgba(${p.ink},.05)`;
      } else if (a.hi) {
        const both = a.hi.has(e.a) && a.hi.has(e.b);
        c = both ? p.hot : `rgba(${p.ink},.05)`;
        if (both) { w = 1.6; ar = true; }
      } else if (a.q && !(a.q.has(e.a) && a.q.has(e.b))) {
        c = `rgba(${p.ink},.05)`;
      }
      if (e.cy && !sn && !a.hi) { c = p.hot; w = 1.2; dash = true; }
      x.setLineDash(dash ? [5 / k, 4 / k] : []);
      x.strokeStyle = c;
      x.lineWidth = w / k;
      x.beginPath();
      x.moveTo(A.x, A.y);
      x.lineTo(B.x, B.y);
      x.stroke();
      x.setLineDash([]);
      if (ar && N[e.b]) {
        const an = Math.atan2(B.y - A.y, B.x - A.x), r = nr(N[e.b]) + 2 / k, tx = B.x - Math.cos(an) * r, ty = B.y - Math.sin(an) * r, sz = 6 / k;
        x.fillStyle = c;
        x.beginPath();
        x.moveTo(tx, ty);
        x.lineTo(tx - Math.cos(an - 0.4) * sz, ty - Math.sin(an - 0.4) * sz);
        x.lineTo(tx - Math.cos(an + 0.4) * sz, ty - Math.sin(an + 0.4) * sz);
        x.closePath();
        x.fill();
      }
    });

    if (a.co && CO.length > 0) {
      x.lineCap = 'round';
      x.setLineDash([1.5 / k, 4.5 / k]);
      CO.forEach((c) => {
        const A = P[c.a], B = P[c.b];
        if (!A || !B) return;
        const mx = (A.x + B.x) / 2 - (B.y - A.y) * 0.18, my = (A.y + B.y) / 2 + (B.x - A.x) * 0.18, on = !sn || c.a === s || c.b === s;
        x.strokeStyle = `rgba(${p.gr},${on ? 0.9 : 0.12})`;
        x.lineWidth = (1 + (c.w || 3) / 8) / k;
        x.beginPath();
        x.moveTo(A.x, A.y);
        x.quadraticCurveTo(mx, my, B.x, B.y);
        x.stroke();
      });
      x.setLineDash([]);
      x.lineCap = 'butt';
    }

    N.forEach((n, i) => {
      const q = P[i];
      if (!q) return;
      const l = lit(i), r = nr(n);
      x.globalAlpha = l ? 1 : 0.18;
      x.fillStyle = ncol(n);
      x.beginPath();
      x.arc(q.x, q.y, r, 0, 6.3);
      x.fill();
      x.strokeStyle = `rgb(${p.bgc})`;
      x.lineWidth = 1.2 / k;
      x.stroke();
      x.lineWidth = 1 / k;
      if (i === god && god >= 0) {
        x.strokeStyle = p.gold;
        x.beginPath();
        x.arc(q.x, q.y, r + 4, 0, 6.3);
        x.stroke();
      }
      if (cyc.has(i) && a.mode !== 'heat') {
        x.strokeStyle = p.hot;
        x.beginPath();
        x.arc(q.x, q.y, r + 2.5, 0, 6.3);
        x.stroke();
      }
      if (i === s) {
        x.strokeStyle = p.gold;
        x.lineWidth = 1.6 / k;
        x.beginPath();
        x.arc(q.x, q.y, r + 5, 0, 6.3);
        x.stroke();
        x.globalAlpha = 0.4;
        x.beginPath();
        x.arc(q.x, q.y, r + 9, 0, 6.3);
        x.stroke();
      }
      if (i === a.hov && i !== s) {
        x.strokeStyle = `rgba(${p.ink},.7)`;
        x.beginPath();
        x.arc(q.x, q.y, r + 3.5, 0, 6.3);
        x.stroke();
      }
      x.globalAlpha = 1;
      if (i === s || i === a.hov || (i === god && !o.mini && god >= 0)) {
        x.font = `${11 / k}px JetBrains Mono,monospace`;
        const t = n.name, w = x.measureText(t).width, bx = q.x + r + 7 / k, by = q.y - 9 / k, bw = w + 12 / k, bh = 18 / k;
        x.fillStyle = `rgba(${p.bgc},.92)`;
        x.beginPath();
        if (x.roundRect) x.roundRect(bx, by, bw, bh, 5 / k);
        else x.rect(bx, by, bw, bh);
        x.fill();
        x.strokeStyle = `rgba(${p.gr},.35)`;
        x.lineWidth = 1 / k;
        x.stroke();
        x.fillStyle = `rgb(${p.ink})`;
        x.fillText(t, bx + 6 / k, q.y + 4 / k);
      }
    });

    x.setTransform(1, 0, 0, 1, 0, 0);
  }

  const hull = (pts) => {
    pts = pts.slice().sort((a0, b0) => a0[0] - b0[0] || a0[1] - b0[1]);
    if (pts.length < 3) return pts;
    const cr = (o0, a0, b0) => (a0[0] - o0[0]) * (b0[1] - o0[1]) - (a0[1] - o0[1]) * (b0[0] - o0[0]);
    const lo = [];
    for (const pt of pts) {
      while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], pt) <= 0) lo.pop();
      lo.push(pt);
    }
    const up = [];
    for (const pt of pts.slice().reverse()) {
      while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], pt) <= 0) up.pop();
      up.push(pt);
    }
    up.pop();
    lo.pop();
    return lo.concat(up);
  };

  const ncol = (n) => {
    const p = pal();
    if (a.mode === 'heat') return n.risk > 0.6 ? p.hot : n.risk > 0.38 ? p.gold : `rgba(${p.ink},.5)`;
    if (n.id === god && god >= 0) return p.gold;
    if (cyc.has(n.id)) return p.hot;
    const colIdx = n.k % p.cl.length;
    return p.cl[colIdx] || p.gold;
  };

  const nr = (n) => (n.id === god && god >= 0 ? 10 : a.mode === 'heat' ? 2.6 + n.risk * 6 : 2.6 + Math.min(5, (n.inn?.length || 0) * 0.3));

  a.png = (cb) => {
    const t = document.createElement('canvas');
    t.width = cv.width;
    t.height = cv.height;
    const c = t.getContext('2d');
    c.fillStyle = env.theme() === 'dark' ? '#0E0607' : '#E8DCC4';
    c.fillRect(0, 0, t.width, t.height);
    c.drawImage(cv, 0, 0);
    t.toBlob(cb);
  };

  a.svg = () => {
    const p = pal(), bg = env.theme() === 'dark' ? '#0E0607' : '#E8DCC4';
    const pos = (i) => (P[i] ? (a.mode === 'tree' ? [P[i].tx, P[i].ty] : [P[i].fx, P[i].fy]) : [0, 0]);
    let t = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-W / 2} ${-H / 2} ${W} ${H}" width="${W}" height="${H}"><rect x="${-W / 2}" y="${-H / 2}" width="${W}" height="${H}" fill="${bg}"/>`;
    E.forEach((e) => {
      const [x1, y1] = pos(e.a), [x2, y2] = pos(e.b);
      t += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${e.cy ? p.hot : 'rgb(' + p.ink + ')'}" stroke-opacity="${e.cy ? 0.9 : 0.25}" stroke-width="${e.cy ? 1.2 : 0.8}"/>`;
    });
    N.forEach((n) => {
      const [px, py] = pos(n.id);
      t += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${nr(n).toFixed(1)}" fill="${ncol(n)}"><title>${n.name}</title></circle>`;
    });
    return t + '</svg>';
  };

  if (o.inter) {
    const ac = new AbortController(), sg = { signal: ac.signal };
    a.destroy = () => ac.abort();
    let dn = null;
    cv.addEventListener('pointerdown', (e) => {
      dn = { x: e.clientX, y: e.clientY, vx: tv.x, vy: tv.y, m: 0 };
      cv.setPointerCapture(e.pointerId);
      cv.style.cursor = 'grabbing';
    }, sg);
    cv.addEventListener('pointermove', (e) => {
      const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      if (dn) {
        const dx = e.clientX - dn.x, dy = e.clientY - dn.y;
        dn.m = Math.max(dn.m, Math.hypot(dx, dy));
        if (dn.m > 4) {
          tv.x = dn.vx - dx / v.k;
          tv.y = dn.vy - dy / v.k;
          v.x = tv.x;
          v.y = tv.y;
        }
      } else {
        const h = pick(px, py);
        a.hov = h;
        o.hover && o.hover(h, px, py);
      }
    }, sg);
    cv.addEventListener('pointerup', (e) => {
      cv.style.cursor = 'grab';
      if (dn && dn.m <= 4) {
        const r = cv.getBoundingClientRect(), h = pick(e.clientX - r.left, e.clientY - r.top);
        o.click && o.click(h);
      }
      dn = null;
    }, sg);
    cv.addEventListener('pointerleave', () => {
      a.hov = -1;
      o.hover && o.hover(-1);
    }, sg);
  }

  return a;
}
