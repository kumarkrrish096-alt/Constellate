export const LIMITS = {
  maxArchiveBytes: 150 * 1024 * 1024, // zip file: 150 MB
  maxFiles: 20000,                    // files inside the zip
  maxFileBytes: 1024 * 1024,          // one source file: 1 MB
  maxSeconds: 90,                     // time allowed for one job
  maxEntries: 100000,                 // everything inside the zip, even skipped items
  maxTotalBytes: 300 * 1024 * 1024,
};

export const IGNORED_FOLDERS = [
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

export const CODE_EXTENSIONS = [
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".py",
  ".java",
];