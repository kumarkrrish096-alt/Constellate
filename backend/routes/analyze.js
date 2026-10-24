import { Router } from "express";
import { z } from "zod";

import { findsnapshot, saverepository, createorgetjob, jobview, snapshoturl } from "../services/jobs.js";
import { getlatestcommit } from "../services/github.js";

const router = Router();
const githuburlpattern = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(\.git)?\/?$/;


const analyzeschema = z.object({
  repoUrl: z
    .string()
    .trim()
    .regex(githuburlpattern, "please enter a valid github url"),
});



router.post("/", async (req, res) => {
  const result = analyzeschema.safeParse(req.body);

  if (!result.success)
  {
    return res.status(400).json({ error: "please enter a valid github url" });
  }

        const match = result.data.repoUrl.match(githuburlpattern);
        const owner = match[1];
        const repo = match[2];


  try
   {
        const info = await getlatestcommit(owner, repo);

        await saverepository(info.fullname, owner, repo);

        // cache hit: this exact commit was already analysed
        const snapshot = await findsnapshot(info.fullname, info.sha);

        if (snapshot) {
        return res.json({
            status: "ready",
            fullname: info.fullname,
            sha: info.sha,
            snapshotUrl: snapshoturl(info.fullname, info.sha),
        });
        }

        // cache miss: queue a job (or join the one already queued for this commit)
        const { job, created } = await createorgetjob(info.fullname, info.sha, info.branch);

        res.status(202).json(
            {
                ...(await jobview(job)),
                eventsUrl: `/api/jobs/${job._id}/events`,
                newjob: created,
            });
   }
  catch (error) {
    if (error.status === 404)
    {
       return res.status(404).json({ error: "Repository not found, or it is private" });
    }
    if (error.status === 403 || error.status === 429)
    {
       // GitHub API rate limit (5,000 requests/hour with a token)
       return res.status(503).json({ error: "GitHub rate limit reached, please try again in a few minutes" });
    }
    console.error("Analyze error:", error.message);
    res.status(500).json({ error: "Could not start the analysis, try again" });
  }

});

export default router;
