import { Octokit } from "@octokit/rest";

// Projects name beginner labels differently: "good first issue", "Difficulty: starter",
// "beginner friendly", "first-timers-only", "help wanted"...
const BEGINNER_LABEL = /good.?first|first.?timer|beginner|starter|newcomer|\beasy\b|help.?wanted/i;
// ...and mark ones somebody already works on
const TAKEN_LABEL = /taken|claimed|assigned|in.?progress/i;
const MAX_LABELS = 5;

/**
 * Open beginner-friendly issues of a GitHub repository (pull requests excluded).
 * One request for the repo's labels, then one per beginner label (at most 5),
 * a few of the 5,000/hour budget. Never throws: on a GitHub error it returns
 * what it has and the error message.
 */
export async function fetchgoodfirstissues(fullname, { perlabel = 30 } = {}) {
  const [owner, repo] = fullname.split("/");
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const byid = new Map();
  let labels = [];
  let error = null;

  try {
    const all = await octokit.paginate(octokit.rest.issues.listLabelsForRepo, { owner, repo, per_page: 100 });
    labels = all
      .map((l) => l.name)
      .filter((name) => BEGINNER_LABEL.test(name) && !TAKEN_LABEL.test(name))
      // "good first issue" style labels before "help wanted"
      .sort((a, b) => Number(/help.?wanted/i.test(a)) - Number(/help.?wanted/i.test(b)) || (a < b ? -1 : 1))
      .slice(0, MAX_LABELS);
  } catch (e) {
    return { issues: [], labels: [], error: e.message };
  }

  for (const label of labels) {
    try {
      const { data } = await octokit.rest.issues.listForRepo({
        owner,
        repo,
        state: "open",
        labels: label,
        per_page: perlabel,
        sort: "updated",
      });
      for (const issue of data) {
        if (issue.pull_request || byid.has(issue.number)) continue;
        // an issue labelled both "good first issue" and "taken" is not available
        const names = issue.labels.map((l) => (typeof l === "string" ? l : l.name)).filter(Boolean);
        if (names.some((n) => TAKEN_LABEL.test(n))) continue;
        byid.set(issue.number, {
          number: issue.number,
          title: issue.title,
          body: (issue.body || "").slice(0, 20000),
          url: issue.html_url,
          labels: names,
          comments: issue.comments,
          updatedat: issue.updated_at,
        });
      }
    } catch (e) {
      error = e.message;
    }
  }

  return { issues: [...byid.values()].sort((a, b) => b.number - a.number), labels, error };
}
