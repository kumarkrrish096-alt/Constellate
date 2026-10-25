import path from "path";
import Graph from "graphology";
import { stronglyConnectedComponents } from "graphology-components";
import louvain from "graphology-communities-louvain";

const posix = path.posix;

/**
 * Resolve every import of every parsed source file into file-to-file edges.
 *
 * nodes: sorted source file paths (index = node id everywhere downstream)
 * edges: [{ source, target, kinds, lines, typeonly, count }] (source imports target)
 * perfile: Map path -> { external: [...], builtin: [...], unresolved: [...] }
 */
export function buildfilegraph(parsed, resolver) {
  const nodes = parsed.map((f) => f.path);
  const edgemap = new Map();
  const perfile = new Map();
  const externalcounts = Object.create(null);
  const unresolved = [];

  for (const file of parsed) {
    const info = { external: new Set(), builtin: new Set(), unresolved: [] };
    perfile.set(file.path, info);

    for (const entry of file.imports || []) {
      for (const outcome of resolver.resolve(file.path, entry, file.language)) {
        if (outcome.target) {
          if (outcome.target === file.path) continue; // a file importing itself is noise
          const key = `${file.path}\0${outcome.target}`;
          let edge = edgemap.get(key);
          if (!edge) {
            edge = { source: file.path, target: outcome.target, kinds: new Set(), lines: [], typeonly: true, count: 0 };
            edgemap.set(key, edge);
          }
          edge.kinds.add(entry.kind);
          if (!edge.lines.includes(entry.line)) edge.lines.push(entry.line);
          edge.typeonly &&= entry.typeonly;
          edge.count++;
        } else if (outcome.external) {
          info.external.add(outcome.external);
        } else if (outcome.builtin) {
          info.builtin.add(outcome.builtin);
        } else if (outcome.unresolved != null) {
          info.unresolved.push({ source: outcome.unresolved, line: entry.line });
          if (unresolved.length < 500) unresolved.push({ file: file.path, source: outcome.unresolved, line: entry.line });
        }
      }
    }

    for (const name of info.external) externalcounts[name] = (externalcounts[name] || 0) + 1;
  }

  const edges = [...edgemap.values()]
    .map((e) => ({ ...e, kinds: [...e.kinds].sort(), lines: e.lines.sort((a, b) => a - b) }))
    .sort((a, b) => (a.source === b.source ? cmp(a.target, b.target) : cmp(a.source, b.source)));

  return { nodes, edges, perfile, externalcounts, unresolved };
}

/**
 * Cycles, clusters and hierarchy levels for the file graph.
 */
export function analysegraph(nodes, edges, { seed = 1 } = {}) {
  const all = new Graph({ type: "directed", allowSelfLoops: false });
  const runtime = new Graph({ type: "directed", allowSelfLoops: false });
  for (const node of nodes) {
    all.addNode(node);
    runtime.addNode(node);
  }
  for (const edge of edges) {
    all.mergeEdge(edge.source, edge.target, { weight: edge.count });
    if (!edge.typeonly) runtime.mergeEdge(edge.source, edge.target);
  }

  return {
    cycles: findcycles(runtime, edges),
    ...findclusters(all, seed),
    condensation: condense(nodes, all),
  };
}

// ── Circular imports ────────────────────────────────────────

/**
 * Every strongly connected component with more than one file is a set of files
 * that import each other in a loop. For each, report one concrete loop
 * (a -> b -> c -> a) and, per file, the import lines that point back into the loop.
 */
function findcycles(runtime, edges) {
  const components = stronglyConnectedComponents(runtime)
    .filter((c) => c.length > 1)
    .map((c) => c.sort())
    .sort((a, b) => b.length - a.length || cmp(a[0], b[0]));

  return components.map((files, id) => {
    const members = new Set(files);
    const lines = Object.create(null);
    for (const edge of edges) {
      if (!edge.typeonly && members.has(edge.source) && members.has(edge.target)) {
        (lines[edge.source] ||= []).push(...edge.lines);
      }
    }
    for (const file of Object.keys(lines)) lines[file] = [...new Set(lines[file])].sort((a, b) => a - b);
    return { id, files, path: shortestloop(runtime, files[0], members), importlines: lines };
  });
}

/** Shortest path start -> ... -> start inside one component (breadth-first). */
function shortestloop(graph, start, members) {
  const previous = new Map();
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i];
    for (const next of graph.outNeighbors(node).sort()) {
      if (!members.has(next)) continue;
      if (next === start) {
        const loop = [start];
        for (let at = node; at !== start; at = previous.get(at)) loop.splice(1, 0, at);
        return [...loop, start];
      }
      if (!previous.has(next)) {
        previous.set(next, node);
        queue.push(next);
      }
    }
  }
  return [start, start];
}

// ── Architectural clusters ──────────────────────────────────

/**
 * Louvain community detection groups files that import each other more than
 * they import the rest. A seeded random generator keeps the result identical
 * for the same input. Files with no imports at all are grouped by folder
 * instead of each becoming a one-file cluster.
 */
