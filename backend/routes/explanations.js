import { Router } from "express";
import { z } from "zod";
import { explaincode } from "../services/explanations.js";

const router = Router();

const requestSchema = z.object({
  task: z.enum(["file", "function", "question"]),
  fullname: z.string().min(3).max(200),
  sha: z.string().length(40),
  filePath: z.string().min(1).max(500),
  functionName: z.string().min(1).max(240).optional(),
  functionLine: z.number().int().positive().optional(),
  question: z.string().max(1000).optional(),
}).strict();

router.post("/file", (req, res) => handle(req, res, "file"));
router.post("/function", (req, res) => handle(req, res, "function"));
router.post("/question", (req, res) => handle(req, res, "question"));

async function handle(req, res, task) {
  const parsed = requestSchema.safeParse({ ...req.body, task });
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid explanation request.", code: "invalid_request" });
  }

  try {
    const result = await explaincode(parsed.data);
    return res.json(result);
  } catch (error) {
    if (error?.name === "AIExplanationError" && Number.isInteger(error.status)) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    return res.status(500).json({ error: "Could not generate an explanation. Please retry.", code: "explanation_failed" });
  }
}

export default router;