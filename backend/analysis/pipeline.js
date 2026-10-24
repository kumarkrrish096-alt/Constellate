import path from "path";
import { Octokit } from "@octokit/rest";

// Bump this whenever the snapshot format or the analysis changes. Snapshots made
// by an older version no longer count as a cache hit, so those repos are
// analysed again on their next request.
export const ANALYSIS_VERSION = 1;

/**
 * Turns one (repo, commit) into the data stored in its snapshot.
 *
 * PLACEHOLDER for Sections C and D: this only lists the commit's files and
 * languages through the GitHub API. Ingestion (clone or zip), Tree-sitter
 * parsing, graphs and metrics replace the body of this function; the worker
 * around it stays the same.
 *
 * `report(stage, progress)` updates the job's progress bar (0 to 100).
 * Throw an error with `retryable: false` for failures that will not go away
 * on a retry (the repo is gone, too large...); anything else is retried.
 */
export async function runanalysis({ fullname, sha, branch }, report) {
  const [owner, repo] = fullname.split("/");
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

  report("listing files", 10);

  let tree;
  try {
    const result = await octokit.rest.git.getTree({ owner, repo, tree_sha: sha, recursive: "true" });
    tree = result.data;
  } catch (error) {
    throw githuberror(error);
  }

  report("detecting languages", 60);

  const files = tree.tree
    .filter((entry) => entry.type === "blob")
    .map((entry) => ({
      path: entry.path,
      size: entry.size ?? 0,
      language: detectlanguage(entry.path),
    }));

  const languages = {};
  for (const file of files) {
    if (file.language) languages[file.language] = (languages[file.language] || 0) + 1;
  }

  report("writing snapshot", 90);

  return {
    version: ANALYSIS_VERSION,
    fullname,
    sha,
    branch,
    generatedat: new Date().toISOString(),
    placeholder: true,
    // GitHub stops listing very large trees; the real ingestion reads the clone instead
    truncated: Boolean(tree.truncated),
    stats: {
      files: files.length,
      bytes: files.reduce((sum, file) => sum + file.size, 0),
      languages,
    },
    files,
  };
}

const EXTENSIONS = {
  ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
  ".ts": "typescript", ".tsx": "typescript",
  ".py": "python", ".java": "java", ".go": "go", ".rs": "rust", ".rb": "ruby",
  ".c": "c", ".h": "c", ".cpp": "cpp", ".cc": "cpp", ".hpp": "cpp",
  ".cs": "csharp", ".php": "php", ".kt": "kotlin", ".swift": "swift",
};

function detectlanguage(filepath) {
  return EXTENSIONS[path.extname(filepath).toLowerCase()] || null;
}

function githuberror(error) {
  // 404/409/422: the repo or commit is gone (or the repo is empty), retrying will not help.
  // 403/429 (rate limit), 5xx and network errors are temporary.
  const permanent = [404, 409, 422].includes(error.status);
  const wrapped = new Error(
    permanent
      ? "Repository or commit no longer exists on GitHub"
      : `Could not reach GitHub (${error.status || error.code || "network error"}), will retry`
  );
  wrapped.retryable = !permanent;
  return wrapped;
}
