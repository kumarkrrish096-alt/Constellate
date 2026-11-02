import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import Snapshot from "../models/snapshot.js";
import { SNAPSHOT_DIR } from "../config/paths.js";
import { snapshotfilename } from "../services/snapshotstore.js";

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

    const filename = path.basename(snapshot.filepath || snapshotfilename(fullname, sha, snapshot.version || 1));
    const localpath = path.join(SNAPSHOT_DIR, filename);

    let hasLocalFile = false;
    try {
      await fs.access(localpath);
      hasLocalFile = true;
    } catch {
      // Local file not present
    }

    // If local file is missing but we have snapshot.data in MongoDB, cache it to disk
    if (!hasLocalFile && snapshot.data) {
      try {
        await fs.mkdir(SNAPSHOT_DIR, { recursive: true });
        await fs.writeFile(localpath, snapshot.data);
        hasLocalFile = true;
      } catch (cacheErr) {
        console.warn("Could not cache snapshot to local disk:", cacheErr.message);
      }
    }

    if (hasLocalFile) {
      return res.sendFile(
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
            if (snapshot.data) {
              res.set({
                "Content-Type": "application/json",
                "Content-Encoding": "gzip",
                "Cache-Control": "public, max-age=31536000, immutable",
              });
              return res.send(snapshot.data);
            }
            res.status(404).json({ error: "Snapshot file missing" });
          }
        }
      );
    }

    // Direct stream from MongoDB data buffer if disk write wasn't used
    if (snapshot.data) {
      res.set({
        "Content-Type": "application/json",
        "Content-Encoding": "gzip",
        "Cache-Control": "public, max-age=31536000, immutable",
      });
      return res.send(snapshot.data);
    }

    return res.status(404).json({ error: "Snapshot file missing" });
  } catch (error) {
    console.error("Snapshot error:", error.message);
    res.status(500).json({ error: "Could not read the snapshot, try again" });
  }
});

export default router;