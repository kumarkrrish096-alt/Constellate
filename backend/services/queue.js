import Job from "../models/job.js";
import {
  LEASE_MS,
  MAX_ATTEMPTS,
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
} from "../config/queue.js";

// Every write below (except claim) is filtered on { _id, workerid, status: "running" }.
// If this worker lost the job (its lease ran out and another worker took it),
// the filter matches nothing, so a slow or frozen worker can never overwrite
// the new owner's progress or result.
const owned = (jobid, workerid) => ({ _id: jobid, workerid, status: "running" });

/**
 * Atomically claim the next job, or return null when there is none.
 * Picks either a queued job whose back-off has passed, or a running job whose
 * lease expired (its worker crashed). findOneAndUpdate is a single atomic
 * operation, so two workers can never claim the same job.
 */
export async function claimjob(workerid) {
  const now = new Date();

  return Job.findOneAndUpdate(
    {
      $or: [
        { status: "queued", nextrunat: { $lte: now } },
        { status: "running", lockeduntil: { $lt: now } },
      ],
    },
    {
      $set: {
        status: "running",
        stage: "starting",
        progress: 0,
        workerid,
        lockeduntil: new Date(now.getTime() + LEASE_MS),
        startedat: now,
        updatedat: now,
      },
      $inc: { attempts: 1 },
    },
    { sort: { nextrunat: 1 }, returnDocument: "after" }
  ).lean();
}

/** Extend the lease. Returns false if this worker no longer owns the job. */
export async function renewlease(jobid, workerid) {
  const result = await Job.updateOne(owned(jobid, workerid), {
    $set: { lockeduntil: new Date(Date.now() + LEASE_MS) },
  });
  return result.matchedCount === 1;
}

export async function updateprogress(jobid, workerid, stage, progress) {
  const result = await Job.updateOne(owned(jobid, workerid), {
    $set: {
      stage,
      progress: Math.max(0, Math.min(100, Math.round(progress))),
      updatedat: new Date(),
    },
  });
  return result.matchedCount === 1;
}

export async function completejob(jobid, workerid) {
  const now = new Date();
  const result = await Job.updateOne(owned(jobid, workerid), {
    $set: {
      status: "done",
      stage: "done",
      progress: 100,
      error: null,
      workerid: null,
      lockeduntil: null,
      finishedat: now,
      updatedat: now,
    },
  });
  return result.matchedCount === 1;
}

/** Exponential back-off with ±20% jitter: about 5 s, 10 s, 20 s ... capped. */
export function backoffdelay(attempts) {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1));
  const jitter = base * 0.2 * (Math.random() * 2 - 1);
  return Math.round(base + jitter);
}

/**
 * Record a failed attempt. Retryable errors go back in the queue after a
 * back-off until MAX_ATTEMPTS is reached; anything else fails the job for good.
 * Returns "retrying" or "failed".
 */
export async function failjob(job, workerid, { message, retryable }) {
  const now = new Date();
  const willretry = retryable && job.attempts < MAX_ATTEMPTS;

  const update = willretry
    ? {
        status: "queued",
        stage: "retrying",
        progress: 0,
        nextrunat: new Date(now.getTime() + backoffdelay(job.attempts)),
      }
    : {
        status: "failed",
        stage: "failed",
        finishedat: now,
      };

  await Job.updateOne(owned(job._id, workerid), {
    $set: { ...update, error: message, workerid: null, lockeduntil: null, updatedat: now },
  });

  return willretry ? "retrying" : "failed";
}

/**
 * Give a job back without counting the attempt, e.g. when the worker is shut
 * down cleanly. It goes back to the front of the queue.
 */
export async function releasejob(jobid, workerid) {
  const now = new Date();
  await Job.updateOne(owned(jobid, workerid), {
    $set: {
      status: "queued",
      stage: "queued",
      progress: 0,
      workerid: null,
      lockeduntil: null,
      nextrunat: now,
      updatedat: now,
    },
    $inc: { attempts: -1 },
  });
}
