import { Octokit } from "@octokit/rest";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

export async function getlatestcommit(owner, repo) {
  const repoinfo = await octokit.rest.repos.get({ owner, repo });
  const branch = repoinfo.data.default_branch;

  const commit = await octokit.rest.repos.getCommit({
    owner,
    repo,
    ref: branch,
  });

  return {
    fullname: repoinfo.data.full_name.toLowerCase(),
    branch,
    sha: commit.data.sha,
  };
}