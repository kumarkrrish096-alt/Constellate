// adapter.js — Normalizes backend snapshots and demo data into the graph structures used by Constellate views
import * as demoData from './data.js';

/**
 * Deterministic pseudo-random generator seeded for reproducible layouts.
 */
function createRng(seed = 12345) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Computes reachability sets (fwd / rev) for a node in a directed graph.
 */
function computeReachability(id, key, nodes) {
  const visited = new Set();
  const queue = [id];
  while (queue.length > 0) {
    const curr = queue.pop();
    const neighbors = nodes[curr]?.[key] || [];
    for (const next of neighbors) {
      if (!visited.has(next) && next !== id) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return visited;
}

/**
 * Computes 2D force-directed cluster layout positions for an arbitrary graph.
 */
export function computeLayout(nodes, edges, clustersCount) {
  const rng = createRng(42);
  const rnd = () => rng() + rng() + rng() - 1.5;

  const clusterCenters = [[0, 0]];
  const count = Math.max(clustersCount, 1);
  for (let k = 1; k <= count; k++) {
    const angle = ((k - 1) / count) * Math.PI * 2 - Math.PI / 2;
    clusterCenters.push([Math.cos(angle) * 0.65, Math.sin(angle) * 0.65]);
  }

  const positions = nodes.map((n) => {
    const cIdx = Math.min(n.k, clusterCenters.length - 1);
    const center = clusterCenters[cIdx] || [0, 0];
    return {
      x: center[0] + rnd() * 0.28,
      y: center[1] + rnd() * 0.28,
      vx: 0,
      vy: 0,
    };
  });

  const iterations = Math.min(220, Math.max(60, 5000 / (nodes.length || 1)));

  for (let it = 0; it < iterations; it++) {
    // Repulsion between node pairs
    const step = nodes.length > 200 ? 2 : 1;
    for (let i = 0; i < nodes.length; i += step) {
      for (let j = i + 1; j < nodes.length; j += step) {
        const dx = positions[i].x - positions[j].x;
        const dy = positions[i].y - positions[j].y;
        const d2 = Math.max(dx * dx + dy * dy, 0.002);
        const d = Math.sqrt(d2);
        const force = 0.00015 / d2;
        positions[i].vx += (dx / d) * force;
        positions[i].vy += (dy / d) * force;
        positions[j].vx -= (dx / d) * force;
        positions[j].vy -= (dy / d) * force;
      }
    }

    // Attraction along edges
    for (const e of edges) {
      if (positions[e.a] && positions[e.b]) {
        const a = positions[e.a];
        const b = positions[e.b];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.01;
        const force = (d - 0.08) * 0.05;
        a.vx += (dx / d) * force;
        a.vy += (dy / d) * force;
        b.vx -= (dx / d) * force;
        b.vy -= (dy / d) * force;
      }
    }

    // Centering pull toward cluster center
    for (let i = 0; i < nodes.length; i++) {
      const pos = positions[i];
      const cIdx = Math.min(nodes[i].k, clusterCenters.length - 1);
      const center = clusterCenters[cIdx] || [0, 0];
      pos.vx += (center[0] - pos.x) * 0.03;
      pos.vy += (center[1] - pos.y) * 0.03;
      pos.vx *= 0.8;
      pos.vy *= 0.8;
      pos.x = Math.max(-0.95, Math.min(0.95, pos.x + Math.max(-0.03, Math.min(0.03, pos.vx))));
      pos.y = Math.max(-0.95, Math.min(0.95, pos.y + Math.max(-0.03, Math.min(0.03, pos.vy))));
    }
  }

  return positions;
}

/**
 * Adapts a backend snapshot (full AST constellate/1 or minimal tree placeholder)
 * into a complete, safe UI dataset.
 */
export function adaptSnapshot(rawSnapshot, repoLabel = '') {
  if (!rawSnapshot) return getDemoDataset();

  // If already adapted, return as is
  if (rawSnapshot.isAdapted) return rawSnapshot;

  const rawFiles = Array.isArray(rawSnapshot.files) ? rawSnapshot.files : [];
  const rawEdges = Array.isArray(rawSnapshot.edges) ? rawSnapshot.edges : [];
  const rawCycles = Array.isArray(rawSnapshot.cycles) ? rawSnapshot.cycles : [];
  const rawClusters = Array.isArray(rawSnapshot.clusters) ? rawSnapshot.clusters : [];
  const rawCochange = Array.isArray(rawSnapshot.cochange) ? rawSnapshot.cochange : [];
  const rawIssues = rawSnapshot.issues?.items || [];

  // Extract cluster names
  let clusterNames = [];
  if (rawClusters.length > 0) {
    clusterNames = rawClusters.map((c) => c.label || `cluster-${c.id}`);
  } else {
    // Derive clusters from top-level directory names or languages
    const dirs = new Set();
    for (const f of rawFiles) {
      const parts = (f.path || '').split('/');
      dirs.add(parts.length > 1 ? parts[0] : f.language || 'core');
    }
    clusterNames = Array.from(dirs).slice(0, 6);
    if (!clusterNames.length) clusterNames = ['root'];
  }

  const clusterIndexMap = new Map();
  clusterNames.forEach((name, i) => clusterIndexMap.set(name.toLowerCase(), i));

  // Build nodes (N)
  const nodes = rawFiles.map((f, i) => {
    const pathStr = f.path || `file-${i}`;
    let k = typeof f.cluster === 'number' && f.cluster < clusterNames.length ? f.cluster : 0;
    if (typeof f.cluster !== 'number') {
      const topDir = (pathStr.split('/')[0] || '').toLowerCase();
      k = clusterIndexMap.get(topDir) ?? (i % clusterNames.length);
    }

    const complexity = f.complexity ?? f.cx ?? Math.max(1, Math.round((f.lines || 10) / 15));
    
    // Calculate realistic churn: use git history if available, else derive architectural volatility
    let churn = f.churn?.lines ?? f.ch;
    if (churn == null) {
      if (f.churn?.commits) {
        churn = f.churn.commits * 3;
      } else {
        // Derive architectural volatility/churn proxy from code density, size, complexity, and connectivity
        const fnCount = Array.isArray(f.functions) ? f.functions.length : 1;
        const expCount = Array.isArray(f.exports) ? f.exports.length : 1;
        const conn = (f.fanin || 0) * 2.5 + (f.fanout || 0) * 1.5;
        const sizeFactor = Math.min(35, Math.round((f.lines || 10) / 14));
        const cxFactor = Math.min(30, Math.round(complexity * 1.4));
        const densityFactor = Math.min(20, fnCount * 2 + expCount);
        churn = Math.max(8, Math.min(95, sizeFactor + cxFactor + densityFactor + Math.round(conn)));
      }
    }
    const tokens = f.tokens ?? (f.lines ? f.lines * 22 : 120);

    return {
      id: i,
      k,
      name: pathStr,
      path: pathStr,
      cx: complexity,
      ch: churn,
      tok: tokens,
      out: [],
      inn: [],
      fwd: new Set(),
      rev: new Set(),
      bl: f.blastradius ?? 0,
      risk: 0,
      h: 80,
      lines: f.lines || 0,
      language: f.language || 'code',
      exports: f.exports || [],
      functions: f.functions || [],
      test: Boolean(f.test),
      cycle: f.cycle ?? null,
      cyclelines: f.cyclelines || [],
      raw: f,
    };
  });

  // Cycle IDs
  const cyc = new Set();
  const ring = [];
  for (const c of rawCycles) {
    const cycleFiles = Array.isArray(c.path) && c.path.length ? c.path : c.files || [];
    for (const fid of cycleFiles) {
      if (fid < nodes.length) {
        cyc.add(fid);
        if (!ring.includes(fid)) ring.push(fid);
      }
    }
  }

  // Build edges (E)
  const edges = [];
  rawEdges.forEach((e, idx) => {
    const s = typeof e.s === 'number' ? e.s : e.a;
    const t = typeof e.t === 'number' ? e.t : e.b;
    if (s >= 0 && s < nodes.length && t >= 0 && t < nodes.length && s !== t) {
      nodes[s].out.push(t);
      nodes[t].inn.push(s);
      const isCycleEdge = (cyc.has(s) && cyc.has(t)) || Boolean(e.cy);
      edges.push({
        a: s,
        b: t,
        cy: isCycleEdge,
        i: idx,
        kinds: e.kinds || [],
        lines: e.lines || [],
      });
    }
  });

  // Clusters list C: C[k] = [nodeIds]
  const clusterBuckets = clusterNames.map(() => []);
  nodes.forEach((n) => {
    if (clusterBuckets[n.k]) clusterBuckets[n.k].push(n.id);
  });

  // Reachability & Metrics
  const maxComplexity = Math.max(...nodes.map((n) => n.cx), 1);
  nodes.forEach((n) => {
    n.fwd = computeReachability(n.id, 'out', nodes);
    n.rev = computeReachability(n.id, 'inn', nodes);
    n.bl = n.raw?.blastradius !== undefined ? n.raw.blastradius : n.rev.size;
  });

  const maxB = Math.max(...nodes.map((n) => n.bl), 1);

  nodes.forEach((n) => {
    // Risk ratio 0..1 based on complexity, churn, blast radius, and cycle status
    const cxRatio = Math.min(1, n.cx / maxComplexity);
    const chRatio = Math.min(1, n.ch / 100);
    const blRatio = Math.min(1, n.bl / maxB);
    const cycleBonus = cyc.has(n.id) ? 0.2 : 0;

    n.risk = Math.min(1, Math.max(0.04, cxRatio * 0.4 + chRatio * 0.35 + blRatio * 0.25 + cycleBonus));

    // File health is inversely proportional to risk (100 = pristine, 5 = severe hotspot)
    n.h = Math.max(5, Math.min(99, 100 - Math.round(n.risk * 100)));
  });

  // God file & Hotspots
  let godId = -1;
  if (Array.isArray(rawSnapshot.godfiles) && rawSnapshot.godfiles.length > 0) {
    godId = rawSnapshot.godfiles[0];
  } else {
    // Highest blast radius and complexity
    const sortedBySeverity = [...nodes].sort((a, b) => b.bl + b.cx - (a.bl + a.cx));
    if (sortedBySeverity.length > 0 && sortedBySeverity[0].bl > 3) {
      godId = sortedBySeverity[0].id;
    }
  }

  const worst = [...nodes].sort((a, b) => b.risk - a.risk)[0] || nodes[0] || { id: 0, name: 'none', bl: 0, cx: 0, ch: 0, risk: 0 };

  // Cochange (CO)
  const cochange = rawCochange
    .filter((c) => c.a < nodes.length && c.b < nodes.length)
    .map((c) => ({
      a: c.a,
      b: c.b,
      w: c.count || c.w || 3,
    }));

  // Onboarding Pathfinder candidates
  let cand = [];
  if (Array.isArray(rawSnapshot.pathfinder) && rawSnapshot.pathfinder.length > 0) {
    cand = rawSnapshot.pathfinder.map((p, i) => {
      const node = nodes[p.file] || nodes[0];
      const issue = rawIssues[i] || {};
      return {
        n: node,
        sf: Math.round(p.score || 85),
        t: Boolean(node?.test || node?.tests?.length),
        iss: issue.title || `Entry point: ${node?.name}`,
        no: issue.number || 100 + i,
      };
    });
  } else {
    cand = nodes
      .filter((n) => n.id !== godId && !cyc.has(n.id))
      .map((n, i) => ({
        n,
        sf: 100 - Math.round((n.bl / maxB) * 45 + (n.cx / maxComplexity) * 30 + (n.ch / 100) * 25),
        t: n.test || n.inn.length > 0,
        iss: `Refactor & document ${n.name}`,
        no: 100 + i,
      }))
      .sort((a, b) => b.sf - a.sf)
      .slice(0, 8);
  }

  // Precompute layout positions
  const positions = computeLayout(nodes, edges, clusterNames.length);

  // Compute repository-wide Architectural Health
  const avgFileHealth = nodes.length
    ? Math.round(nodes.reduce((acc, n) => acc + n.h, 0) / nodes.length)
    : 80;

  // Architectural deductions
  const cycleCount = rawCycles.length || (ring.length ? 1 : 0);
  const cyclePenalty = Math.min(24, cycleCount * 6 + ring.length * 2);
  const godFilesCount = Array.isArray(rawSnapshot.godfiles) && rawSnapshot.godfiles.length > 0
    ? rawSnapshot.godfiles.length
    : (godId >= 0 ? 1 : 0);
  const godPenalty = Math.min(20, godFilesCount * 8);
  const avgComplexity = nodes.length
    ? nodes.reduce((acc, n) => acc + n.cx, 0) / nodes.length
    : 5;
  const complexityPenalty = avgComplexity > 6 ? Math.min(15, Math.round((avgComplexity - 6) * 1.5)) : 0;

  const repoHealth = nodes.length
    ? Math.max(
        25,
        Math.min(96, Math.round(avgFileHealth * 0.65 + (100 - cyclePenalty - godPenalty - complexityPenalty) * 0.35))
      )
    : 80;

  const stats = {
    a: 1,
    f: nodes.length,
    cycles: cycleCount,
    health: repoHealth,
  };

  const fullname = rawSnapshot.repo?.fullname || rawSnapshot.fullname || repoLabel.split(' · ')[0] || 'repository';
  const sha = rawSnapshot.repo?.sha || rawSnapshot.sha || repoLabel.split(' · ')[1] || 'HEAD';

  return {
    isAdapted: true,
    isDemo: false,
    fullname,
    sha,
    label: `${fullname} · ${sha.slice(0, 7)}`,
    raw: rawSnapshot,
    N: nodes,
    E: edges,
    F: clusterNames,
    C: clusterBuckets,
    CO: cochange,
    god: godId >= 0 ? godId : 0,
    ring,
    cyc,
    maxB,
    U: positions,
    cand,
    worst,
    stats,
  };
}

/**
 * Returns the default seed/demo dataset, or adapts for a requested repository name and SHA.
 */
export function getDemoDataset(repoFullName = 'expressjs/express', sha = 'a3f9c1e', hint = {}) {
  if (!repoFullName || repoFullName === 'expressjs/express') {
    return {
      isAdapted: true,
      isDemo: true,
      fullname: 'expressjs/express',
      sha: sha || 'a3f9c1e',
      label: `expressjs/express · ${(sha || 'a3f9c1e').slice(0, 7)}`,
      N: demoData.N,
      E: demoData.E,
      F: demoData.F,
      C: demoData.C,
      CO: demoData.CO,
      god: demoData.god,
      ring: demoData.ring,
      cyc: demoData.cyc,
      maxB: demoData.maxB,
      U: demoData.U,
      cand: demoData.cand,
      worst: demoData.worst,
      stats: { a: 12, f: 142, cycles: 1, health: 81 },
    };
  }

  // Repository-specific seed profile for demo history entries
  const seedProfiles = {
    'pallets/flask': { f: 86, h: 86, cy: 0, g: -1, lang: 'Python', clusters: ['app', 'blueprints', 'helpers', 'routing', 'views'] },
    'vitejs/vite': { f: 612, h: 72, cy: 3, g: 0, lang: 'TypeScript', clusters: ['client', 'node', 'optimizer', 'plugins', 'server'] },
    'vuejs/core': { f: 1204, h: 68, cy: 4, g: 0, lang: 'TypeScript', clusters: ['compiler', 'reactivity', 'runtime', 'server', 'shared'] },
    'torvalds/linux': { f: 20000, h: 41, cy: 12, g: 0, lang: 'C', clusters: ['arch', 'drivers', 'fs', 'kernel', 'mm', 'net'] },
  };

  const profile = seedProfiles[repoFullName] || {
    f: hint.f || 120,
    h: hint.h || 75,
    cy: hint.cy ?? 1,
    g: hint.g ? 0 : -1,
    lang: hint.l || 'Source',
    clusters: ['core', 'lib', 'util', 'api', 'ui'],
  };

  const sampleCount = Math.min(65, Math.max(20, Math.round(Math.log2(profile.f) * 6)));
  const clusterNames = profile.clusters;
  const nodes = [];
  const cyclesCount = profile.cy;
  const ringNodes = [];

  for (let i = 0; i < sampleCount; i++) {
    const k = i % clusterNames.length;
    const isGod = i === profile.g;
    const inRing = cyclesCount > 0 && i >= 1 && i <= Math.min(5, cyclesCount + 1);
    if (inRing) ringNodes.push(i);

    const ext = profile.lang === 'Python' ? '.py' : profile.lang === 'C' ? '.c' : '.ts';
    const name = `${clusterNames[k]}/module_${i}${ext}`;
    const cx = isGod ? 48 : inRing ? 22 + (i % 8) : Math.max(2, Math.round(18 * (100 - profile.h) / 40 + (i % 7)));
    const ch = isGod ? 85 : inRing ? 60 + (i % 20) : Math.max(8, Math.min(90, Math.round(50 * (100 - profile.h) / 35 + ((i * 13) % 40))));
    const bl = isGod ? 18 : inRing ? 6 + (i % 4) : Math.max(0, Math.round(8 * (100 - profile.h) / 50 + (i % 3)));
    const risk = Math.min(1, Math.max(0.05, (cx / 50) * 0.45 + (ch / 100) * 0.35 + (bl / 20) * 0.2));
    const h = Math.max(10, Math.min(98, 100 - Math.round(risk * 100)));

    nodes.push({
      id: i,
      k,
      name,
      path: name,
      cx,
      ch,
      tok: cx * 35 + 200,
      out: [],
      inn: [],
      fwd: new Set(),
      rev: new Set(),
      bl,
      risk,
      h,
      lines: cx * 18 + 50,
      language: profile.lang,
    });
  }

  // Connect sample edges
  const edges = [];
  for (let i = 1; i < nodes.length; i++) {
    const target = i % 4 === 0 && profile.g >= 0 ? profile.g : (i - 1);
    nodes[i].out.push(target);
    nodes[target].inn.push(i);
    edges.push({ a: i, b: target, cy: ringNodes.includes(i) && ringNodes.includes(target), i: edges.length });
  }

  if (ringNodes.length > 1) {
    for (let r = 0; r < ringNodes.length; r++) {
      const a = ringNodes[r];
      const b = ringNodes[(r + 1) % ringNodes.length];
      if (!nodes[a].out.includes(b)) {
        nodes[a].out.push(b);
        nodes[b].inn.push(a);
        edges.push({ a, b, cy: true, i: edges.length });
      }
    }
  }

  const cyc = new Set(ringNodes);
  const clusterBuckets = clusterNames.map(() => []);
  nodes.forEach((n) => clusterBuckets[n.k]?.push(n.id));
  const positions = computeLayout(nodes, edges, clusterNames.length);

  return {
    isAdapted: true,
    isDemo: true,
    fullname: repoFullName,
    sha: sha || 'HEAD',
    label: `${repoFullName} · ${(sha || 'HEAD').slice(0, 7)}`,
    N: nodes,
    E: edges,
    F: clusterNames,
    C: clusterBuckets,
    CO: [],
    god: profile.g >= 0 ? profile.g : 0,
    ring: ringNodes,
    cyc,
    maxB: Math.max(...nodes.map((n) => n.bl), 1),
    U: positions,
    cand: nodes.slice(0, 5).map((n, i) => ({ n, sf: 90 - i * 5, t: true, iss: `Entry point for ${n.name}`, no: 100 + i })),
    worst: [...nodes].sort((a, b) => b.risk - a.risk)[0] || nodes[0],
    stats: { a: 1, f: profile.f, cycles: profile.cy, health: profile.h },
  };
}
