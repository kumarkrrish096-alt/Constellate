import path from "path";

// Extension -> language. "Source" languages become nodes in the dependency
// graph; the rest (docs, config, styles) only appear in the file tree.
const EXTENSIONS = {
  ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
  ".ts": "typescript", ".mts": "typescript", ".cts": "typescript", ".tsx": "typescript",
  ".py": "python", ".pyi": "python",
  ".java": "java", ".kt": "kotlin", ".scala": "scala",
  ".go": "go", ".rs": "rust", ".rb": "ruby", ".php": "php", ".swift": "swift",
  ".c": "c", ".h": "c", ".cpp": "cpp", ".cc": "cpp", ".cxx": "cpp", ".hpp": "cpp",
  ".cs": "csharp", ".dart": "dart", ".lua": "lua", ".sh": "shell",
  ".vue": "vue", ".svelte": "svelte",
  ".json": "json", ".md": "markdown", ".mdx": "markdown", ".yml": "yaml", ".yaml": "yaml",
  ".toml": "toml", ".html": "html", ".css": "css", ".scss": "scss", ".sql": "sql",
};

const SOURCE_LANGUAGES = new Set([
  "javascript", "typescript", "python", "java", "kotlin", "scala", "go", "rust", "ruby",
  "php", "swift", "c", "cpp", "csharp", "dart", "lua", "shell", "vue", "svelte",
]);

// Languages with a Tree-sitter grammar: these get full AST analysis
// (imports, exports, functions, calls, complexity). The others are listed
// with line and approximate token counts only.
// .jsx uses the JavaScript grammar (it understands JSX); .tsx needs its own.
const GRAMMARS = {
  javascript: "tree-sitter-javascript/tree-sitter-javascript.wasm",
  typescript: "tree-sitter-typescript/tree-sitter-typescript.wasm",
  tsx: "tree-sitter-typescript/tree-sitter-tsx.wasm",
  python: "tree-sitter-python/tree-sitter-python.wasm",
};

export function detectlanguage(filepath) {
  return EXTENSIONS[path.extname(filepath).toLowerCase()] || null;
}

export function issource(language) {
  return SOURCE_LANGUAGES.has(language);
}

/** Which grammar parses this file, or null if it has none. */
export function grammarfor(filepath) {
  const ext = path.extname(filepath).toLowerCase();
  if (ext === ".tsx") return "tsx";
  const language = EXTENSIONS[ext];
  return GRAMMARS[language] ? language : null;
}

export function grammarfile(grammar) {
  return GRAMMARS[grammar];
}