function findclusters(graph, seed) {
  const communityof = new Map();

  if (graph.size > 0) {
    const communities = louvain(graph, { getEdgeWeight: "weight", rng: seededrandom(seed) });
    for (const [node, community] of Object.entries(communities)) {
      if (graph.degree(node) > 0) communityof.set(node, `c${community}`);
    }
  }
  graph.forEachNode((node) => {
    if (!communityof.has(node)) communityof.set(node, `dir:${topfolder(node)}`);
  });

  const groups = new Map();
  for (const [node, key] of communityof) {
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(node);
  }

  const clusters = [...groups.values()]
    .map((files) => files.sort())
    .map((files) => ({ files, label: clusterlabel(files) }))
    .sort((a, b) => b.files.length - a.files.length || cmp(a.label, b.label))
    .map((c, id) => ({ id, label: c.label, size: c.files.length, files: c.files }));
  disambiguatelabels(clusters);

  const clusterof = new Map();
  for (const cluster of clusters) for (const file of cluster.files) clusterof.set(file, cluster.id);
  return { clusters, clusterof };
}

/** Deepest folder shared by the cluster's files, or its most common top folder. */
function clusterlabel(files) {
  const dirs = files.map((f) => posix.dirname(f).split("/"));
  const common = [];
  for (let i = 0; ; i++) {
    const part = dirs[0][i];
    if (part === undefined || part === "." || !dirs.every((d) => d[i] === part)) break;
    common.push(part);
  }
  if (common.length) return common.join("/");

  const counts = Object.create(null);
  for (const f of files) counts[topfolder(f)] = (counts[topfolder(f)] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))[0][0];
}

/**
 * Two clusters labelled "backend" are useless in a legend. Give each duplicate
 * the folder most of its files live in; if that still clashes, number them.
 */
function disambiguatelabels(clusters) {
  const bylabel = new Map();
  for (const c of clusters) (bylabel.get(c.label) || bylabel.set(c.label, []).get(c.label)).push(c);

  for (const group of bylabel.values()) {
    if (group.length < 2) continue;
    for (const c of group) {
      const counts = Object.create(null);
      for (const f of c.files) {
        const dir = posix.dirname(f);
        counts[dir] = (counts[dir] || 0) + 1;
      }
      c.label = Object.entries(counts).sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))[0][0];
    }
    const seen = new Map();
    for (const c of group) {
      const n = (seen.get(c.label) || 0) + 1;
      seen.set(c.label, n);
      if (n > 1) c.label = `${c.label} (${n})`;
    }
  }
}

const topfolder = (file) => (file.includes("/") ? file.split("/")[0] : "(root)");

// ── Condensation: the graph with each cycle collapsed into one node ──

/**
 * Collapsing every strongly connected component gives a DAG, which makes
 * hierarchy levels and blast radius well defined even with cycles.
 *
 * Returns { componentof: Int32Array (node index -> component),
 *           components: [[node indexes]], order: topological order of components,
 *           out: component adjacency (importer -> imported), levels: Int32Array per node }
 */
function condense(nodes, graph) {
  const index = new Map(nodes.map((n, i) => [n, i]));
  const sccs = stronglyConnectedComponents(graph).map((c) => c.map((n) => index.get(n)).sort((a, b) => a - b));
  sccs.sort((a, b) => a[0] - b[0]);

  const componentof = new Int32Array(nodes.length);
  sccs.forEach((members, c) => members.forEach((n) => (componentof[n] = c)));

  const out = sccs.map(() => new Set());
  const indegree = new Int32Array(sccs.length);
  graph.forEachEdge((edge, attrs, source, target) => {
    const a = componentof[index.get(source)];
    const b = componentof[index.get(target)];
    if (a !== b && !out[a].has(b)) {
      out[a].add(b);
      indegree[b]++;
    }
  });

  // Kahn's algorithm: importers come before what they import.
  const order = [];
  const remaining = Int32Array.from(indegree);
  for (let c = 0; c < sccs.length; c++) if (remaining[c] === 0) order.push(c);
  for (let i = 0; i < order.length; i++) {
    for (const next of out[order[i]]) if (--remaining[next] === 0) order.push(next);
  }

  // Level = longest import chain from a file nothing imports (an entry point).
  const componentlevel = new Int32Array(sccs.length);
  for (const c of order) for (const next of out[c]) componentlevel[next] = Math.max(componentlevel[next], componentlevel[c] + 1);
  const levels = new Int32Array(nodes.length);
  for (let n = 0; n < nodes.length; n++) levels[n] = componentlevel[componentof[n]];

  return { componentof, components: sccs, order, out: out.map((s) => [...s].sort((a, b) => a - b)), levels };
}

// ── helpers ─────────────────────────────────────────────────

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Mulberry32: tiny deterministic PRNG returning floats in [0, 1). */
export function seededrandom(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
