// Worker process: claims analysis jobs from MongoDB and runs each one in its
// own child process. Start it next to the API with `npm run worker`; run as
// many worker processes as you like, the atomic claim keeps them from
// processing the same job twice.

import "dotenv/config";
import crypto from "crypto";
import os from "os";
import path from "path";
import { fork } from "child_process";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

import { connectdb } from "./db/connect.js";
import {
  claimjob,
  renewlease,
  updateprogress,
  completejob,
  failjob,
  releasejob,
} from "./services/queue.js";
import { savesnapshotrecord } from "./services/snapshotstore.js";
import {
  WORKER_CONCURRENCY,
  LEASE_RENEW_MS,
  IDLE_POLL_MS,
  MAX_ATTEMPTS,
  JOB_TIMEOUT_MS,
  JOB_MEMORY_MB,
  SHUTDOWN_GRACE_MS,
} from "./config/queue.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const RUNJOB = path.join(here, "worker", "runjob.js");

// Unique per process, so a restarted worker never mistakes an old lease for its own.
const WORKER_ID = `${os.hostname()}:${process.pid}:${crypto.randomBytes(3).toString("hex")}`;

let stopping = false;
const running = new Map(); // job id -> { child, job, shutdown }

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (...args) => console.log(new Date().toISOString(), ...args);

/**
 * Run one job in a child process with a memory cap and a time limit, renewing
 * the lease while it works. Resolves with what happened:
 *   { kind: "result", filepath, sizebytes, version }
 *   { kind: "error", message, retryable }
 *   { kind: "lost" }      another worker owns the job now; drop it silently
 *   { kind: "shutdown" }  this worker is stopping; hand the job back
 */
function runinchild(job) {
  return new Promise((resolve) => {
    const id = String(job._id);
    const child = fork(RUNJOB, [], {
      execArgv: [`--max-old-space-size=${JOB_MEMORY_MB}`],
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });
    const entry = { child, job, shutdown: false };
    running.set(id, entry);

    let outcome = null;
    const settle = (value) => {
      if (!outcome) outcome = value;
    };

    const timeout = setTimeout(() => {
      settle({
        kind: "error",
        message: `Analysis took longer than ${Number((JOB_TIMEOUT_MS / 1000).toFixed(1))} seconds`,
        retryable: true,
      });
      child.kill("SIGKILL");
    }, JOB_TIMEOUT_MS);

    const renewal = setInterval(async () => {
      try {
        if (!(await renewlease(job._id, WORKER_ID))) {
          settle({ kind: "lost" });
          child.kill("SIGKILL");
        }
      } catch (error) {
        // a missed renewal is fine; the lease is three renewals long
        log(`lease renewal failed for ${id}:`, error.message);
      }
    }, LEASE_RENEW_MS);

    child.on("message", (message) => {
      if (message?.type === "progress") {
        updateprogress(job._id, WORKER_ID, message.stage, message.progress)
          .then((stillours) => {
            if (!stillours) {
              settle({ kind: "lost" });
              child.kill("SIGKILL");
            }
          })
          .catch((error) => log(`progress update failed for ${id}:`, error.message));
      } else if (message?.type === "result") {
        settle({ kind: "result", ...message });
      } else if (message?.type === "error") {
        settle({ kind: "error", message: message.message, retryable: message.retryable });
      }
    });

    child.on("error", (error) => settle({ kind: "error", message: error.message, retryable: true }));

    child.on("exit", (code, signal) => {
      clearTimeout(timeout);
      clearInterval(renewal);
      running.delete(id);

      if (entry.shutdown) return resolve({ kind: "shutdown" });

      // Exited without reporting: crashed, most likely out of memory.
      settle({
        kind: "error",
        message: `Analysis process crashed (${signal || `exit code ${code}`}), possibly out of memory`,
        retryable: true,
      });
      resolve(outcome);
    });

    child.send({
      type: "start",
      job: { fullname: job.fullname, sha: job.sha, branch: job.branch },
    });
  });
}

async function processjob(job) {
  const label = `${job.fullname}@${job.sha.slice(0, 7)} (attempt ${job.attempts})`;

  // A job reclaimed after its worker died counts an attempt each time, so a
  // repo that keeps killing workers stops being retried.
  if (job.attempts > MAX_ATTEMPTS) {
    await failjob(job, WORKER_ID, { message: "Analysis kept crashing and was stopped", retryable: false });
    log(`gave up on ${label}`);
    return;
  }

  log(`started ${label}`);
  const outcome = await runinchild(job);

  if (outcome.kind === "lost") {
    log(`lost the lease on ${label}; another worker has it`);
    return;
  }

  if (outcome.kind === "shutdown") {
    await releasejob(job._id, WORKER_ID);
    log(`handed back ${label} for shutdown`);
    return;
  }

  if (outcome.kind === "result") {
    try {
      // file first, then record, then job: a reader that sees "done" always finds the snapshot
      await savesnapshotrecord({
        fullname: job.fullname,
        sha: job.sha,
        version: outcome.version,
        filepath: outcome.filepath,
        sizebytes: outcome.sizebytes,
      });
      await completejob(job._id, WORKER_ID);
      log(`finished ${label}`);
    } catch (error) {
      const result = await failjob(job, WORKER_ID, { message: "Could not save the snapshot", retryable: true });
      log(`saving ${label} failed (${result}):`, error.message);
    }
    return;
  }

  const result = await failjob(job, WORKER_ID, outcome);
  log(`${label} ${result}: ${outcome.message}`);
}

// One slot = one job at a time. WORKER_CONCURRENCY slots bound how many
// child processes run at once; extra jobs wait in the queue.
async function slot() {
  while (!stopping) {
    let job = null;
    try {
      job = await claimjob(WORKER_ID);
    } catch (error) {
      log("claim failed:", error.message);
    }

    if (!job) {
      await sleep(IDLE_POLL_MS);
      continue;
    }

    try {
      await processjob(job);
    } catch (error) {
      // never let one job's bookkeeping error stop the slot
      log(`unexpected error on job ${job._id}:`, error);
    }
  }
}

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  log(`${signal} received, finishing ${running.size} running job(s)...`);

  const deadline = Date.now() + SHUTDOWN_GRACE_MS;
  while (running.size && Date.now() < deadline) await sleep(250);

  // Still running after the grace period: stop them and give them back.
  for (const entry of running.values()) {
    entry.shutdown = true;
    entry.child.kill("SIGKILL");
  }
}

try {
  await connectdb();
} catch (error) {
  console.error("Worker failed to start:", error.message);
  process.exit(1);
}

log(`worker ${WORKER_ID} started with ${WORKER_CONCURRENCY} slot(s)`);
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

await Promise.all(Array.from({ length: WORKER_CONCURRENCY }, () => slot()));
await mongoose.disconnect();
log("worker stopped");
