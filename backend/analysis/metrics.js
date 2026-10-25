import path from "path";

const posix = path.posix;

// ── Blast radius ────────────────────────────────────────────

/**
 * For every file, how many other files depend on it directly or indirectly
 * (reverse reachability): what could break if you change it.
 *
 * Works on the condensation (cycles collapsed, so the graph is acyclic) with
 * one bitset per component: walking importers-before-imported, each component
 * passes its set of dependents (plus itself) on to everything it imports.
 * Cost ~ edges x components / 32, fine for tens of thousands of files.
 * Files in the same cycle all affect each other, so they count too.
 */
export function blastradius(nodecount, condensation) {
  const { componentof, components, order, out } = condensation;
  const count = components.length;
  const words = Math.ceil(count / 32);
  const result = new Int32Array(nodecount);

  // ~100 MB of bitsets at most; beyond that, report direct dependents only.
  if (count * words > 25_000_000) return { radius: directdependents(nodecount, condensation), approximate: true };

  const bits = new Uint32Array(count * words);
  for (const c of order) {
    const from = c * words;
    for (const next of out[c]) {
      const to = next * words;
      for (let w = 0; w < words; w++) bits[to + w] |= bits[from + w];
      bits[to + (c >>> 5)] |= 1 << (c & 31);
    }
  }

  const componentradius = new Int32Array(count);
  for (let c = 0; c < count; c++) {
    let total = components[c].length - 1; // the rest of its own cycle
    const base = c * words;
    for (let w = 0; w < words; w++) {
      let word = bits[base + w];
      while (word !== 0) {
        const low = word & -word;
        total += components[(w << 5) + (31 - Math.clz32(low))].length;
        word ^= low;
      }
    }
    componentradius[c] = total;
  }
  for (let n = 0; n < nodecount; n++) result[n] = componentradius[componentof[n]];
  return { radius: result, approximate: false };
}

function directdependents(nodecount, { componentof, components, out }) {
  const counts = new Int32Array(components.length);
  out.forEach((targets, c) => targets.forEach((t) => (counts[t] += components[c].length)));
  const result = new Int32Array(nodecount);
  for (let n = 0; n < nodecount; n++) result[n] = counts[componentof[n]] + components[componentof[n]].length - 1;
  return result;
}

// ── Percentiles ─────────────────────────────────────────────

/** Percentile rank of each value in 0..1 (ties share the middle rank). */
export function percentiles(values) {
  const n = values.length;
  if (n === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const below = new Map();
  const equal = new Map();
  for (let i = 0; i < n; i++) {
    const v = sorted[i];
    if (!below.has(v)) below.set(v, i);
    equal.set(v, (equal.get(v) || 0) + 1);
  }
  return values.map((v) => (n === 1 ? 0.5 : (below.get(v) + (equal.get(v) - 1) / 2) / (n - 1)));
}

const quantile = (values, q) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};

// ── Health and god files ────────────────────────────────────

/**
 * Hotspot score 0..100 per file: high when a file is both complex and
 * frequently changed (the geometric mean of the two percentiles). Without
 * git history it is the complexity percentile alone.
 *
 * God file: many files depend on it, it is among the most complex, and it is long.
 */
export function healthscores(files, { hashistory }) {
  const complexity = percentiles(files.map((f) => f.complexity));
  const churn = percentiles(files.map((f) => f.churnlines));
  const faninp90 = Math.max(5, quantile(files.map((f) => f.fanin), 0.9));
  const complexityp90 = quantile(files.map((f) => f.complexity), 0.9);

  return files.map((f, i) => {
    const c = complexity[i];
    const h = churn[i];
    const score = Math.round(100 * (hashistory ? Math.sqrt(c * h) : c));
    const reasons = [];
    if (c >= 0.9) reasons.push(`more complex than ${Math.round(c * 100)}% of files (cyclomatic ${f.complexity})`);
    if (hashistory && h >= 0.9) reasons.push(`changed often (${f.churncommits} commits, ${f.churnlines} lines)`);
    if (f.fanin >= faninp90) reasons.push(`imported by ${f.fanin} files`);

    const god = !f.test && f.fanin >= faninp90 && f.complexity >= complexityp90 && f.complexity > 10 && f.lines >= 300;
    return {
      score,
      risk: score >= 75 ? "high" : score >= 50 ? "medium" : "low",
      complexitypercentile: Math.round(c * 100) / 100,
      churnpercentile: hashistory ? Math.round(h * 100) / 100 : null,
      god,
      reasons,
    };
  });
}

