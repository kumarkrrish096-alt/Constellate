const num = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const LIMITS = {
  maxArchiveBytes: num("MAX_ARCHIVE_BYTES", 150 * 1024 * 1024),    // zip file: 150 MB
  maxFiles: num("MAX_FILES", 20000),                                // files inside the zip
  maxFileBytes: num("MAX_FILE_BYTES", 1024 * 1024),                 // one source file: 1 MB
  maxSeconds: num("MAX_JOB_SECONDS", 90),                           // time allowed for one job
  maxEntries: num("MAX_ENTRIES", 100000),                            // everything inside the zip, even skipped items
  maxTotalBytes: num("MAX_TOTAL_BYTES", 300 * 1024 * 1024),
};

// Folders to skip can be extended via EXTRA_IGNORED_FOLDERS (comma-separated).
const DEFAULT_IGNORED_FOLDERS = [
  "node_modules",
  ".git",
  "vendor",
  "dist",
  "build",
  "coverage",
  ".next",
  "out",
  "__pycache__",
];

const extraIgnored = (process.env.EXTRA_IGNORED_FOLDERS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const IGNORED_FOLDERS = [...DEFAULT_IGNORED_FOLDERS, ...extraIgnored];

// Code extensions can be extended via EXTRA_CODE_EXTENSIONS (comma-separated).
const DEFAULT_CODE_EXTENSIONS = [
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".py",
  ".java",
];

const extraExtensions = (process.env.EXTRA_CODE_EXTENSIONS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const CODE_EXTENSIONS = [...DEFAULT_CODE_EXTENSIONS, ...extraExtensions];