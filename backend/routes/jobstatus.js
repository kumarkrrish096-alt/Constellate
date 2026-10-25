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




const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));


router.get("/:id/events", async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ error: "Invalid job id" });
  }

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  let closed = false;
  req.on("close", () => {
    closed = true;
  });

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  let last = null;

  try {
    while (!closed) {
      const job = await Job.findById(id).lean();

      if (!job) {
        send("error", { error: "Job not found" });
        break;
      }

      if (job.status !== last) {
        send("status", { status: job.status });
        last = job.status;
      }

      if (job.status === "done" || job.status === "failed") {
        break;
      }

      await sleep(1000);
    }
  } catch (error) {
    console.error("Events error:", error.message);
    send("error", { error: "Could not read the job" });
  }

  res.end();
});



export default router;