import { simpleGit } from "simple-git";

const DEFAULTS = {
  months: 12,
  maxcommits: 5000,
  // Commits touching more files than this are bulk changes (formatting,
  // renames, dependency bumps) and would make every file look coupled.
  maxfilespercommit: 40,
  // Co-change pairs kept per file and overall, so the snapshot stays small.
  partnersperfile: 5,
  maxpairs: 2000,
  minpaircount: 2,
};

/**
 * Churn and co-change from a bounded window of git history.
 * Returns null when `root` is not a git repository (e.g. a zip upload).
 *
 * churn:    Map path -> { commits, lines (added + deleted), lastchanged (unix seconds) }
 * cochange: [{ a, b, count, strength }] where strength = count / min(commits of a, commits of b)
 */
export async function readhistory(root, knownpaths, options = {}) {
  const { months, maxcommits, maxfilespercommit, partnersperfile, maxpairs, minpaircount } = { ...DEFAULTS, ...options };

  // Never let repository config run anything (fsmonitor hooks), and never prompt.
  // simple-git only accepts a core.fsmonitor override with this opt-in; we use
  // it to switch the hook OFF, which is the safe direction.
  const git = simpleGit({
    baseDir: root,
    config: ["core.fsmonitor=false", "core.quotepath=off"],
    unsafe: { allowUnsafeFsMonitor: true },
  }).env(gitenv());

  try {
    if (!(await git.checkIsRepo())) return null;
  } catch {
    return null;
  }

  let raw;
  try {
    raw = await git.raw([
      "log",
      `--since=${months}.months.ago`,
      `--max-count=${maxcommits}`,
      "--no-merges",
      // paths relative to `root`, so analysing a subfolder of a repository still matches
      "--relative",
      "--numstat",
      "--format=%x1e%H%x1f%at",
    ]);
  } catch {
    // e.g. a repository with no commits yet
    return { window: { months, commits: 0 }, churn: new Map(), cochange: [] };
  }

  const churn = new Map();
  const commitfiles = [];
  let commits = 0;

  for (const block of raw.split("\x1e")) {
    if (!block.trim()) continue;
    const [header, ...lines] = block.split("\n");
    const timestamp = Number(header.split("\x1f")[1]) || 0;
    commits++;

    const touched = new Set();
    for (const line of lines) {
      const parts = line.split("\t");
      if (parts.length < 3) continue;
      const file = renamedpath(parts.slice(2).join("\t"));
      if (!knownpaths.has(file)) continue; // deleted since, or not analysed
      const added = parts[0] === "-" ? 0 : Number(parts[0]) || 0; // "-" = binary
      const deleted = parts[1] === "-" ? 0 : Number(parts[1]) || 0;

      const entry = churn.get(file) || { commits: 0, lines: 0, lastchanged: 0 };
      entry.commits++;
      entry.lines += added + deleted;
      entry.lastchanged = Math.max(entry.lastchanged, timestamp);
      churn.set(file, entry);
      touched.add(file);
    }
    if (touched.size > 1 && touched.size <= maxfilespercommit) commitfiles.push([...touched].sort());
  }

  return {
    window: { months, commits },
    churn,
    cochange: cochangepairs(commitfiles, churn, { partnersperfile, maxpairs, minpaircount }),
  };
}

/**
 * Only what git needs to run. Passing the whole environment would forward
 * things like GIT_EDITOR or GIT_SSH_COMMAND, which can run programs (simple-git
 * also refuses them). git log is local, so it never needs to prompt.
 */
function gitenv() {
  const env = {};
  for (const key of ["PATH", "Path", "HOME", "USERPROFILE", "SYSTEMROOT", "SystemRoot", "TEMP", "TMP", "LANG"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return env;
}

/** "old => new", "dir/{old => new}/file" -> the path the file has now. */
function renamedpath(field) {
  if (!field.includes(" => ")) return field;
  const braces = field.match(/^(.*)\{(.*) => (.*)\}(.*)$/);
  if (braces) return (braces[1] + braces[3] + braces[4]).replace(/\/\//g, "/");
  return field.split(" => ")[1];
}

function cochangepairs(commitfiles, churn, { partnersperfile, maxpairs, minpaircount }) {
  const counts = new Map();
  for (const files of commitfiles) {
    for (let i = 0; i < files.length; i++) {
      for (let j = i + 1; j < files.length; j++) {
        const key = `${files[i]}\0${files[j]}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
  }

  const pairs = [];
  for (const [key, count] of counts) {
    if (count < minpaircount) continue;
    const [a, b] = key.split("\0");
    const strength = count / Math.min(churn.get(a).commits, churn.get(b).commits);
    pairs.push({ a, b, count, strength: Math.round(strength * 100) / 100 });
  }
  pairs.sort((x, y) => y.count - x.count || y.strength - x.strength || (x.a + x.b < y.a + y.b ? -1 : 1));

  // keep each file's strongest partners only
  const perfile = new Map();
  const kept = [];
  for (const pair of pairs) {
    const na = perfile.get(pair.a) || 0;
    const nb = perfile.get(pair.b) || 0;
    if (na >= partnersperfile && nb >= partnersperfile) continue;
    perfile.set(pair.a, na + 1);
    perfile.set(pair.b, nb + 1);
    kept.push(pair);
    if (kept.length >= maxpairs) break;
  }
  return kept;
}
