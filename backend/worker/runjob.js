// Runs ONE job in its own child process, started by worker.js with a memory
// limit. If a repository makes the analysis run out of memory or hang, only
// this process dies; the worker and its other jobs carry on.
//
// It has no database connection. It talks to the parent through IPC messages:
//   parent -> child  { type: "start", job }
//   child -> parent  { type: "progress", stage, progress }
//                    { type: "result", filepath, sizebytes, version }
//                    { type: "error", message, retryable }

import "dotenv/config";
import { runanalysis } from "../analysis/pipeline.js";
import { writesnapshotfile } from "../services/snapshotstore.js";

const send = (message) =>
  new Promise((resolve) => {
    if (!process.connected) return resolve();
    process.send(message, () => resolve());
  });

process.once("message", async (message) => {
  if (message?.type !== "start") return;
  const { fullname, sha, branch } = message.job;

  try {
    const report = (stage, progress) => send({ type: "progress", stage, progress });

    const data = await runanalysis({ fullname, sha, branch }, report);
    const { filepath, sizebytes, data: compressedData } = await writesnapshotfile(fullname, sha, data.version, data);
    const healthScores = data.files.map((file) => file.health?.score).filter(Number.isFinite);
    const language = Object.entries(data.stats?.languages || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || "Source";
    const metrics = {
      language,
      files: data.stats?.sourcefiles ?? data.files.length,
      health: healthScores.length
        ? Math.round(healthScores.reduce((total, score) => total + score, 0) / healthScores.length)
        : null,
      cycles: data.stats?.cycles ?? data.cycles.length,
      godfiles: data.godfiles.length,
    };

    await send({ type: "result", filepath, sizebytes, version: data.version, data: compressedData, metrics });
    process.exit(0);
  } catch (error) {
    await send({
      type: "error",
      message: error.message || "Analysis failed",
      retryable: error.retryable !== false,
    });
    process.exit(1);
  }
});

// If the worker dies, do not linger as an orphan.
process.on("disconnect", () => process.exit(1));
