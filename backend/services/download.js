import fs from "fs/promises";
import os from "os";
import path from "path";
import { Octokit } from "@octokit/rest";
import { LIMITS } from "../config/limits.js";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

export async function downloadzip(owner, repo, sha) {
  const response = await octokit.rest.repos.downloadZipballArchive({
    owner,
    repo,
    ref: sha,
  });

  const buffer = Buffer.from(response.data);

  if (buffer.byteLength > LIMITS.maxArchiveBytes) {
    throw new Error("Repository is too large");
  }

  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "constellate-"));
  const zippath = path.join(folder, "repo.zip");
  await fs.writeFile(zippath, buffer);

  return { folder, zippath };
}