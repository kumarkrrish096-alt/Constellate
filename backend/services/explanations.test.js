import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import Snapshot from "../models/snapshot.js";
import { ANALYSIS_VERSION } from "../analysis/pipeline.js";
import { SNAPSHOT_DIR } from "../config/paths.js";
import { explaincode } from "./explanations.js";

const sha = "b".repeat(40);
const model = "gemini-3.8-flash";
const validExplanation = {
  summary: "Runs the selected operation.",
  purpose: "Coordinates a small source-level operation.",
  behaviour: [{ description: "Calls its helper", lineStart: 1, lineEnd: 2 }],
  functions: [],
  dependencies: [],
  inputs: ["source"],
  outputs: ["result"],
  sideEffects: [],
  potentialIssues: [],
  limitations: [],
};

async function installSnapshotFixture(t) {
  const oldGeminiModel = process.env.GEMINI_MODEL;
  process.env.GEMINI_MODEL = model;
  t.after(() => {
    if (oldGeminiModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = oldGeminiModel;
  });
  await fs.mkdir(SNAPSHOT_DIR, { recursive: true });
  const filepath = path.join(SNAPSHOT_DIR, `explanation-test-${process.pid}-${Math.random().toString(16).slice(2)}.json.gz`);
  const snapshot = {
    format: "constellate/1",
    repo: { fullname: "owner/repo", sha },
    files: [
      { id: 0, path: "src/module.js", language: "javascript", lines: 2, complexity: 1, exports: ["run"], functions: [0], external: [], builtin: [], fanin: 0, fanout: 0, blastradius: 0, churn: null, cycle: null, cyclelines: [], health: null, syntaxerrors: false },
    ],
    functions: [{ file: 0, name: "run", line: 1, endline: 2, complexity: 1, tokens: 4 }],
    edges: [],
    calls: [],
    callgraphtruncated: false,
  };
  await fs.writeFile(filepath, zlib.gzipSync(JSON.stringify(snapshot)));

  const originalFindOne = Snapshot.findOne;
  Snapshot.findOne = filter => ({
    lean: async () => filter.fullname === "owner/repo" && filter.sha === sha && filter.version === ANALYSIS_VERSION
      ? { fullname: "owner/repo", sha, version: ANALYSIS_VERSION, filepath }
      : null,
  });
  t.after(async () => {
    Snapshot.findOne = originalFindOne;
    await fs.rm(filepath, { force: true });
  });
}

function memoryCache() {
  const entries = new Map();
  const keyof = key => JSON.stringify(key);
  return {
    entries,
    findOne: key => ({ lean: async () => entries.get(keyof(key)) || null }),
    updateOne: async (key, update) => {
      if (!entries.has(keyof(key))) entries.set(keyof(key), { ...Object.values(update)[0] });
    },
    deleteOne: async filter => {
      for (const [key, entry] of entries) if (String(entry._id) === String(filter._id)) entries.delete(key);
    },
  };
}

function fixtureInput(overrides = {}) {
  return {
    task: "file",
    fullname: "owner/repo",
    sha,
    filePath: "src/module.js",
    ...overrides,
  };
}

test("cache miss fetches pinned source, generates once, and cache hit skips both", async t => {
  await installSnapshotFixture(t);
  let sourceFetches = 0;
  let visibilityChecks = 0;
  let generations = 0;
  let writes = 0;
  const cache = memoryCache();
  const result = await explaincode(fixtureInput(), {
    explanationModel: {
      findOne: cache.findOne,
      updateOne: async (...args) => { writes++; return cache.updateOne(...args); },
      deleteOne: cache.deleteOne,
    },
    generate: async request => {
      generations++;
      assert.equal(request.task, "file");
      assert.match(request.context.source, /function run/);
      return { explanation: validExplanation, model, promptVersion: "explanation-v1", generatedAt: new Date() };
    },
    fetchImpl: async (url, options) => {
      assert.equal(url, `https://raw.githubusercontent.com/owner/repo/${sha}/src/module.js`);
      assert.equal(options.redirect, "error");
      if (options.method === "HEAD") { visibilityChecks++; return new Response(null, { status: 200 }); }
      sourceFetches++;
      return new Response("function run() {\n return 1;\n}", { status: 200 });
    },
  });

  assert.equal(result.cacheHit, false);
  assert.equal(writes, 1);
  const cachedResult = await explaincode(fixtureInput(), {
    explanationModel: cache,
    generate: async () => { generations++; throw new Error("must not generate on hit"); },
    fetchImpl: async (url, options) => {
      if (options.method === "HEAD") { visibilityChecks++; return new Response(null, { status: 200 }); }
      sourceFetches++;
      throw new Error("must not fetch source on hit");
    },
  });
  assert.equal(cachedResult.cacheHit, true);
  assert.equal(generations, 1);
  assert.equal(sourceFetches, 1);
  assert.equal(visibilityChecks, 2);
});

test("rejects private or missing pinned source before looking up explanation cache", async t => {
  await installSnapshotFixture(t);
  let cacheLookups = 0;

  await assert.rejects(explaincode(fixtureInput(), {
    explanationModel: { findOne: () => { cacheLookups++; return { lean: async () => null }; } },
    fetchImpl: async (_url, options) => {
      assert.equal(options.method, "HEAD");
      return new Response(null, { status: 404 });
    },
  }), { code: "repository_not_public", status: 404 });
  assert.equal(cacheLookups, 0);
});

test("validates snapshot membership before returning a cached explanation", async t => {
  await installSnapshotFixture(t);
  let lookupCount = 0;
  const cache = {
    findOne: () => ({ lean: async () => { lookupCount++; return { explanation: validExplanation, model, promptversion: "explanation-v1", generatedat: new Date() }; } }),
  };

  await assert.rejects(explaincode(fixtureInput({ filePath: "src/not-in-snapshot.js" }), {
    explanationModel: cache,
    generate: async () => { throw new Error("must not generate"); },
  }), { code: "file_not_in_snapshot" });
  assert.equal(lookupCount, 0);
});

test("uses distinct cache entries for distinct follow-up questions", async t => {
  await installSnapshotFixture(t);
  const cache = memoryCache();
  const hashes = [];
  const options = {
    explanationModel: {
      findOne: key => { hashes.push(key.questionhash); return cache.findOne(key); },
      updateOne: cache.updateOne,
      deleteOne: cache.deleteOne,
    },
    generate: async () => ({ explanation: validExplanation, model, promptVersion: "explanation-v1", generatedAt: new Date() }),
    fetchImpl: async (_url, options) => options.method === "HEAD"
      ? new Response(null, { status: 200 })
      : new Response("function run() {\n return 1;\n}", { status: 200 }),
  };
  await explaincode(fixtureInput({ task: "question", question: "What does it return?" }), options);
  await explaincode(fixtureInput({ task: "question", question: "Which helper is called?" }), options);

  assert.notEqual(hashes[0], hashes[1]);
  assert.equal(cache.entries.size, 2);
});
