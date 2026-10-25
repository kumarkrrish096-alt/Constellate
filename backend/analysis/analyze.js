import path from "path";
import { listfiles } from "./files.js";
import { parsefiles } from "./parse/pool.js";
import { createresolver } from "./resolve.js";
import { buildfilegraph, analysegraph } from "./graph.js";
import { buildcallgraph } from "./callgraph.js";
import { readhistory } from "./history.js";
import { blastradius, healthscores, istestfile, testsfor, pathfinder, matchissues, percentiles } from "./metrics.js";
import { fetchgoodfirstissues } from "./issues.js";

export const SNAPSHOT_FORMAT = "constellate/1";

/**
 * Analyse a folder of source code and return the snapshot data.
 *
 * options:
 *   repo:     { fullname, sha, branch } when the folder is a GitHub commit
 *             (enables raw source URLs and good-first-issue lookup)
 *   history:  false to skip git history (default: read it when available)
 *   issues:   an array of issues to match, or true to fetch them from GitHub
 *   limits:   { maxFiles, maxFileBytes } for listfiles()
 *   report:   (stage, progress 0..100) callback for the job's progress bar
 *
 * Snapshot shape (all file references are indexes into `files`):
 *   files[]      { id, path, language, lines, tokens, complexity, exports, functions (ids into functions[]),
 *                  cluster, level, fanin, fanout, blastradius, churn, health, tests, cycle, cyclelines, ... }
 *   edges[]      { s, t, kinds, lines, typeonly }        s imports t; lines = import lines in s
 *   functions[]  { file, name, line, endline, complexity, tokens }
 *   calls[]      [caller, callee]                         ids into functions[]
 *   cycles[]     { id, files, path }                      path = one concrete loop a -> b -> a
 *   clusters[]   { id, label, size, files };  clusteredges[] { s, t, weight }
 *   cochange[]   { a, b, count, strength }
 *   hotspots[], godfiles[], pathfinder[], issues, lod, tree[], stats, timings
 */