// ── Tests ───────────────────────────────────────────────────

export function istestfile(file) {
  return (
    /(^|\/)(__tests__|__mocks__|tests?|specs?|e2e|cypress)\//i.test(file) ||
    /\.(test|spec|e2e)\.[cm]?[jt]sx?$/i.test(file) ||
    /(^|\/)test_[^/]*\.py$|_test\.py$|(^|\/)conftest\.py$/i.test(file)
  );
}

/**
 * Tests near each file: test files that import it, or whose name matches it
 * (button.test.js, test_button.py, button_test.py).
 */
export function testsfor(paths, edges) {
  const tests = new Map();
  const add = (file, test) => {
    if (!tests.has(file)) tests.set(file, new Set());
    tests.get(file).add(test);
  };

  for (const edge of edges) if (istestfile(edge.source) && !istestfile(edge.target)) add(edge.target, edge.source);

  // Name matching: only files NAMED like tests (a config file inside tests/ is not one).
  // Each test goes to the single best-placed file with that name.
  const stem = (p) => posix.basename(p).replace(/\.[^.]+$/, "");
  const bystem = new Map();
  for (const p of paths) {
    if (istestfile(p) || stem(p) === "index" || stem(p) === "__init__") continue;
    if (!bystem.has(stem(p))) bystem.set(stem(p), []);
    bystem.get(stem(p)).push(p);
  }
  for (const test of paths) {
    if (!TEST_NAME.test(test)) continue;
    const s = stem(test).replace(/\.(test|spec|e2e)$/i, "").replace(/^test_|_test$/i, "");
    const candidates = (bystem.get(s) || []).filter((file) => nearby(file, test));
    if (!candidates.length) continue;
    const best = Math.max(...candidates.map((file) => placement(file, test)));
    for (const file of candidates) if (placement(file, test) === best) add(file, test);
  }

  return new Map([...tests].map(([file, set]) => [file, [...set].sort()]));
}

const TEST_NAME = /\.(test|spec|e2e)\.[cm]?[jt]sx?$|(^|\/)test_[^/]*\.py$|_test\.py$/i;

/** Higher = more likely the file a test is about: shares more folders, shallower, not docs/examples. */
function placement(file, test) {
  const a = posix.dirname(file).split("/");
  const b = posix.dirname(test).split("/");
  let shared = 0;
  while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared++;
  return shared * 10 - a.length - (PERIPHERAL.test(file) ? 5 : 0);
}

/**
 * A name-matched test only counts if it lives in the same part of the tree:
 * its folder (with tests/__tests__/spec segments removed) is the file's
 * folder, an ancestor of it (tests/ at the package or repo root), or at most
 * two levels below it.
 */
function nearby(file, test) {
  const filedir = posix.dirname(file).replace(/^\.$/, "");
  const testdir = posix
    .dirname(test)
    .split("/")
    .filter((part) => !/^(__tests__|__mocks__|tests?|specs?|e2e|unit|integration)$/i.test(part) && part !== ".")
    .join("/");

  const within = (inner, outer) => outer === "" || inner === outer || inner.startsWith(`${outer}/`);
  if (within(filedir, testdir)) return true;
  return within(testdir, filedir) && testdir.split("/").length - (filedir ? filedir.split("/").length : 0) <= 2;
}

// ── Onboarding pathfinder ───────────────────────────────────

// Code that is not the product itself: fine to touch, but a weaker first PR.
const PERIPHERAL = /(^|\/)(examples?|bench(marks?)?|scripts|docs?|demos?|fixtures)\//i;

/**
 * Rank files that are safe first contributions: few files depend on them,
 * simple, stable, covered by tests, not part of an import cycle.
 * A file whose blast radius exceeds 3% of the files (kept between 5 and 25)
 * is never suggested, however good its other numbers are.
 */
