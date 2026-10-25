import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { Worker } from "worker_threads";

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), "worker.js");
const BATCH_SIZE = 25;

/**
 * Parse files in a pool of worker threads, so CPU-heavy parsing uses every
 * spare core and never blocks the main thread. Results come back in the same
 * order as `files`.
 *
 * Thread count: PARSE_THREADS from .env, else (CPU cores - 1), capped at 4,
 * and never more threads than there are batches.
 */
export function parsefiles(files, { onprogress } = {}) {
  if (files.length === 0) return Promise.resolve([]);

  const batches = [];
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    batches.push({
      start: i,
      files: files.slice(i, i + BATCH_SIZE).map(({ path, abs, grammar }) => ({ path, abs, grammar })),
    });
  }

  const configured = Number(process.env.PARSE_THREADS);
  const cores = typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
  const threadcount = Math.min(
    batches.length,
    configured > 0 ? configured : Math.max(1, Math.min(cores - 1, 4))
  );

  return new Promise((resolve, reject) => {
    const results = new Array(files.length);
    const workers = [];
    let next = 0;
    let done = 0;
    let finished = false;

    const finish = (error) => {
      if (finished) return;
      finished = true;
      for (const worker of workers) worker.terminate();
      error ? reject(error) : resolve(results);
    };

    const sendnext = (worker) => {
      if (next < batches.length) {
        const batchid = next++;
        worker.postMessage({ batchid, files: batches[batchid].files });
      }
    };

    for (let i = 0; i < threadcount; i++) {
      // Each thread gets its own heap cap so one huge file cannot take the process down.
      // execArgv: [] so threads do not inherit the parent's command-line flags.
      const worker = new Worker(WORKER, { execArgv: [], resourceLimits: { maxOldGenerationSizeMb: 256 } });
      workers.push(worker);

      worker.on("message", ({ batchid, results: batchresults }) => {
        const { start } = batches[batchid];
        batchresults.forEach((result, offset) => (results[start + offset] = result));
        done++;
        onprogress?.(done / batches.length);
        if (done === batches.length) finish();
        else sendnext(worker);
      });
      worker.on("error", (error) => finish(new Error(`Parser thread failed: ${error.message}`)));
      worker.on("exit", (code) => {
        if (!finished && code !== 0) finish(new Error(`Parser thread exited with code ${code}`));
      });

      sendnext(worker);
    }
  });
}
