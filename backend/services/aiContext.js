import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import zlib from "zlib";
import Snapshot from "../models/snapshot.js";
import { ANALYSIS_VERSION } from "../analysis/pipeline.js";
import { SNAPSHOT_DIR } from "../config/paths.js";
import { AIExplanationError } from "./aiExplanation.js";

const gunzip = promisify(zlib.gunzip);
const FULL_SHA = /^[0-9a-f]{40}$/i;
const REPOSITORY = /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i;
const MAX_SOURCE_BYTES = 1024 * 1024;
const MAX_FILE_CONTEXT_CHARS = 32_000;
const MAX_FUNCTION_CONTEXT_CHARS = 32_000;
const MAX_GRAPH_ITEMS = 30;

export function validateexplanationidentity({ fullname, sha, filePath, functionName, functionLine }) {
  if (typeof fullname !== "string" || !REPOSITORY.test(fullname) || fullname.includes("..")) {
    throw new AIExplanationError("invalid_repository", "A valid public GitHub repository name is required.", 400);
  }
  if (typeof sha !== "string" || !FULL_SHA.test(sha)) {
    throw new AIExplanationError("invalid_commit", "A full 40-character commit SHA is required.", 400);
  }
  if (typeof filePath !== "string" || !filePath || filePath.length > 500 || filePath.includes("\\") || filePath.startsWith("/")) {
    throw new AIExplanationError("invalid_file_path", "A valid repository-relative file path is required.", 400);
  }
  const parts = filePath.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || /[\u0000-\u001f]/.test(part))) {
    throw new AIExplanationError("invalid_file_path", "A valid repository-relative file path is required.", 400);
  }
  if (functionName !== undefined && (typeof functionName !== "string" || !functionName.trim() || functionName.length > 240)) {
    throw new AIExplanationError("invalid_function", "A valid function name is required.", 400);
  }
  if (functionLine !== undefined && (!Number.isInteger(functionLine) || functionLine < 1)) {
    throw new AIExplanationError("invalid_function", "A valid function line number is required.", 400);
  }
  if ((functionName === undefined) !== (functionLine === undefined)) {
    throw new AIExplanationError("invalid_function", "Function name and line number must be provided together.", 400);
  }

  return { fullname: fullname.toLowerCase(), sha: sha.toLowerCase(), filePath };
}

