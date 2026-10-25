// Job queue and worker settings. Every value can be overridden in .env.

const num = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

// How many jobs one worker process runs at the same time.
export const WORKER_CONCURRENCY = num("WORKER_CONCURRENCY", 2);

// Lock lease: a claimed job belongs to its worker until lockeduntil.
// The worker renews it every LEASE_RENEW_MS; if the worker dies, the lease
// runs out after at most LEASE_MS and another worker picks the job up.
export const LEASE_MS = num("LEASE_MS", 30 * 1000);
export const LEASE_RENEW_MS = num("LEASE_RENEW_MS", 10 * 1000);

// How long an idle worker slot waits before looking for work again.
export const IDLE_POLL_MS = num("IDLE_POLL_MS", 2 * 1000);

// Attempts before a job is marked failed, and the retry back-off:
// BACKOFF_BASE_MS, then doubling each attempt, capped at BACKOFF_MAX_MS, with ±20% jitter.
export const MAX_ATTEMPTS = num("MAX_ATTEMPTS", 3);
export const BACKOFF_BASE_MS = num("BACKOFF_BASE_MS", 5 * 1000);
export const BACKOFF_MAX_MS = num("BACKOFF_MAX_MS", 5 * 60 * 1000);

// Hard limits for one job's child process (abstract: 90 s of processing time).
export const JOB_TIMEOUT_MS = num("JOB_TIMEOUT_MS", 90 * 1000);
export const JOB_MEMORY_MB = num("JOB_MEMORY_MB", 512);

// On shutdown, how long to let running jobs finish before handing them back.
export const SHUTDOWN_GRACE_MS = num("SHUTDOWN_GRACE_MS", 20 * 1000);
