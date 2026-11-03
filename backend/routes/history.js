import { Router } from "express";
import Submission from "../models/submission.js";
import { requireauth } from "../middleware/auth.js";

const router = Router();

// GET /api/history - Retrieve user's cast history from MongoDB
router.get("/", requireauth, async (req, res) => {
  try {
    const userid = String(req.user.id);
    const subs = await Submission.find({ userid }).sort({ createdat: -1 }).lean();

    const items = subs.map((sub) => ({
      id: sub._id.toString(),
      n: sub.fullname,
      s: sub.sha.slice(0, 7),
      fullSha: sub.sha,
      l: sub.language || "Source",
      f: sub.files ?? 0,
      h: sub.health,
      cy: sub.cycles ?? 0,
      g: sub.godfiles ?? 0,
      st: sub.status || "queued",
      ms: sub.durationms,
      at: new Date(sub.createdat).getTime(),
      snapshotUrl: `/api/snapshots/${sub.fullname}/${sub.sha}`,
    }));

    res.json(items);
  } catch (error) {
    console.error("Failed to fetch history:", error);
    res.status(500).json({ error: "Could not load history" });
  }
});

// DELETE /api/history/:id - Remove a cast from user's chronicle
router.delete("/:id", requireauth, async (req, res) => {
  try {
    const userid = String(req.user.id);
    await Submission.deleteOne({ _id: req.params.id, userid });
    res.json({ message: "Struck from chronicle" });
  } catch (error) {
    console.error("Failed to delete history item:", error);
    res.status(500).json({ error: "Could not delete history item" });
  }
});

export default router;
