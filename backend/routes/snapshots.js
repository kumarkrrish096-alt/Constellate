import { Router } from "express";
import path from "path";
import Snapshot from "../models/snapshot.js";
import { SNAPSHOT_DIR } from "../config/paths.js";

const router = Router();

router.get("/:owner/:repo/:sha", async (req, res) => {
  const { owner, repo, sha } = req.params;

  if (!/^[0-9a-f]{40}$/.test(sha)) {
    return res.status(400).json({ error: "Invalid commit sha" });
  }

  const fullname = `${owner}/${repo}`.toLowerCase();

  try {
    const snapshot = await Snapshot.findOne({ fullname, sha }).lean();

    if (!snapshot) {
      return res.status(404).json({ error: "Snapshot not found" });
    }

    const filename = path.basename(snapshot.filepath);

    res.sendFile(
      filename,
      {
        root: SNAPSHOT_DIR,
        headers: {
          "Content-Type": "application/json",
          "Content-Encoding": "gzip",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      },
      (error) => {
        if (error && !res.headersSent) {
          res.status(404).json({ error: "Snapshot file missing" });
        }
      }
    );
  } catch (error) {
    console.error("Snapshot error:", error.message);
    res.status(500).json({ error: "Could not read the snapshot, try again" });
  }
});

export default router;