export function pathfinder(files, { hashistory, limit = 15 }) {
  const blast = percentiles(files.map((f) => f.blastradius));
  const complexity = percentiles(files.map((f) => f.complexity));
  const churn = percentiles(files.map((f) => f.churnlines));
  const maxblast = Math.min(25, Math.max(5, Math.round(files.length * 0.03)));

  const ranked = [];
  files.forEach((f, i) => {
    if (f.test || f.incycle || f.lines < 5 || f.lines > 500 || f.blastradius > maxblast) return;
    const stable = hashistory ? 1 - churn[i] : 0.5;
    let ease = 0.35 * (1 - blast[i]) + 0.25 * (1 - complexity[i]) + 0.15 * stable + 0.25 * (f.tests.length ? 1 : 0);
    if (PERIPHERAL.test(f.path)) ease -= 0.1;

    const reasons = [];
    reasons.push(
      f.blastradius === 0
        ? "nothing else depends on it"
        : `changing it can affect ${f.blastradius} other file${f.blastradius === 1 ? "" : "s"}`
    );
    reasons.push(`cyclomatic complexity ${f.complexity}`);
    if (f.tests.length) reasons.push(`has tests: ${f.tests.slice(0, 2).join(", ")}`);
    if (hashistory) {
      reasons.push(
        f.churncommits ? `${f.churncommits} recent commit${f.churncommits === 1 ? "" : "s"}` : "not changed recently"
      );
    }

    ranked.push({ file: f.path, score: Math.max(0, Math.round(ease * 100)), reasons });
  });

  ranked.sort((a, b) => b.score - a.score || (a.file < b.file ? -1 : 1));
  // top picks for the UI, plus every candidate's score for ranking issues
  return { top: ranked.slice(0, limit), easeoffile: new Map(ranked.map((r) => [r.file, r.score])) };
}

// ── Good-first-issue matching ───────────────────────────────

const COMMON_WORDS = new Set(["index", "readme", "config", "utils", "error", "string", "value", "update", "default"]);

/**
 * Link each open good-first-issue to the files it is probably about:
 *   a full path mentioned in the text      +5
 *   a file name (button.tsx) mentioned     +3
 *   an exported identifier mentioned       +2  (only code-like words: camelCase, snake_case)
 * Issues are then ranked by how safe their files are (pathfinder ease).
 */
export function matchissues(issues, files, easeoffile) {
  const bypath = new Set(files.map((f) => f.path));
  const bybasename = new Map();
  const bysymbol = new Map();
  for (const f of files) {
    const base = posix.basename(f.path).toLowerCase();
    if (base.length >= 5) (bybasename.get(base) || bybasename.set(base, []).get(base)).push(f.path);
    for (const name of f.exports || []) {
      if (name.length < 5 || COMMON_WORDS.has(name.toLowerCase())) continue;
      if (!/[A-Z_]/.test(name.slice(1))) continue; // skip plain English words
      (bysymbol.get(name) || bysymbol.set(name, []).get(name)).push(f.path);
    }
  }

  const matched = issues.map((issue) => {
    const text = `${issue.title}\n${issue.body || ""}`.slice(0, 20000);
    const scores = new Map();
    const reasons = new Map();
    const bump = (file, points, reason) => {
      scores.set(file, (scores.get(file) || 0) + points);
      if (!reasons.has(file)) reasons.set(file, new Set());
      reasons.get(file).add(reason);
    };

    for (const token of new Set(text.match(/[\w@$./-]+/g) || [])) {
      const clean = token.replace(/^[./]+|[.,:;)]+$/g, "");
      if (bypath.has(clean)) bump(clean, 5, `mentions ${clean}`);
      const files = bybasename.get(posix.basename(clean).toLowerCase());
      if (files && files.length <= 3) files.forEach((f) => bump(f, 3, `mentions ${posix.basename(clean)}`));
      const symbolfiles = bysymbol.get(clean);
      if (symbolfiles && symbolfiles.length <= 3) symbolfiles.forEach((f) => bump(f, 2, `mentions ${clean}`));
    }

    const linked = [...scores]
      .filter(([, score]) => score >= 2)
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, 3)
      .map(([file, score]) => ({ file, score, reasons: [...reasons.get(file)] }));

    const ease = linked.length ? Math.max(...linked.map((l) => easeoffile.get(l.file) ?? 0)) : null;
    return { ...issue, files: linked, ease };
  });

  return matched.sort((a, b) => (b.ease ?? -1) - (a.ease ?? -1) || b.number - a.number);
}
