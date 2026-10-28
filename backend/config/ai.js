const DEFAULT_MODEL = "gemini-3-flash-preview";

function boundedinteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export function getaiconfig() {
  return {
    apiKey: process.env.GEMINI_API_KEY?.trim() || null,
    model: process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL,
    maxoutputtokens: boundedinteger(process.env.AI_MAX_OUTPUT_TOKENS, 2000, 100, 4000),
    timeoutms: boundedinteger(process.env.AI_TIMEOUT_MS, 45_000, 1_000, 120_000),
  };
}

export const AI_PROMPT_VERSION = "explanation-v2-gemini";