export async function analyzefolder(root, options = {}) {
  const report = options.report || (() => {});
  const repo = options.repo || null;
  const timings = {};
  const started = Date.now();
  const time = async (name, fn) => {
    const t = Date.now();
    const result = await fn();
    timings[name] = Date.now() - t;
    return result;
  };
  root = path.resolve(root);

  // 1. Files and languages
  report("listing files", 5);
  const listing = await time("walk", () => listfiles(root, options.limits));
  const sourcefiles = listing.files.filter((f) => f.source);

  // 2. Parse every source file in worker threads
  report("parsing", 10);
  const results = await time("parse", () =>
    parsefiles(sourcefiles, { onprogress: (share) => report("parsing", 10 + Math.round(share * 50)) })
  );
  const parsed = sourcefiles
    .map((file, i) => ({ ...file, ...results[i] }))
    .filter((f) => !f.binary);

  // 3. Imports -> file graph; calls -> function graph
  report("resolving imports", 62);
  const resolver = createresolver(root, listing.files);
  const graph = await time("resolve", () => buildfilegraph(parsed, resolver));
  const ids = new Map(graph.nodes.map((p, i) => [p, i]));

  report("building graph", 68);
  const structure = await time("graph", () => analysegraph(graph.nodes, graph.edges));
  const calls = await time("callgraph", () => buildcallgraph(parsed, resolver));

  // 4. Git history (churn, co-change)
  report("reading history", 76);
  const history =
    options.history === false ? null : await time("history", () => readhistory(root, new Set(graph.nodes)));
  const hashistory = Boolean(history && history.window.commits > 0);

  // 5. Metrics
  report("scoring", 84);
  const metricsstart = Date.now();
  const blast = blastradius(graph.nodes.length, structure.condensation);
  const fanin = new Int32Array(graph.nodes.length);
  const fanout = new Int32Array(graph.nodes.length);
  for (const e of graph.edges) {
    fanin[ids.get(e.target)]++;
    fanout[ids.get(e.source)]++;
  }
  const cycleof = new Map();
  for (const cycle of structure.cycles) for (const f of cycle.files) cycleof.set(f, cycle);
  const tests = testsfor(graph.nodes, graph.edges);

  const files = parsed.map((f, id) => {
    const churn = history?.churn.get(f.path) || null;
    const info = graph.perfile.get(f.path);
    const cycle = cycleof.get(f.path);
    return {
      id,
      path: f.path,
      language: f.language,
      size: f.size,
      lines: f.lines ?? 0,
      tokens: f.tokens ?? 0,
      parsed: Boolean(f.parsed),
      syntaxerrors: Boolean(f.syntaxerrors),
      error: f.error || null,
      complexity: f.parsed ? f.complexity : null,
      exports: f.exports || [],
      functions: calls.byfile.get(f.path) || [],
      external: [...info.external].sort(),
      builtin: [...info.builtin].sort(),
      unresolved: info.unresolved,
      cluster: structure.clusterof.get(f.path),
      level: structure.condensation.levels[id],
      fanin: fanin[id],
      fanout: fanout[id],
      blastradius: blast.radius[id],
      churn: churn ? { commits: churn.commits, lines: churn.lines, lastchanged: churn.lastchanged } : null,
      test: istestfile(f.path),
      tests: tests.get(f.path) || [],
      cycle: cycle ? cycle.id : null,
      cyclelines: cycle?.importlines[f.path] || [],
    };
  });

  // Health and pathfinder only for files whose complexity is known (parsed).
  const scored = files.filter((f) => f.parsed);
  const scoreinput = scored.map((f) => ({
    path: f.path,
    complexity: f.complexity,
    lines: f.lines,
    fanin: f.fanin,
    blastradius: f.blastradius,
    churnlines: f.churn?.lines ?? 0,
    churncommits: f.churn?.commits ?? 0,
    test: f.test,
    tests: f.tests,
    incycle: f.cycle !== null,
    exports: f.exports,
  }));
  const health = healthscores(scoreinput, { hashistory });
  scored.forEach((f, i) => {
    f.health = health[i];
  });
  for (const f of files) f.health ??= null;

  const paths = pathfinder(scoreinput, { hashistory });
  timings.metrics = Date.now() - metricsstart;

  // 6. Good-first-issues (optional, needs the GitHub repo)
  let issues = { available: false, error: null, items: [] };
  if (Array.isArray(options.issues) || (options.issues === true && repo?.fullname)) {
    report("matching issues", 90);
    const fetched = Array.isArray(options.issues)
      ? { issues: options.issues, error: null }
      : await time("issues", () => fetchgoodfirstissues(repo.fullname));
    issues = {
      available: true,
      error: fetched.error,
      items: matchissues(fetched.issues, scoreinput, paths.easeoffile).map((issue) => ({
        number: issue.number,
        title: issue.title,
        url: issue.url,
        labels: issue.labels,
        comments: issue.comments,
        ease: issue.ease,
        files: issue.files.map((l) => ({ file: ids.get(l.file), score: l.score, reasons: l.reasons })),
      })),
    };
  }

  // 7. Assemble
  report("assembling snapshot", 95);
  const toid = (p) => ids.get(p);
  // Every file keeps its health score; the hotspot list itself points at product code, not tests.
  const byscore = scored.filter((f) => !f.test).sort((a, b) => b.health.score - a.health.score || a.id - b.id);

  const snapshot = {
    format: SNAPSHOT_FORMAT,
    repo: repo ? { fullname: repo.fullname, sha: repo.sha, branch: repo.branch ?? null } : null,
    generatedat: new Date().toISOString(),
    source:
      repo?.fullname && repo?.sha
        ? { kind: "github-raw", url: `https://raw.githubusercontent.com/${repo.fullname}/${repo.sha}/{path}` }
        : { kind: "none" },
    truncated: listing.truncated,
    skipped: listing.skipped,
    history: history
      ? { available: hashistory, months: history.window.months, commits: history.window.commits }
      : { available: false, months: null, commits: 0 },
    stats: {
      files: listing.files.length,
      sourcefiles: files.length,
      parsedfiles: scored.length,
      lines: files.reduce((s, f) => s + f.lines, 0),
      tokens: files.reduce((s, f) => s + f.tokens, 0),
      languages: countby(files, (f) => f.language),
      edges: graph.edges.length,
      cycles: structure.cycles.length,
      clusters: structure.clusters.length,
      functions: calls.functions.length,
      calls: calls.stats.calls,
      callsresolved: calls.stats.resolved,
      externalpackages: Object.entries(graph.externalcounts)
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .slice(0, 30)
        .map(([name, count]) => ({ name, files: count })),
      unresolvedimports: graph.unresolved.length,
      blastradiusapproximate: blast.approximate,
    },
    tree: listing.files.map((f) => ({ path: f.path, size: f.size, language: f.language })),
    files,
    edges: graph.edges.map((e) => ({ s: toid(e.source), t: toid(e.target), kinds: e.kinds, lines: e.lines, typeonly: e.typeonly })),
    functions: calls.functions.map((fn) => ({ ...fn, file: toid(fn.file) })),
    calls: calls.edges,
    callgraphtruncated: calls.stats.truncated,
    cycles: structure.cycles.map((c) => ({ id: c.id, files: c.files.map(toid), path: c.path.map(toid) })),
    clusters: structure.clusters.map((c) => ({ id: c.id, label: c.label, size: c.size, files: c.files.map(toid) })),
    clusteredges: clusteredges(graph.edges, structure.clusterof),
    cochange: (history?.cochange || []).map((p) => ({ a: toid(p.a), b: toid(p.b), count: p.count, strength: p.strength })),
    hotspots: byscore.slice(0, 20).map((f) => f.id),
    godfiles: scored.filter((f) => f.health.god).map((f) => f.id),
    pathfinder: paths.top.map((p) => ({ file: toid(p.file), score: p.score, reasons: p.reasons })),
    issues,
    lod: levelofdetail(files),
    timings: { ...timings, total: Date.now() - started },
  };

  report("done", 100);
  return snapshot;
}

/**
 * Level of detail for very large repositories: files ranked by importance
 * (how many import them, blast radius, complexity), so the frontend can draw
 * the top N first and add the rest as the user zooms in.
 */
function levelofdetail(files) {
  const fanin = percentiles(files.map((f) => f.fanin));
  const blast = percentiles(files.map((f) => f.blastradius));
  const complexity = percentiles(files.map((f) => f.complexity ?? 0));
  const importance = files.map((f, i) => 0.5 * fanin[i] + 0.3 * blast[i] + 0.2 * complexity[i]);
  const ranked = files.map((f) => f.id).sort((a, b) => importance[b] - importance[a] || a - b);
  return { ranked, suggestedinitial: Math.min(files.length, 500) };
}

/** Import counts between clusters: the zoomed-out architecture view. */
function clusteredges(edges, clusterof) {
  const weights = new Map();
  for (const e of edges) {
    const a = clusterof.get(e.source);
    const b = clusterof.get(e.target);
    if (a === b) continue;
    const key = `${a}>${b}`;
    weights.set(key, (weights.get(key) || 0) + 1);
  }
  return [...weights]
    .map(([key, weight]) => {
      const [s, t] = key.split(">").map(Number);
      return { s, t, weight };
    })
    .sort((x, y) => x.s - y.s || x.t - y.t);
}

function countby(items, keyof) {
  const counts = Object.create(null);
  for (const item of items) {
    const key = keyof(item) || "other";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}
