import { Router } from "express";
import { z } from "zod";

import { findsnapshot, saverepository, createorgetajob } from "../services/jobs.js";
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

        const snapshot = await findsnapshot(info.fullname, info.sha);

        if (snapshot) {
        return res.json({ status: "ready", fullname: info.fullname, sha: info.sha });
        }

        const { job, created } = await createorgetjob(info.fullname, info.sha, info.branch);

        res.status(202).json(
            {
                status: job.status,
                jobId: job._id,
                fullname: info.fullname,
                sha: info.sha,
                newjob: created,
            });
   } 
  catch (error) {
    if (error.status === 404) 
    {
       return res.status(404).json({ error: "Repository not found, or it is private" });
    }
    console.error("GitHub error:", error.message);
    res.status(500).json({ error: "Could not reach GitHub, try again" });
  }

});

export default router;