// Run the analysis engine on a local folder, without the API or the queue.
//
//   npm run analyze -- <folder> [--repo owner/name] [--sha <commit>] [--issues]
//                              [--no-history] [--out snapshot.json]
//
// Prints a summary with timings (useful for the benchmark report) and, with
// --out, writes the full snapshot JSON.

import "dotenv/config";
import fs from "fs/promises";
import { analyzefolder } from "./analyze.js";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const folder = args.find((a, i) => !a.startsWith("--") && !["--repo", "--sha", "--out"].includes(args[i - 1]));
if (!folder) {
  console.error("usage: npm run analyze -- <folder> [--repo owner/name] [--sha <commit>] [--issues] [--no-history] [--out file.json]");
  process.exit(1);
}

const fullname = value("--repo")?.toLowerCase();
let lastline = "";
const snapshot = await analyzefolder(folder, {
  repo: fullname ? { fullname, sha: value("--sha") || null } : null,
  history: !flag("--no-history"),
  issues: flag("--issues") ? true : undefined,
  report: (stage, progress) => {
    const line = `  ${String(progress).padStart(3)}%  ${stage}`;
    if (line !== lastline) console.error((lastline = line));
  },
});

const { stats, timings } = snapshot;
const name = (id) => snapshot.files[id]?.path;
const out = [];
out.push(`\n${folder}`);
out.push(`  files ${stats.files} (source ${stats.sourcefiles}, parsed ${stats.parsedfiles}), lines ${stats.lines}, tokens ${stats.tokens}`);
out.push(`  languages ${JSON.stringify(stats.languages)}`);
out.push(`  import edges ${stats.edges}, unresolved imports ${stats.unresolvedimports}, cycles ${stats.cycles}, clusters ${stats.clusters}`);
out.push(`  functions ${stats.functions}, calls resolved ${stats.callsresolved}/${stats.calls}`);
out.push(`  history ${snapshot.history.available ? `${snapshot.history.commits} commits in ${snapshot.history.months} months` : "not available"}, co-change pairs ${snapshot.cochange.length}`);
out.push(`  skipped ${snapshot.skipped.count} ${JSON.stringify(snapshot.skipped.byreason)}`);
out.push(`  timings ms ${JSON.stringify(timings)}`);
// maxRSS is in KB and includes the parser threads (they share the process)
out.push(`  peak memory ${Math.round(process.resourceUsage().maxRSS / 1024)} MB`);
out.push(`  top clusters: ${snapshot.clusters.slice(0, 5).map((c) => `${c.label} (${c.size})`).join(", ")}`);
for (const cycle of snapshot.cycles.slice(0, 3)) out.push(`  cycle: ${cycle.path.map(name).join(" -> ")}`);
out.push(`  hotspots: ${snapshot.hotspots.slice(0, 5).map((id) => `${name(id)} [${snapshot.files[id].health.score}]`).join(", ")}`);
out.push(`  god files: ${snapshot.godfiles.map(name).join(", ") || "none"}`);
for (const p of snapshot.pathfinder.slice(0, 3)) out.push(`  first contribution: ${name(p.file)} [${p.score}] ${p.reasons.join("; ")}`);
if (snapshot.issues.available) {
  out.push(`  good first issues: ${snapshot.issues.items.length}${snapshot.issues.error ? ` (error: ${snapshot.issues.error})` : ""}`);
  for (const issue of snapshot.issues.items.slice(0, 3)) {
    out.push(`    #${issue.number} ${issue.title.slice(0, 70)} -> ${issue.files.map((f) => name(f.file)).join(", ") || "no file match"}`);
  }
}
console.log(out.join("\n"));

const outfile = value("--out");
if (outfile) {
  const json = JSON.stringify(snapshot);
  await fs.writeFile(outfile, json);
  console.log(`  wrote ${outfile} (${(json.length / 1024).toFixed(0)} KB)`);
}
