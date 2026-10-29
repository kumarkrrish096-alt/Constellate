import assert from "node:assert/strict";
import test from "node:test";
import { buildexplanationcontext, validateexplanationidentity } from "./aiContext.js";

const sha = "a".repeat(40);

function makeSnapshot() {
  return {
    repo: { fullname: "owner/repo", sha },
    files: [
      { id: 0, path: "src/module.js", language: "javascript", lines: 7, complexity: 3, exports: ["run"], functions: [0, 1], external: ["pkg"], builtin: ["node:fs"], fanin: 1, fanout: 1, blastradius: 2, churn: null, cycle: null, cyclelines: [], health: { score: 80 } },
      { id: 1, path: "src/caller.js", language: "javascript", functions: [2] },
    ],
    functions: [
      { file: 0, name: "run", line: 1, endline: 3, complexity: 2, tokens: 9 },
      { file: 0, name: "helper", line: 4, endline: 6, complexity: 1, tokens: 4 },
      { file: 1, name: "caller", line: 1, endline: 2, complexity: 1, tokens: 3 },
    ],
    edges: [{ s: 1, t: 0, lines: [1], kinds: ["import"] }],
    calls: [[2, 0], [0, 1]],
    callgraphtruncated: false,
  };
}

test("rejects unsafe paths, abbreviated SHAs, and malformed function identity", () => {
  assert.throws(() => validateexplanationidentity({ fullname: "owner/repo", sha, filePath: "../secret.js" }), { code: "invalid_file_path" });
  assert.throws(() => validateexplanationidentity({ fullname: "owner/repo", sha: "abc123", filePath: "src/module.js" }), { code: "invalid_commit" });
  assert.throws(() => validateexplanationidentity({ fullname: "owner/repo", sha, filePath: "src/module.js", functionName: "run" }), { code: "invalid_function" });
});

test("builds function context with exact lines, imports, callers, and callees", () => {
  const context = buildexplanationcontext({
    snapshot: makeSnapshot(),
    filePath: "src/module.js",
    source: "function run() {\n helper();\n}\nfunction helper() {\n return 1;\n}",
    functionName: "run",
    functionLine: 1,
  });

  assert.equal(context.scope, "function");
  assert.equal(context.sourceLineStart, 1);
  assert.equal(context.sourceLineEnd, 3);
  assert.match(context.source, /helper\(\)/);
  assert.equal(context.importedBy[0].path, "src/caller.js");
  assert.equal(context.callers[0].name, "caller");
  assert.equal(context.callees[0].name, "helper");
  assert.deepEqual(context.filePurposeContext.exports, ["run"]);
});

test("rejects a function not present at the requested line", () => {
  assert.throws(() => buildexplanationcontext({
    snapshot: makeSnapshot(),
    filePath: "src/module.js",
    source: "function run() {}",
    functionName: "run",
    functionLine: 2,
  }), { code: "function_not_in_snapshot" });
});

test("rejects oversized file and function context instead of truncating", () => {
  const snapshot = makeSnapshot();
  const bigFunctionSnapshot = structuredClone(snapshot);
  bigFunctionSnapshot.functions[0].endline = 1;
  assert.throws(() => buildexplanationcontext({
    snapshot,
    filePath: "src/module.js",
    source: "x".repeat(48_001),
  }), { code: "source_too_large" });
  assert.throws(() => buildexplanationcontext({
    snapshot: bigFunctionSnapshot,
    filePath: "src/module.js",
    source: "x".repeat(32_001),
    functionName: "run",
    functionLine: 1,
  }), { code: "source_too_large" });
});
