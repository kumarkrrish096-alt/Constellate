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
    const churn = f.churn?.lines ?? f.ch ?? (f.churn?.commits ? f.churn.commits * 3 : 10);
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

    // Risk ratio 0..1 based on blast radius, complexity, and churn
    const cxRatio = Math.min(1, n.cx / maxComplexity);
    const chRatio = Math.min(1, n.ch / 100);
    n.risk = Math.min(1, cxRatio * 0.5 + chRatio * 0.5);

    if (n.raw?.health?.score !== undefined) {
      n.h = Math.round(n.raw.health.score);
    } else {
      n.h = Math.max(10, 100 - Math.round(n.risk * 100));
    }
  });

  const maxB = Math.max(...nodes.map((n) => n.bl), 1);

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

  // Compute summary statistics
  const stats = {
    a: 1,
    f: nodes.length,
    cycles: rawCycles.length || ring.length ? 1 : 0,
    health: nodes.length ? Math.round(nodes.reduce((acc, n) => acc + n.h, 0) / nodes.length) : 80,
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
 * Returns the default seed/demo dataset.
 */
export function getDemoDataset() {
  return {
    isAdapted: true,
    isDemo: true,
    fullname: 'expressjs/express',
    sha: 'a3f9c1e',
    label: 'expressjs/express · a3f9c1e',
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
    stats: { a: 12, f: 4812, cycles: 9, health: 74 },
  };
}
