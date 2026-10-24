import { Router } from "express";
import mongoose from "mongoose";
import Job from "../models/job.js";
import { jobview } from "../services/jobs.js";

const router = Router();

// The worker runs in another process and writes progress to MongoDB, so the
// stream reads it from there. One small indexed read per open stream per second.
const POLL_MS = 1000;
const HEARTBEAT_MS = 15 * 1000;
// Close long streams; the browser's EventSource reconnects on its own.
const MAX_STREAM_MS = 10 * 60 * 1000;

const isfinished = (status) => status === "done" || status === "failed";

async function loadjob(req, res) {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ error: "Invalid job id" });
    return null;
  }

  const job = await Job.findById(id).lean();
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return null;
  }
  return job;
}

router.get("/:id", async (req, res) => {
  try {
    const job = await loadjob(req, res);
    if (!job) return;

    res.json(await jobview(job));
  } catch (error) {
    console.error("Job lookup error:", error.message);
    res.status(500).json({ error: "Could not read the job, try again" });
  }
});

// Live progress with Server-Sent Events. Sends a "progress" event whenever the
// job changes and a final "done" or "failed" event, then closes.
router.get("/:id/events", async (req, res) => {
  let job;
  try {
    job = await loadjob(req, res);
    if (!job) return;
  } catch (error) {
    console.error("Job stream error:", error.message);
    return res.status(500).json({ error: "Could not read the job, try again" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // stop nginx-style proxies from buffering the stream
    "X-Accel-Buffering": "no",
  });
  // tell EventSource to wait 3 s before reconnecting
  res.write("retry: 3000\n\n");

  let closed = false;
  let lastsent = null;
  let lastwrite = Date.now();
  const startedat = Date.now();
  let timer = null;

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    lastwrite = Date.now();
  };

  const finish = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    res.end();
  };

  req.on("close", () => {
    closed = true;
    clearTimeout(timer);
  });

  const tick = async () => {
    if (closed) return;
    try {
      const view = await jobview(job);
      const key = JSON.stringify([view.status, view.stage, view.progress, view.queueposition, view.updatedat]);

      if (key !== lastsent) {
        lastsent = key;
        send(isfinished(view.status) ? view.status : "progress", view);
      } else if (Date.now() - lastwrite >= HEARTBEAT_MS) {
        // comment line keeps idle connections from being cut by proxies
        res.write(": heartbeat\n\n");
        lastwrite = Date.now();
      }

      if (isfinished(view.status) || Date.now() - startedat >= MAX_STREAM_MS) {
        return finish();
      }

      timer = setTimeout(async () => {
        try {
          const fresh = await Job.findById(job._id).lean();
          if (!fresh) {
            send("failed", { error: "Job no longer exists" });
            return finish();
          }
          job = fresh;
          tick();
        } catch (error) {
          console.error("Job stream poll error:", error.message);
          finish();
        }
      }, POLL_MS);
    } catch (error) {
      console.error("Job stream error:", error.message);
      finish();
    }
  };

  tick();
});

export default router;