export function buildexplanationcontext({ snapshot, filePath, source, functionName, functionLine }) {
  const file = snapshot.files?.find((entry) => entry.path === filePath);
  if (!file) {
    throw new AIExplanationError("file_not_in_snapshot", "That file is not part of the analyzed commit.", 404);
  }

  const sourceLines = source.split("\n");
  const functions = snapshot.functions || [];
  const fileFunctions = (file.functions || []).map((id) => functions[id]).filter(Boolean);
  const selectedFunction = functionName === undefined
    ? null
    : fileFunctions.find((entry) => entry.name === functionName && entry.line === functionLine);

  if (functionName !== undefined && !selectedFunction) {
    throw new AIExplanationError("function_not_in_snapshot", "That function does not match the analyzed file and line.", 404);
  }

  const fileEdges = snapshot.edges || [];
  const pathForId = (id) => snapshot.files?.[id]?.path;
  const imports = fileEdges
    .filter((edge) => edge.s === file.id)
    .slice(0, MAX_GRAPH_ITEMS)
    .map((edge) => ({ path: pathForId(edge.t), lines: edge.lines || [], kinds: edge.kinds || [] }))
    .filter((edge) => edge.path);
  const importedBy = fileEdges
    .filter((edge) => edge.t === file.id)
    .slice(0, MAX_GRAPH_ITEMS)
    .map((edge) => ({ path: pathForId(edge.s), lines: edge.lines || [], kinds: edge.kinds || [] }))
    .filter((edge) => edge.path);

  const functionIndex = new Map(functions.map((entry, index) => [entry, index]));
  const selectedIndex = selectedFunction ? functionIndex.get(selectedFunction) : null;
  const calls = snapshot.calls || [];
  const callers = selectedFunction
    ? calls.filter((edge) => edge[1] === selectedIndex).slice(0, MAX_GRAPH_ITEMS).map((edge) => functionreference(functions[edge[0]], pathForId))
    : [];
  const callees = selectedFunction
    ? calls.filter((edge) => edge[0] === selectedIndex).slice(0, MAX_GRAPH_ITEMS).map((edge) => functionreference(functions[edge[1]], pathForId))
    : [];

  const sourceStart = selectedFunction ? selectedFunction.line : 1;
  const sourceEnd = selectedFunction ? selectedFunction.endline : sourceLines.length;
  const sourceText = sourceLines.slice(sourceStart - 1, sourceEnd).join("\n");
  const contextLimit = selectedFunction ? MAX_FUNCTION_CONTEXT_CHARS : MAX_FILE_CONTEXT_CHARS;
  if (sourceText.length > contextLimit) {
    throw new AIExplanationError(
      "source_too_large",
      selectedFunction
        ? "This function is too large to explain in one request."
        : "This file is too large for a whole-file explanation. Select a function to explain it in smaller parts.",
      413,
    );
  }

  return {
    repository: snapshot.repo?.fullname,
    commit: snapshot.repo?.sha,
    path: file.path,
    language: file.language,
    scope: selectedFunction ? "function" : "file",
    source: sourceText,
    sourceLineStart: sourceStart,
    sourceLineEnd: sourceEnd,
    filePurposeContext: selectedFunction ? {
      language: file.language,
      imports: file.external || [],
      builtins: file.builtin || [],
      exports: file.exports || [],
    } : undefined,
    functions: selectedFunction ? [selectedFunction] : fileFunctions.slice(0, 100),
    imports,
    importedBy,
    callers,
    callees,
    metrics: {
      lines: file.lines,
      complexity: file.complexity,
      fanin: file.fanin,
      fanout: file.fanout,
      blastRadius: file.blastradius,
      churn: file.churn,
      cycle: file.cycle,
      cycleLines: file.cyclelines || [],
      health: file.health,
      syntaxErrors: file.syntaxerrors,
    },
    metadataLimitations: [
      "Git history metrics are unavailable for downloaded source archives unless the snapshot contains them.",
      ...(snapshot.callgraphtruncated ? ["The stored function call graph was truncated during analysis."] : []),
    ],
  };
}

/** Load a current snapshot and fetch only its matching public pinned source file. */
export async function buildexplanationcontextforrequest(input, { fetchImpl = fetch } = {}) {
  const prepared = await prepareexplanationrequest(input, { fetchImpl });
  return buildexplanationcontextforpreparedrequest(prepared, { fetchImpl });
}

export async function prepareexplanationrequest(input, { fetchImpl = fetch } = {}) {
  const identity = validateexplanationidentity(input);
  const record = await Snapshot.findOne({
    fullname: identity.fullname,
    sha: identity.sha,
    version: ANALYSIS_VERSION,
  }).lean();
  if (!record) {
    throw new AIExplanationError("snapshot_not_found", "Analyze this public repository commit before requesting an explanation.", 404);
  }

  const snapshot = await readsnapshot(record, identity);
  const file = snapshot.files?.find((entry) => entry.path === identity.filePath);
  if (!file) {
    throw new AIExplanationError("file_not_in_snapshot", "That file is not part of the analyzed commit.", 404);
  }

  const functions = snapshot.functions || [];
  const fileFunctions = (file.functions || []).map((id) => functions[id]).filter(Boolean);
  const selectedFunction = input.functionName === undefined
    ? null
    : fileFunctions.find((entry) => entry.name === input.functionName && entry.line === input.functionLine);
  if (input.functionName !== undefined && !selectedFunction) {
    throw new AIExplanationError("function_not_in_snapshot", "That function does not match the analyzed file and line.", 404);
  }

  await assertpinnedsourcepublic(identity, fetchImpl);

  return { ...identity, snapshot, file, selectedFunction };
}

