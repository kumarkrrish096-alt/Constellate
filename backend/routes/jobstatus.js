import { Router } from "express";
import mongoose from "mongoose";
import Job from "../models/job.js";

const router = Router();

router.get("/:id", async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ error: "Invalid job id" });
  }

  try {
    const job = await Job.findById(id).lean();

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    res.json({
      jobId: job._id,
      status: job.status,
      fullname: job.fullname,
      sha: job.sha,
      attempts: job.attempts,
      createdat: job.createdat,
    });
  } catch (error) {
    console.error("Job lookup error:", error.message);
    res.status(500).json({ error: "Could not read the job, try again" });
  }
});

export default router;