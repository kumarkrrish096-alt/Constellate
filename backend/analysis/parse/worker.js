// Runs inside a worker thread (see pool.js). Loads Tree-sitter once, then
// parses batches of files: { batchid, files: [{ path, abs, grammar }] }
// and replies { batchid, results }. Files are only read as text, never run.

import fs from "fs/promises";
import { createRequire } from "module";
import { parentPort } from "worker_threads";
import { Parser, Language } from "web-tree-sitter";
import { grammarfile } from "../languages.js";
import { extractjavascript } from "./javascript.js";
import { extractpython } from "./python.js";

const require = createRequire(import.meta.url);
const EXTRACTORS = {
  javascript: extractjavascript,
  typescript: extractjavascript,
  tsx: extractjavascript,
  python: extractpython,
};

let parser = null;
const loaded = new Map();

async function parserfor(grammar) {
  if (!parser) {
    await Parser.init();
    parser = new Parser();
  }
  if (!loaded.has(grammar)) {
    loaded.set(grammar, await Language.load(require.resolve(grammarfile(grammar))));
  }
  parser.setLanguage(loaded.get(grammar));
  return parser;
}

const countlines = (text) => (text.length === 0 ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0));

// For languages without a grammar: identifiers, numbers and single symbols.
const approxtokens = (text) =>
  (text.replace(/\/\/.*$|#.*$|\/\*[\s\S]*?\*\//gm, "").match(/[A-Za-z_$][\w$]*|\d[\w.]*|\S/g) || []).length;

async function parseone({ path, abs, grammar }) {
  try {
    const buffer = await fs.readFile(abs);
    // A NUL byte in the first 8 KB means binary content despite the extension.
    if (buffer.subarray(0, 8000).includes(0)) return { path, binary: true };

    const text = buffer.toString("utf8");
    const lines = countlines(text);

    if (!grammar) return { path, lines, tokens: approxtokens(text), parsed: false };

    const tree = (await parserfor(grammar)).parse(text);
    try {
      return {
        path,
        lines,
        parsed: true,
        // Tree-sitter recovers from syntax errors, so a broken file still gives a usable tree.
        syntaxerrors: tree.rootNode.hasError,
        ...EXTRACTORS[grammar](tree),
      };
    } finally {
      tree.delete();
    }
  } catch (error) {
    return { path, error: error.message };
  }
}

parentPort.on("message", async ({ batchid, files }) => {
  const results = [];
  for (const file of files) results.push(await parseone(file));
  parentPort.postMessage({ batchid, results });
});
