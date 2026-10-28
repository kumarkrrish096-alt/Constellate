import fs from "fs/promises";
import path from "path";
import { analyzefolder } from "./analyze.js";
import { LIMITS } from "../config/limits.js";
import { cleanupfolder } from "../services/cleanup.js";
import { downloadzip } from "../services/download.js";
import { unzipsafely } from "../services/unzip.js";

// Bump this whenever the snapshot format or the analysis changes. Snapshots made
// by an older version no longer count as a cache hit, so those repos are
// analysed again on their next request.
export const ANALYSIS_VERSION = 1;

/** Analyze the source archive for one exact public repository commit. */
export async function runanalysis({ fullname, sha, branch }, report = () => {}) {
  const [owner, repo] = fullname.split("/");
  let archive;
  try {
    report("downloading source", 5);
    archive = await downloadzip(owner, repo, sha);
  } catch (error) {
    if (error.status) throw githuberror(error);
    throw error;
  }

  try {
    const sourcefolder = path.join(archive.folder, "source");
    await fs.mkdir(sourcefolder, { recursive: true });
    report("extracting source", 10);
    await unzipsafely(archive.zippath, sourcefolder);

    const snapshot = await analyzefolder(sourcefolder, {
      repo: { fullname, sha, branch },
      history: false,
      limits: { maxFiles: LIMITS.maxFiles, maxFileBytes: LIMITS.maxFileBytes },
      report,
    });

    report("writing snapshot", 98);
    return { version: ANALYSIS_VERSION, ...snapshot };
  } finally {
    await cleanupfolder(archive.folder);
  }
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
