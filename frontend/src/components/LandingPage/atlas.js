/**
 * atlas.js — Three.js constellation visualization engine
 *
 * Exports a single `initAtlas(refs)` function that sets up the entire
 * 3D scene and returns a control object + cleanup function.
 */
import * as THREE from 'three';

/* ── Dark theme palette ────────────────────────────────── */
const T_DARK = {
  add: true,
  cl: ['#C9A24B', '#EADFC8', '#BBA995', '#E3C27A', '#A8863A'],
  red: '#C4202E', god: '#E3C27A', gold: '#C9A24B', hi: '#FF3B30',
  core: .35, ea: 1, ring: .3,
  rc: ['#C9A24B', '#BBA995', '#C9A24B'],
  star: '#EADFC8', starA: .5, spk0: '#EADFC8',
  gr: '201,162,75', rr: '196,32,46',
};

/* ── Helpers ───────────────────────────────────────────── */
const hex = (c) => new THREE.Color(c);

const rngFactory = (a) => () => {
  a |= 0;
  a = a + 0x6D2B79F5 | 0;
  let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

/* ── Main init ─────────────────────────────────────────── */
export function initAtlas(refs) {
  const {
    glCanvas, fxCanvas, flashEl,
    tipEl, toastEl, lLoopEl, lGodEl, telEl,
    stepsEl, doneEl, dtEl,
  } = refs;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = innerWidth < 700;
  let W = innerWidth, H = innerHeight;
  let camZ = mobile ? 135 : 100, baseZ = camZ;
  let busy = false;

  const fctx = fxCanvas.getContext('2d');
  function sizeFx() {
    const d = Math.min(devicePixelRatio || 1, 2);
    fxCanvas.width = W * d;
    fxCanvas.height = H * d;
    fctx.setTransform(d, 0, 0, d, 0, 0);
  }
  sizeFx();

  const root = document.documentElement;
  root.dataset.theme = 'dark';
  let T = T_DARK;

  /* ---------- 3D scene ---------- */
  const t0 = performance.now();
  const renderer = new THREE.WebGLRenderer({
    canvas: glCanvas, antialias: true, alpha: true, powerPreference: 'high-performance',
  });
  const pr = Math.min(devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(pr);
  renderer.setSize(W, H, false);

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(55, W / H, .1, 1000);
  cam.position.z = camZ;
  const group = new THREE.Group();
  scene.add(group);

  const R = rngFactory(145);
  const gauss = () => (R() + R() + R() - 1.5) * 1.6;

  const folders = ['core', 'parser', 'graph', 'ui', 'api', 'cycle'];
  const stems = ['index', 'router', 'parser', 'lexer', 'graph', 'store', 'utils', 'config', 'render', 'cache', 'auth', 'queue', 'worker', 'schema', 'hooks', 'panel'];
  const per = mobile ? 70 : 130;
  const nodes = [], edges = [], centers = [], starts = [], counts = [];

  for (let k = 0; k < 6; k++) {
    const phi = Math.acos(1 - 2 * (k + .5) / 6);
    const th = Math.PI * (1 + Math.sqrt(5)) * k;
    centers.push(new THREE.Vector3(
      34 * Math.sin(phi) * Math.cos(th),
      26 * Math.cos(phi),
      34 * Math.sin(phi) * Math.sin(th),
    ));
  }

  function addCluster(k, count, _col, spread) {
    const s = nodes.length;
    const c = centers[k];
    starts[k] = s;
    counts[k] = count;
    for (let i = 0; i < count; i++) {
      const f = new THREE.Vector3(
        c.x + gauss() * spread,
        c.y + gauss() * spread * .85,
        c.z + gauss() * spread,
      );
      nodes.push({
        f, c: new THREE.Color(), b: .75 + R() * .4, s: 2 + R() * 2.6,
        d: R() * .7, k,
        name: folders[k] + '/' + stems[Math.floor(R() * stems.length)] + Math.floor(R() * 40) + '.ts',
        i: 0, o: 0,
      });
      const idx = nodes.length - 1;
      if (i > 0) {
        let best = -1, bd = 1e9;
        for (let j = Math.max(s, idx - 14); j < idx; j++) {
          const d = f.distanceToSquared(nodes[j].f);
          if (d < bd) { bd = d; best = j; }
        }
        edges.push([idx, best, 0]);
        if (R() < .3) edges.push([idx, s + Math.floor(R() * i), 0]);
      }
    }
  }

  for (let k = 0; k < 5; k++) addCluster(k, per, 0, 9);
  addCluster(5, Math.floor(per * .45), 0, 7);

  const ring = [], ringPts = [], lc = centers[5];
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    const f = new THREE.Vector3(lc.x + Math.cos(a) * 7, lc.y + Math.sin(a) * 5.6, lc.z + Math.sin(a) * 3);
    nodes.push({ f, c: new THREE.Color(), role: 'ring', s: 6, d: .85, k: 5, name: 'graph/cycle-' + i + '.ts', i: 0, o: 0 });
    ring.push(nodes.length - 1);
    ringPts.push(f);
  }
  for (let i = 0; i < 5; i++) {
    edges.push([ring[i], ring[(i + 1) % 5], 2]);
    edges.push([ring[i], starts[5] + Math.floor(R() * counts[5]), 0]);
  }

  const god = starts[0];
  const G = nodes[god];
  G.f.copy(centers[0]);
  G.s = 20; G.role = 'god'; G.d = .9; G.name = 'core/god-file.ts';
  for (let n = 0; n < 40; n++) {
    const r = Math.floor(R() * nodes.length);
    if (r !== god) edges.push([r, god, 1]);
  }
  for (let k = 0; k < 6; k++) {
    for (let t = 0; t < 3; t++) {
      const a = starts[k] + Math.floor(R() * counts[k]);
      const k2 = (k + 1 + Math.floor(R() * 2)) % 6;
      const b = starts[k2] + Math.floor(R() * counts[k2]);
      edges.push([a, b, 0]);
    }
  }

  const N = nodes.length;
  const adj = nodes.map(() => []);
  edges.forEach(([a, b]) => { adj[a].push(b); adj[b].push(a); nodes[a].o++; nodes[b].i++; });

  const chaos = new Float32Array(N * 3);
  nodes.forEach((n, i) => {
    const v = new THREE.Vector3(R() - .5, R() - .5, R() - .5).normalize().multiplyScalar(45 + R() * 70);
    chaos.set([v.x, v.y, v.z], i * 3);
  });

  /* mandala form positions */
  const mr = new Float32Array(N * 3);
  {
    const slots = [];
    const push = (x, y, id) => slots.push([Math.hypot(x, y), Math.atan2(y, x), id]);
    const q = (f) => Math.floor(N * f);
    const TAU = 6.2832;
    const nOut = q(.22), nRune = q(.2), nR2 = q(.1), nStar = q(.24), nIn = q(.1), GN = 40;

    for (let i = 0; i < nOut; i++) { const a = i / nOut * TAU; push(Math.cos(a), Math.sin(a), 0); }
    for (let i = 0; i < nRune; i++) { const a = (i % GN) / GN * TAU + (R() - .5) * .05, rr = .88 + (R() - .5) * .07; push(Math.cos(a) * rr, Math.sin(a) * rr, 1); }
    for (let i = 0; i < nR2; i++) { const a = i / nR2 * TAU; push(Math.cos(a) * .78, Math.sin(a) * .78, 2); }
    const V8 = [...Array(8)].map((_, i) => [Math.cos(i / 8 * TAU) * .74, Math.sin(i / 8 * TAU) * .74]);
    for (let i = 0; i < nStar; i++) { const e = i % 8, t = (i / 8 | 0) / Math.ceil(nStar / 8); const A = V8[e], B = V8[(e + 3) % 8]; push(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, 3); }
    for (let i = 0; i < nIn; i++) { const a = i / nIn * TAU; push(Math.cos(a) * .36, Math.sin(a) * .36, 4); }
    while (slots.length < N) { const a = R() * TAU, r = Math.sqrt(R()) * .2; push(Math.cos(a) * r, Math.sin(a) * r, 5); }
    for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
    slots.forEach((s, i) => { if (i < N) mr.set(s, i * 3); });
    mr.set([0, 0, 5], god * 3);
  }

  /* ---------- Shader uniforms ---------- */
  const U = {
    uProg: { value: 0 }, uTime: { value: 0 }, uPR: { value: pr },
    uDim: { value: 0 }, uM: { value: new THREE.Vector2(0, 0) },
    uMS: { value: 0 }, uAsp: { value: W / H }, uForm: { value: 0 },
    uScat: { value: 0 }, uS: { value: 30 }, uDist: { value: 100 },
    uHi: { value: new THREE.Color() }, uCr: { value: new THREE.Color() },
    uCore: { value: .35 }, uEA: { value: 1 },
  };

  /* ---------- Shared GLSL ---------- */
  const POS = `
    attribute vec3 aChaos;
    attribute float aDelay;
    attribute vec3 aColor;
    attribute float aLit;
    uniform float uProg, uTime, uPR, uDim;
    varying vec3 vC;
    varying float vL, vK;

    vec3 place() {
      float k = clamp(uProg * 1.6 - aDelay * .6, 0., 1.);
      k = k * k * (3. - 2. * k);
      vK = k;
      vec3 w = vec3(sin(uTime * .6 + aDelay * 40.), cos(uTime * .5 + aDelay * 55.), sin(uTime * .4 + aDelay * 23.)) * (1. - k) * 3.
             + vec3(sin(uTime * .7 + aDelay * 90.)) * .35 * k;
      return mix(aChaos + w, position, k);
    }

    uniform vec2 uM;
    uniform float uMS, uAsp;

    vec4 warp(vec4 g) {
      vec2 n = g.xy / g.w;
      vec2 d = (n - uM) * vec2(uAsp, 1.);
      float r = length(d) + 1e-4;
      float f = exp(-r * r * 7.) * uMS * .16 * (.6 + .8 * fract(aDelay * 7.3));
      vec2 u = d / r;
      vec2 o = (u * .35 + vec2(-u.y, u.x) * .8) * f;
      g.xy += vec2(o.x / uAsp, o.y) * g.w;
      return g;
    }

    attribute vec3 aMr;
    uniform float uForm, uScat, uS, uDist;
    varying float vF;

    vec4 viewPos() {
      vec3 p = place();
      vec4 mv = modelViewMatrix * vec4(p, 1.);
      float id = aMr.z;
      float sp = id < .5 ? .12 : id < 1.5 ? -.22 : id < 2.5 ? .08 : id < 3.5 ? -.1 : id < 4.5 ? .3 : 0.;
      float a = aMr.y + uTime * sp;
      vec2 m = vec2(cos(a), sin(a)) * aMr.x * uS * (1. + .012 * sin(uTime * 2. + aMr.x * 9.));
      float f = clamp(uForm * 1.5 - aDelay * .5, 0., 1.);
      f = f * f * (3. - 2. * f);
      vF = f;
      mv = mix(mv, vec4(m, -uDist, 1.), f);
      vec3 dir = vec3(sin(aDelay * 91.3), cos(aDelay * 57.1), sin(aDelay * 33.7) * .6);
      mv.xyz += dir * uScat * (30. + 80. * fract(aDelay * 13.7))
              + vec3(sin(uTime * .9 + aDelay * 50.), cos(uTime * .7 + aDelay * 30.), 0.) * 3. * uScat;
      return mv;
    }
  `;

  const mat = (vs, fs) => new THREE.ShaderMaterial({
    uniforms: U, vertexShader: POS + vs, fragmentShader: fs,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });

  /* ---------- Node geometry ---------- */
  const ng = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const del = new Float32Array(N);
  const siz = new Float32Array(N);
  const nlit = new Float32Array(N);

  nodes.forEach((n, i) => {
    pos.set([n.f.x, n.f.y, n.f.z], i * 3);
    col.set([n.c.r, n.c.g, n.c.b], i * 3);
    del[i] = n.d;
    siz[i] = n.s;
  });

  ng.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  ng.setAttribute('aChaos', new THREE.BufferAttribute(chaos, 3));
  ng.setAttribute('aMr', new THREE.BufferAttribute(mr, 3));
  ng.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  ng.setAttribute('aDelay', new THREE.BufferAttribute(del, 1));
  ng.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
  ng.setAttribute('aLit', new THREE.BufferAttribute(nlit, 1));

  const pts = new THREE.Points(ng, mat(
    `attribute float aSize;
     void main() {
       vec4 mv = viewPos();
       gl_Position = warp(projectionMatrix * mv);
       vC = aColor;
       vL = aLit;
       gl_PointSize = aSize * (1. + aLit * 1.6 + vF * .1) * uPR * (210. / -mv.z);
     }`,
    `varying vec3 vC;
     varying float vL, vK, vF;
     uniform float uDim, uCore;
     uniform vec3 uHi, uCr;
     void main() {
       float d = length(gl_PointCoord - .5);
       if (d > .5) discard;
       float g = exp(-d * d * 16.);
       float core = smoothstep(.2, .02, d);
       float l = clamp(vL, 0., 1.);
       vec3 c = mix(mix(vC, uHi, l * .6), uCr, vF * .8) + core * uCore;
       float a = (.45 + .55 * vK) * g * (1. - uDim * .75 * (1. - l));
       gl_FragColor = vec4(c, a * (.85 + l + vF * .5));
     }`,
  ));
  pts.frustumCulled = false;
  group.add(pts);

  /* ---------- Edge geometry ---------- */
  const E = edges.length;
  const eg = new THREE.BufferGeometry();
  const ep = new Float32Array(E * 6);
  const ech = new Float32Array(E * 6);
  const ecol = new Float32Array(E * 6);
  const ed = new Float32Array(E * 2);
  const eb = new Float32Array(E * 2);
  const elit = new Float32Array(E * 2);

  edges.forEach(([a, b], e) => {
    [a, b].forEach((n, j) => {
      const v = e * 2 + j;
      const nd = nodes[n];
      const c = nodes[a].c;
      ep.set([nd.f.x, nd.f.y, nd.f.z], v * 3);
      ech.set([chaos[n * 3], chaos[n * 3 + 1], chaos[n * 3 + 2]], v * 3);
      ecol.set([c.r, c.g, c.b], v * 3);
      ed[v] = nd.d;
      const t = edges[e][2];
      eb[v] = t === 2 ? .8 : t === 1 ? .07 : .17;
    });
  });

  const emr = new Float32Array(E * 6);
  edges.forEach(([a, b], e) => {
    emr.set(mr.subarray(a * 3, a * 3 + 3), e * 6);
    emr.set(mr.subarray(b * 3, b * 3 + 3), e * 6 + 3);
  });

  eg.setAttribute('aMr', new THREE.BufferAttribute(emr, 3));
  eg.setAttribute('position', new THREE.BufferAttribute(ep, 3));
  eg.setAttribute('aChaos', new THREE.BufferAttribute(ech, 3));
  eg.setAttribute('aColor', new THREE.BufferAttribute(ecol, 3));
  eg.setAttribute('aDelay', new THREE.BufferAttribute(ed, 1));
  eg.setAttribute('aBase', new THREE.BufferAttribute(eb, 1));
  eg.setAttribute('aLit', new THREE.BufferAttribute(elit, 1));

  const lines = new THREE.LineSegments(eg, mat(
    `attribute float aBase;
     varying float vA;
     void main() {
       gl_Position = warp(projectionMatrix * viewPos());
       vC = aColor;
       vL = aLit;
       vA = aBase;
     }`,
    `varying vec3 vC;
     varying float vL, vK, vA;
     uniform float uDim, uForm, uScat, uEA;
     uniform vec3 uHi;
     void main() {
       float l = clamp(vL, 0., 1.);
       float a = (vA + l * .85) * uEA * vK * vK * (1. - uDim * .8 * (1. - l)) * (1. - clamp(uForm * 1.6, 0., 1.)) * (1. - uScat);
       gl_FragColor = vec4(mix(vC, uHi, l * .5), a);
     }`,
  ));
  lines.frustumCulled = false;
  group.add(lines);

  /* ---------- Cycle sparks ---------- */
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const cx = cv.getContext('2d');
  const sparkTex = new THREE.CanvasTexture(cv);
  const sg = new THREE.BufferGeometry();
  const sp = new Float32Array(9);
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));

  const sparks = new THREE.Points(sg, new THREE.PointsMaterial({
    map: sparkTex, size: 5, color: 0xffffff,
    transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, opacity: 0,
  }));
  sparks.frustumCulled = false;
  group.add(sparks);

  /* ---------- Armillary rings & stars ---------- */
  const orrery = new THREE.Group();
  const rings = [];
  scene.add(orrery);

  [[58, .5, 0, 0xcd9e66], [66, 1.2, .6, 0xa0cadd], [74, .2, 1.1, 0xcd9e66]].forEach(([r, tx, tz, c], i) => {
    const a = [];
    for (let j = 0; j <= 128; j++) {
      const t = j / 128 * Math.PI * 2;
      a.push(Math.cos(t) * r, 0, Math.sin(t) * r);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3));
    const l = new THREE.LineLoop(g, new THREE.LineBasicMaterial({
      color: c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    }));
    l.rotation.set(tx, 0, tz);
    l.userData.v = .05 * (i % 2 ? -1 : 1) * (i + 1);
    orrery.add(l);
    rings.push(l);
  });

  const sa = new Float32Array(600 * 3);
  for (let i = 0; i < 600; i++) {
    const v = new THREE.Vector3(R() - .5, R() - .5, R() - .5).normalize().multiplyScalar(300 + R() * 200);
    sa.set([v.x, v.y, v.z], i * 3);
  }
  const sg2 = new THREE.BufferGeometry();
  sg2.setAttribute('position', new THREE.BufferAttribute(sa, 3));
  const stars = new THREE.Points(sg2, new THREE.PointsMaterial({
    color: 0xe5d8c8, size: 1.3, sizeAttenuation: false, transparent: true, opacity: .5,
  }));
  scene.add(stars);

  /* ---------- Theme application ---------- */
  function applyTheme() {
    T = T_DARK;
    root.dataset.theme = 'dark';
    const cl = T.cl.map(hex);
    nodes.forEach((n, i) => {
      const c = n.role === 'god' ? hex(T.god) : (n.role === 'ring' || n.k === 5) ? hex(T.red) : cl[n.k].clone().multiplyScalar(n.b);
      n.c.copy(c);
      col.set([c.r, c.g, c.b], i * 3);
    });
    ng.attributes.aColor.needsUpdate = true;
    edges.forEach(([a, , t], e) => {
      const c = t === 2 ? hex(T.red) : t === 1 ? hex(T.gold) : nodes[a].c;
      for (let j = 0; j < 2; j++) ecol.set([c.r, c.g, c.b], (e * 2 + j) * 3);
    });
    eg.attributes.aColor.needsUpdate = true;
    U.uHi.value.set(T.hi);
    U.uCr.value.set(T.red);
    U.uCore.value = T.core;
    U.uEA.value = T.ea;
    const bl = T.add ? THREE.AdditiveBlending : THREE.NormalBlending;
    [pts, lines, sparks].forEach((o) => { o.material.blending = bl; o.material.needsUpdate = true; });
    rings.forEach((r, i) => { r.material.blending = bl; r.material.color.set(T.rc[i]); r.material.needsUpdate = true; });
    stars.material.color.set(T.star);
    stars.material.opacity = T.starA;

    const g = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, T.spk0);
    g.addColorStop(.25, 'rgba(255,59,48,.8)');
    g.addColorStop(1, 'rgba(139,15,26,0)');
    cx.clearRect(0, 0, 64, 64);
    cx.fillStyle = g;
    cx.fillRect(0, 0, 64, 64);
    sparkTex.needsUpdate = true;
  }

  const buildMs = Math.round(performance.now() - t0);

  /* ---------- Interaction state ---------- */
  const lit = nlit;
  const sx = new Float32Array(N);
  const sy = new Float32Array(N);
  const V = new THREE.Vector3();
  let formTarget = 0, scatT = -1, mx = -999, my = -999;
  let introT = reduce ? 9 : 0, time = 0, rotY = 0, rotX = 0;
  let hov = -1, blast = null, last = performance.now();
  let fc = 0, ft = 0, fps = 60;
  let gone = false, animId = null;

  const ease = (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  const proj = (v, o) => {
    V.copy(v).applyMatrix4(group.matrixWorld).project(cam);
    o[0] = (V.x * .5 + .5) * W;
    o[1] = (-V.y * .5 + .5) * H;
    o[2] = V.z < 1;
  };
  const tmp = [0, 0, 0];

  function bfs(s) {
    const h = new Int16Array(N).fill(-1);
    h[s] = 0;
    const q = [s];
    for (let i = 0; i < q.length; i++) {
      const u = q[i];
      for (const w of adj[u]) if (h[w] < 0) { h[w] = h[u] + 1; q.push(w); }
    }
    return h;
  }

  let fireTimeout = null;
  function fire() {
    if (hov < 0 || busy) return;
    const hop = bfs(hov);
    let c = 0;
    for (let i = 0; i < N; i++) if (hop[i] > 0 && hop[i] <= 3) c++;
    blast = { t: 0, hop };
    toastEl.textContent = 'Changing ' + nodes[hov].name + ' can reach ' + c + ' files within 3 hops.';
    toastEl.style.opacity = 1;
    clearTimeout(fireTimeout);
    fireTimeout = setTimeout(() => { toastEl.style.opacity = 0; }, 3800);
  }

  function placeLabel(el, x, y, prog, ax, ay) {
    el.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    el.classList.toggle('on', prog > .9);
    el.classList.toggle('near', prog > .9 && Math.hypot(ax - mx, ay - my) < 170);
  }

  /* ---------- Animation loop ---------- */
  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000);
    last = now;
    time += dt;
    introT += dt;
    U.uTime.value = time;

    const prog = ease(Math.min(1, Math.max(0, (introT - .5) / 6)));
    U.uProg.value = prog;
    U.uForm.value += (formTarget - U.uForm.value) * Math.min(1, dt * 1.6);

    if (scatT >= 0) {
      scatT += dt;
      const t = scatT;
      U.uScat.value = t < .6 ? 1 - Math.pow(1 - t / .6, 3) : t < 3.2 ? 1 : t < 4.8 ? 1 - ease((t - 3.2) / 1.6) : 0;
      if (t >= 4.8) { scatT = -1; U.uScat.value = 0; }
    }

    document.body.classList.toggle('mand', formTarget === 1 && scatT < 0);

    const dist = cam.position.length();
    const hh = Math.tan(.48) * dist;
    U.uDist.value = dist;
    U.uS.value = Math.min(hh * .66, hh * W / H * .92);

    const px = mx < 0 ? 0 : mx / W - .5;
    const py = mx < 0 ? 0 : my / H - .5;
    rotY += ((reduce ? 0 : time * .04) + px * 1.6 - rotY) * Math.min(1, dt * 2.5);
    rotX += (py * .7 - rotX) * Math.min(1, dt * 2.5);
    group.rotation.set(rotX, rotY, 0);
    group.updateMatrixWorld();

    cam.position.x += (px * 10 - cam.position.x) * Math.min(1, dt * 2);
    cam.position.y += (-py * 6 - cam.position.y) * Math.min(1, dt * 2);
    cam.position.z += (camZ - cam.position.z) * Math.min(1, dt * 5);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();

    orrery.rotation.y = reduce ? 0 : time * .03;
    rings.forEach((r) => {
      r.rotation.y += reduce ? 0 : r.userData.v * dt;
      r.material.opacity = T.ring * Math.max(0, (prog - .55) / .45);
    });

    U.uDim.value += ((0) - U.uDim.value) * Math.min(1, dt * 6);
    sparks.material.opacity = prog * prog * prog * (1 - U.uForm.value) * (1 - U.uScat.value);

    for (let j = 0; j < 3; j++) {
      const t = (time * .5 + j / 3) * 5;
      const s = ((Math.floor(t) % 5) + 5) % 5;
      const f = t % 1;
      const a = ringPts[s], b = ringPts[(s + 1) % 5];
      if (!a || !b) continue;
      sp[j * 3] = a.x + (b.x - a.x) * f;
      sp[j * 3 + 1] = a.y + (b.y - a.y) * f;
      sp[j * 3 + 2] = a.z + (b.z - a.z) * f;
    }
    sg.attributes.position.needsUpdate = true;

    let best = -1, bd = 1e9;
    const ready = prog > .75;
    const on = mx > -100;

    if (on) {
      U.uM.value.x += ((mx / W * 2 - 1) - U.uM.value.x) * Math.min(1, dt * 9);
      U.uM.value.y += ((1 - my / H * 2) - U.uM.value.y) * Math.min(1, dt * 9);
    }
    U.uMS.value += (0 - U.uMS.value) * Math.min(1, dt * 4);

    for (let i = 0; i < N; i++) {
      proj(nodes[i].f, tmp);
      if (U.uMS.value > .001) {
        const A = U.uAsp.value, nx = V.x, ny = V.y;
        const dx = (nx - U.uM.value.x) * A, dy = ny - U.uM.value.y;
        const r = Math.hypot(dx, dy) + 1e-4;
        const f = Math.exp(-r * r * 7) * U.uMS.value * .16 * (.6 + .8 * ((nodes[i].d * 7.3) % 1));
        const ux = dx / r, uy = dy / r;
        tmp[0] = ((nx + (ux * .35 - uy * .8) * f / A) * .5 + .5) * W;
        tmp[1] = (-(ny + (uy * .35 + ux * .8) * f) * .5 + .5) * H;
      }
      sx[i] = tmp[0];
      sy[i] = tmp[1];
      if (ready && tmp[2]) {
        const d = Math.hypot(tmp[0] - mx, tmp[1] - my);
        if (d < bd && d < 12 + nodes[i].s * 1.6) { bd = d; best = i; }
      }
    }
    hov = ready ? best : -1;

    if (blast) { blast.t += dt; if (blast.t > 6) blast = null; }
    for (let i = 0; i < N; i++) {
      let t = 0;
      if (ready) {
        const d = Math.hypot(sx[i] - mx, sy[i] - my);
        const l = Math.max(0, 1 - d / 150);
        t = l * l * .75;
        if (hov >= 0) {
          if (i === hov) t = 1.2;
          else if (adj[hov].includes(i)) t = Math.max(t, .9);
        }
        if (blast && blast.hop[i] >= 0) {
          const w = Math.exp(-Math.pow((blast.t * 5 - blast.hop[i]) * .8, 2));
          t += w * 1.3;
        }
      }
      lit[i] += (t - lit[i]) * Math.min(1, dt * 10);
    }
    ng.attributes.aLit.needsUpdate = true;

    const pulse = .3 + .25 * Math.sin(time * 3);
    for (let e = 0; e < E; e++) {
      const [a, b, t] = edges[e];
      let v = (lit[a] + lit[b]) * .6;
      if (t === 2) v += pulse;
      elit[e * 2] = elit[e * 2 + 1] = v;
    }
    eg.attributes.aLit.needsUpdate = true;

    const lp = (U.uForm.value < .04 && U.uScat.value < .02) ? prog : 0;
    proj(centers[5], tmp);
    placeLabel(lLoopEl, tmp[0] + 30, tmp[1] - 80, lp, tmp[0], tmp[1]);
    proj(G.f, tmp);
    placeLabel(lGodEl, tmp[0] + 24, tmp[1] - 34, lp, tmp[0], tmp[1]);

    if (hov >= 0) {
      const n = nodes[hov];
      tipEl.innerHTML = n.name + '<br>imports ' + n.o + ', imported by ' + n.i;
      tipEl.style.transform = 'translate(' + (mx + 16) + 'px,' + (my + 16) + 'px)';
      tipEl.style.opacity = 1;
    } else {
      tipEl.style.opacity = 0;
    }

    renderer.render(scene, cam);

    fc++;
    ft += dt;
    if (ft > .5) {
      fps = Math.round(fc / ft);
      fc = 0; ft = 0;
      telEl.textContent = N.toLocaleString() + ' nodes   ' + E.toLocaleString() + ' edges   ' + fps + ' fps   ' + buildMs + ' ms build';
    }
  }

  function loop(now) {
    animId = requestAnimationFrame(loop);
    if (!document.hidden && !gone) frame(now);
  }
  loop(performance.now());

  /* ---------- Resize handler ---------- */
  function handleResize() {
    W = innerWidth;
    H = innerHeight;
    renderer.setSize(W, H, false);
    cam.aspect = W / H;
    U.uAsp.value = W / H;
    cam.updateProjectionMatrix();
    sizeFx();
    baseZ = camZ = W < 700 ? 135 : 100;
  }
  addEventListener('resize', handleResize);

  /* ---------- Pointer handlers ---------- */
  function handlePointerLeave() { mx = my = -999; }
  function handlePointerMove(e) { mx = e.clientX; my = e.clientY; }
  function handleDblClick(e) {
    if (e.target.closest('button,section')) return;
    if (scatT < 0 && U.uProg.value > .5) scatT = 0;
  }

  document.addEventListener('pointerleave', handlePointerLeave);
  addEventListener('pointermove', handlePointerMove);
  addEventListener('dblclick', handleDblClick);

  /* ---------- Apply initial theme ---------- */
  applyTheme();

  /* ---------- Portal animation ---------- */
  function portal(repo) {
    busy = true;
    document.body.classList.add('casting');
    const D = reduce ? 500 : 2600;
    const pt0 = performance.now();
    const S = [...Array(120)].map(() => ({ a: Math.random() * 6.283, o: Math.random() * .1, w: .6 + Math.random() * .8 }));

    (function f(now) {
      const t = Math.min(1, (now - pt0) / D);
      const e = 1 - Math.pow(1 - t, 3);
      const cxp = W / 2, cyp = H / 2;
      const r = e * Math.hypot(W, H) * .6 + 4;

      fctx.clearRect(0, 0, W, H);
      fctx.lineCap = 'round';
      fctx.shadowColor = '#FF3B30';
      fctx.shadowBlur = 6;
      S.forEach((s) => {
        const ang = s.a + t * 6 * s.w;
        const rr = r * (1 - s.o);
        fctx.strokeStyle = 'rgba(255,59,48,' + (.9 - t * .5) + ')';
        fctx.lineWidth = 2;
        fctx.beginPath();
        fctx.arc(cxp, cyp, rr, ang - .14 * s.w, ang);
        fctx.stroke();
      });
      fctx.strokeStyle = 'rgba(' + T.gr + ',' + (.7 * (1 - t * .6)) + ')';
      fctx.lineWidth = 3;
      fctx.beginPath();
      fctx.arc(cxp, cyp, r, 0, 6.283);
      fctx.stroke();
      fctx.setLineDash([6, 10]);
      fctx.strokeStyle = 'rgba(' + T.rr + ',.8)';
      fctx.beginPath();
      fctx.arc(cxp, cyp, r * .82, t * 5, t * 5 + 6.283);
      fctx.stroke();
      fctx.setLineDash([]);
      camZ = baseZ - e * (baseZ - 4);
      flashEl.style.opacity = t > .7 ? (t - .7) / .3 : 0;
      if (t < 1) requestAnimationFrame(f);
      else { fctx.clearRect(0, 0, W, H); finish(repo); }
    })(pt0);
  }

  function finish(repo) {
    dtEl.textContent = repo;
    stepsEl.innerHTML = '';
    doneEl.classList.add('on');
    const stepTexts = [
      'Fetch the latest commit',
      'Parse files into syntax trees',
      'Build the dependency graph',
      'Read git history for churn',
      'Save the snapshot',
    ];
    stepTexts.forEach((s, i) => setTimeout(() => {
      stepsEl.innerHTML += '<b>done</b> ' + s + '<br>';
    }, i * (reduce ? 50 : 550)));
    flashEl.style.opacity = 0;
  }

  /* ---------- Public API ---------- */
  return {

    replay() {
      introT = 0;
      blast = null;
      formTarget = 0;
      U.uForm.value = 0;
      scatT = -1;
      U.uScat.value = 0;
      last = performance.now();
      document.body.classList.remove('mandala');
    },
    closeDone() {
      doneEl.classList.remove('on');
      document.body.classList.remove('casting');
      camZ = baseZ;
      busy = false;
    },
    portal,
    fire,
    destroy() {
      gone = true;
      if (animId) cancelAnimationFrame(animId);
      removeEventListener('resize', handleResize);
      removeEventListener('pointermove', handlePointerMove);
      removeEventListener('dblclick', handleDblClick);
      document.removeEventListener('pointerleave', handlePointerLeave);
      clearTimeout(fireTimeout);
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
    },
  };
}
