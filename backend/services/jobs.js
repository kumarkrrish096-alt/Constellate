import fs from "fs/promises";
import path from "path";
import Job from "../models/job.js";

import Repository from "../models/repository.js"

import Snapshot from "../models/snapshot.js";
import { SNAPSHOT_DIR } from "../config/paths.js";

import { ANALYSIS_VERSION } from "../analysis/pipeline.js";

// a failed job may be retried by a new request only after this long,
// so a repo that always fails cannot keep the workers busy
const RETRY_FAILED_AFTER_MS = 10 * 60 * 1000;

// only snapshots made by the current analysis count; older ones get re-analysed
export async function findsnapshot(fullname, sha) {
        const snapshot = await Snapshot.findOne({ fullname, sha, version: ANALYSIS_VERSION }).lean();
        if (!snapshot?.filepath) return null;

        const root = path.resolve(SNAPSHOT_DIR);
        const filepath = path.resolve(snapshot.filepath);
        const relative = path.relative(root, filepath);
        if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) return null;

        try {
            await fs.access(filepath);
            return snapshot;
        } catch {
            return null;
        }
};

export async function saverepository(fullname, owner, repo) {
    const now = new Date();

    await Repository.updateOne(
        {
            fullname
        },
        {
            $setOnInsert:
            {
                owner,
                repo,
                createdat: now
            },
            $set:
            {
                lastsubmittedat: now
            }
        },
        {
            upsert: true
        }

    );
}

/**
 * One job per (repo, sha). The unique index makes concurrent requests for the
 * same commit share a job: the first upsert inserts it, the rest find it.
 */
export async function createorgetjob(fullname, sha, branch) {
    const filter = { fullname, sha };
    const now = new Date();
    let created = false;

    try {
        const result = await Job.updateOne(
            filter,
            {
                $setOnInsert:
                {
                    branch,
                    status: "queued",
                    stage: "queued",
                    progress: 0,
                    attempts: 0,
                    createdat: now,
                    nextrunat: now,
                    updatedat: now,
                },
            },
            {
                upsert: true
            }
        );
        created = result.upsertedCount === 1;
    }
    catch (error) {
        // two requests upserted at the same moment; the other one created the job
        if (error.code !== 11000) throw error;
    }

    let job = await Job.findOne(filter).lean();

    if (job && await needsrequeue(job, now)) {
        // conditional on the status we saw, so two requests cannot both requeue it
        const requeued = await Job.findOneAndUpdate(
            { _id: job._id, status: job.status },
            {
                $set:
                {
                    status: "queued",
                    stage: "queued",
                    progress: 0,
                    error: null,
                    attempts: 0,
                    workerid: null,
                    lockeduntil: null,
                    startedat: null,
                    finishedat: null,
                    nextrunat: now,
                    updatedat: now,
                }
            },
            { returnDocument: "after" }
        ).lean();

        if (requeued) job = requeued;
    }

    return { job, created };
}

async function needsrequeue(job, now) {
    if (job.status === "failed") {
        const failedat = job.finishedat || job.updatedat || job.createdat;
        return now - new Date(failedat) >= RETRY_FAILED_AFTER_MS;
    }

    // "done" but its snapshot is gone (deleted or lost), so analyse again
    if (job.status === "done") {
        return !(await findsnapshot(job.fullname, job.sha));
    }

    return false;
}

/** 1 = next to be picked up. null when the job is not waiting in the queue. */
export async function queueposition(job) {
    if (job.status !== "queued") return null;

    const ahead = await Job.countDocuments({
        status: "queued",
        nextrunat: { $lt: job.nextrunat },
    });

    return ahead + 1;
}

export function snapshoturl(fullname, sha) {
    return `/api/snapshots/${fullname}/${sha}`;
}

/** The job fields the frontend sees (no lock or worker internals). */
export async function jobview(job) {
    return {
        jobId: job._id,
        status: job.status,
        stage: job.stage,
        progress: job.progress,
        error: job.status === "failed" ? job.error : null,
        fullname: job.fullname,
        sha: job.sha,
        attempts: job.attempts,
        queueposition: await queueposition(job),
        // after a failed attempt: when the next try may start, and why the last one failed
        retryat: job.status === "queued" && job.attempts > 0 ? job.nextrunat : null,
        lasterror: job.status === "queued" && job.attempts > 0 ? job.error : null,
        snapshotUrl: job.status === "done" ? snapshoturl(job.fullname, job.sha) : null,
        createdat: job.createdat,
        updatedat: job.updatedat,
    };
}
