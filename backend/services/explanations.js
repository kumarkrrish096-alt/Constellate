import crypto from "crypto";
import { AI_PROMPT_VERSION, getaiconfig } from "../config/ai.js";
import { buildexplanationcontextforpreparedrequest, prepareexplanationrequest } from "./aiContext.js";
import { generateexplanation, explanationSchema } from "./aiExplanation.js";
import Explanation from "../models/explanation.js";
import { ANALYSIS_VERSION } from "../analysis/pipeline.js";

const MAX_QUESTION_LENGTH = 1000;

/** Validate access to the analyzed file, serve a cache hit, or generate and cache a successful answer. */
export async function explaincode(input, {
  fetchImpl = fetch,
  explanationModel = Explanation,
  generate = generateexplanation,
} = {}) {
  const task = input.task;
  if (!new Set(["file", "function", "question"]).has(task)) {
    throw requesterror("invalid_task", "Explanation task must be file, function, or question.", 400);
  }
  if (task === "function" && input.functionName === undefined) {
    throw requesterror("invalid_function", "Function explanations require a function name and line.", 400);
  }
  if (task === "file" && input.functionName !== undefined) {
    throw requesterror("invalid_function", "File explanations cannot include a function identity.", 400);
  }

  if (input.question !== undefined && typeof input.question !== "string") {
    throw requesterror("invalid_question", "The follow-up question must be text.", 400);
  }
  const question = input.question === undefined ? null : input.question.trim();
  if (task === "question" && (!question || question.length > MAX_QUESTION_LENGTH)) {
    throw requesterror("invalid_question", `A follow-up question of 1 to ${MAX_QUESTION_LENGTH} characters is required.`, 400);
  }
  if (task !== "question" && question !== null) {
    throw requesterror("invalid_question", "A follow-up question can only be sent for a question task.", 400);
  }

  const prepared = await prepareexplanationrequest(input, { fetchImpl });
  const config = getaiconfig();
  const questionhash = question === null ? null : crypto.createHash("sha256").update(question).digest("hex");
  const key = {
    fullname: prepared.fullname,
    sha: prepared.sha,
    filepath: prepared.filePath,
    functionname: prepared.selectedFunction?.name ?? null,
    functionline: prepared.selectedFunction?.line ?? null,
    analysisversion: ANALYSIS_VERSION,
    promptversion: AI_PROMPT_VERSION,
    model: config.model,
    questionhash,
  };

  const cached = await explanationModel.findOne(key).lean();
  if (cached) {
    const valid = explanationSchema.safeParse(cached.explanation);
    if (valid.success) {
      return {
        explanation: valid.data,
        model: cached.model,
        promptVersion: cached.promptversion,
        generatedAt: cached.generatedat,
        cacheHit: true,
      };
    }
    await explanationModel.deleteOne({ _id: cached._id });
  }

  const context = await buildexplanationcontextforpreparedrequest(prepared, { fetchImpl });
  const generated = await generate({ task, context, question });
  const valid = explanationSchema.safeParse(generated.explanation);
  if (!valid.success) {
    throw requesterror("ai_invalid_response", "The explanation provider returned invalid explanation data.", 502);
  }

  const cacheRecord = {
    ...key,
    explanation: valid.data,
    generatedat: generated.generatedAt || new Date(),
  };
  try {
    await explanationModel.updateOne(key, { $setOnInsert: cacheRecord }, { upsert: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
  }

  return {
    explanation: valid.data,
    model: generated.model || config.model,
    promptVersion: generated.promptVersion || AI_PROMPT_VERSION,
    generatedAt: cacheRecord.generatedat,
    cacheHit: false,
  };
}

function requesterror(code, message, status) {
  const error = new Error(message);
  error.name = "AIExplanationError";
  error.code = code;
  error.status = status;
  return error;
}