export async function buildexplanationcontextforpreparedrequest(prepared, { fetchImpl = fetch } = {}) {
  const source = await fetchpinnedsource(prepared, fetchImpl);
  return buildexplanationcontext({
    ...prepared,
    functionName: prepared.selectedFunction?.name,
    functionLine: prepared.selectedFunction?.line,
    source,
  });
}

async function readsnapshot(record, identity) {
  const target = path.resolve(record.filepath);
  const root = path.resolve(SNAPSHOT_DIR) + path.sep;
  if (!target.startsWith(root) || path.basename(target) !== path.basename(record.filepath)) {
    throw new AIExplanationError("snapshot_unavailable", "The analyzed snapshot is unavailable.", 503);
  }

  try {
    const compressed = await fs.readFile(target);
    const raw = await gunzip(compressed);
    const snapshot = JSON.parse(raw.toString("utf8"));
    if (snapshot.repo?.fullname?.toLowerCase() !== identity.fullname || snapshot.repo?.sha?.toLowerCase() !== identity.sha) {
      throw new Error("Snapshot identity mismatch");
    }
    return snapshot;
  } catch {
    throw new AIExplanationError("snapshot_unavailable", "The analyzed snapshot is unavailable or invalid.", 503);
  }
}

async function fetchpinnedsource(identity, fetchImpl) {
  const url = pinnedsourceurl(identity);
  let response;
  try {
    response = await fetchImpl(url, {
      redirect: "error",
      signal: AbortSignal.timeout(25_000),
      headers: { Accept: "text/plain" },
    });
  } catch (fetchErr) {
    console.error("fetchpinnedsource error:", fetchErr.message, fetchErr.cause);
    throw new AIExplanationError("source_unavailable", "Could not retrieve source for this public commit.", 502);
  }

  if (response.status === 404) {
    throw new AIExplanationError("source_unavailable", "Source is unavailable at the requested public commit.", 404);
  }
  if (!response.ok) {
    throw new AIExplanationError("source_unavailable", "Could not retrieve source for this public commit.", 502);
  }

  const declaredBytes = Number(response.headers.get("content-length"));
  if (declaredBytes > MAX_SOURCE_BYTES) {
    throw new AIExplanationError("source_too_large", "The source file exceeds the supported size limit.", 413);
  }

  if (!response.body) {
    throw new AIExplanationError("source_unavailable", "Could not retrieve source for this public commit.", 502);
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_SOURCE_BYTES) {
        await reader.cancel();
        throw new AIExplanationError("source_too_large", "The source file exceeds the supported size limit.", 413);
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    if (error instanceof AIExplanationError) throw error;
    throw new AIExplanationError("source_unavailable", "Could not retrieve source for this public commit.", 502);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function assertpinnedsourcepublic(identity, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(pinnedsourceurl(identity), {
      method: "HEAD",
      redirect: "error",
      signal: AbortSignal.timeout(25_000),
      headers: { Accept: "text/plain" },
    });
  } catch {
    throw new AIExplanationError("repository_visibility_unavailable", "Could not verify that this repository source is publicly accessible.", 502);
  }

  if (response.status === 404) {
    throw new AIExplanationError("repository_not_public", "AI explanations are available for public GitHub repositories only.", 404);
  }
  if (response.status !== 200) {
    throw new AIExplanationError("repository_visibility_unavailable", "Could not verify that this repository source is publicly accessible.", 502);
  }
}

function pinnedsourceurl(identity) {
  const encodedPath = identity.filePath.split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${identity.fullname}/${identity.sha}/${encodedPath}`;
}

function functionreference(fn, pathForId) {
  if (!fn) return null;
  return { path: pathForId(fn.file), name: fn.name, lineStart: fn.line, lineEnd: fn.endline };
}
