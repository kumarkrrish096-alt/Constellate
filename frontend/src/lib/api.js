// api.js — API integration for Constellate analysis, job tracking, and snapshots
import { authFetch } from '../auth/AuthService';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/**
 * Submit a public GitHub repository URL for architectural analysis.
 * Uses authFetch because POST /api/analyze requires authentication and counts toward user rate limits.
 */
export async function submitAnalysis(repoUrl) {
  const res = await authFetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoUrl: repoUrl.trim() }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = data.error || (res.status === 401 ? 'Please log in to cast an atlas.' : 'Analysis request failed.');
    const error = new Error(message);
    error.status = res.status;
    error.data = data;
    throw error;
  }

  // 200: Cache hit (status: "ready", snapshotUrl ready)
  // 202: Cache miss (status: "queued" | "running", jobId, eventsUrl)
  return data;
}

/**
 * Fetch current job status via GET /api/jobs/:id (public route).
 */
export async function getJobStatus(jobId) {
  const res = await fetch(`${API}/api/jobs/${jobId}`);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(data.error || 'Job not found.');
    error.status = res.status;
    throw error;
  }

  return data;
}

/**
 * Track job progress via Server-Sent Events with automated polling fallback.
 *
 * @param {string} jobId - The MongoDB ObjectId of the job.
 * @param {Object} callbacks
 * @param {Function} callbacks.onProgress - Called on status/stage change: (jobView) => void
 * @param {Function} callbacks.onDone - Called when analysis completes: (jobView) => void
 * @param {Function} callbacks.onFailed - Called when job fails: (jobView) => void
 * @param {Function} callbacks.onError - Called on connection/network error: (error) => void
 * @returns {Function} cleanup - Function to stop listening and close connections.
 */
export function streamJobEvents(jobId, { onProgress, onDone, onFailed, onError }) {
  let closed = false;
  let eventSource = null;
  let pollTimer = null;
  let pollAttempts = 0;
  const MAX_POLL_ATTEMPTS = 300; // 5-10 minutes max

  const cleanup = () => {
    closed = true;
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  };

  const handleTerminal = (view) => {
    cleanup();
    if (view.status === 'done') {
      onDone?.(view);
    } else {
      onFailed?.(view);
    }
  };

  // Polling fallback when SSE is unsupported or fails to connect
  const startPolling = () => {
    if (closed || pollTimer) return;

    const poll = async () => {
      if (closed) return;
      pollAttempts++;

      try {
        const view = await getJobStatus(jobId);
        if (closed) return;

        if (view.status === 'done' || view.status === 'failed') {
          handleTerminal(view);
          return;
        }

        onProgress?.(view);

        if (pollAttempts < MAX_POLL_ATTEMPTS) {
          pollTimer = setTimeout(poll, 1200);
        } else {
          cleanup();
          onError?.(new Error('Job tracking timed out.'));
        }
      } catch (err) {
        if (!closed) {
          onError?.(err);
          // Retry polling even after transient error
          pollTimer = setTimeout(poll, 2500);
        }
      }
    };

    poll();
  };

  // Try Server-Sent Events first
  if (typeof window !== 'undefined' && typeof window.EventSource !== 'undefined') {
    try {
      eventSource = new EventSource(`${API}/api/jobs/${jobId}/events`);

      eventSource.addEventListener('progress', (e) => {
        if (closed) return;
        try {
          const data = JSON.parse(e.data);
          onProgress?.(data);
        } catch (err) {
          console.warn('Malformed progress event data', err);
        }
      });

      eventSource.addEventListener('done', (e) => {
        if (closed) return;
        try {
          const data = JSON.parse(e.data);
          handleTerminal(data);
        } catch {
          handleTerminal({ status: 'done', jobId });
        }
      });

      eventSource.addEventListener('failed', (e) => {
        if (closed) return;
        try {
          const data = JSON.parse(e.data);
          handleTerminal(data);
        } catch {
          handleTerminal({ status: 'failed', error: 'Analysis job failed.', jobId });
        }
      });

      eventSource.onerror = () => {
        if (closed) return;
        // If SSE closes or fails (e.g. proxy buffering or network interruption), seamlessly switch to polling
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        startPolling();
      };
    } catch {
      startPolling();
    }
  } else {
    startPolling();
  }

  return cleanup;
}

/**
 * Fetch and parse a completed snapshot from its URL.
 * Automatically handles decompression (backend serves with Content-Encoding: gzip).
 */
export async function fetchSnapshot(snapshotUrl) {
  const url = snapshotUrl.startsWith('http') ? snapshotUrl : `${API}${snapshotUrl}`;
  const res = await fetch(url);

  if (!res.ok) {
    const error = new Error(`Failed to load snapshot (HTTP ${res.status})`);
    error.status = res.status;
    throw error;
  }

  return await res.json();
}
