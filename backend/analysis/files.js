import fs from "fs/promises";
import path from "path";
import { detectlanguage, grammarfor, issource } from "./languages.js";

// Folders that are dependencies, build output or tooling, never project code.
export const IGNORED_DIRS = new Set([
  ".git", "node_modules", "bower_components", "vendor", "third_party", "flow-typed",
  "dist", "build", "out", "target", "coverage", ".next", ".nuxt", ".svelte-kit",
  ".cache", ".turbo", ".parcel-cache", ".venv", "__pycache__",
  ".mypy_cache", ".pytest_cache", ".tox", ".idea", ".vscode", ".gradle",
]);

// Binary or generated files: never read as text.
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp", ".avif", ".svgz", ".psd",
  ".pdf", ".zip", ".gz", ".tgz", ".bz2", ".xz", ".7z", ".rar", ".tar", ".jar", ".war",
  ".exe", ".dll", ".so", ".dylib", ".a", ".o", ".obj", ".class", ".pyc", ".pyo", ".wasm",
  ".woff", ".woff2", ".ttf", ".otf", ".eot", ".mp3", ".mp4", ".wav", ".ogg", ".webm",
  ".mov", ".avi", ".bin", ".dat", ".db", ".sqlite", ".lockb", ".map",
]);

const GENERATED_FILES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock", "Pipfile.lock",
  "Cargo.lock", "composer.lock", "Gemfile.lock", "go.sum",
]);

export const DEFAULT_LIMITS = {
  maxFiles: 20000,
  maxFileBytes: 1024 * 1024,
};

/**
 * List every text file under `root` that is worth analysing.
 * Paths are relative, use "/" on every OS, and come back sorted, so the same
 * folder always produces the same list (snapshots must be reproducible).
 * Symbolic links are skipped, so nothing outside `root` is ever read.
 *
 * Returns { files: [{ path, abs, size, language, grammar, source }], skipped, truncated }.
 */
export async function listfiles(root, limits = {}) {
  const { maxFiles, maxFileBytes } = { ...DEFAULT_LIMITS, ...limits };
  const files = [];
  const skipped = { count: 0, byreason: {}, samples: [] };
  let truncated = false;

  const skip = (relpath, reason) => {
    skipped.count++;
    skipped.byreason[reason] = (skipped.byreason[reason] || 0) + 1;
    if (skipped.samples.length < 200) skipped.samples.push({ path: relpath, reason });
  };

  async function walk(dir, reldir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return skip(reldir || ".", "unreadable folder");
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    // Look up every file size and virtualenv marker in this folder at once,
    // then walk the entries in sorted order so the result stays deterministic.
    const sizes = new Map();
    const venvs = new Set();
    await Promise.all(
      entries.map(async (entry) => {
        const abs = path.join(dir, entry.name);
        if (entry.isFile()) sizes.set(entry.name, (await fs.stat(abs).catch(() => null))?.size ?? null);
        else if (entry.isDirectory() && (await exists(path.join(abs, "pyvenv.cfg")))) venvs.add(entry.name);
      })
    );

    for (const entry of entries) {
      const relpath = reldir ? `${reldir}/${entry.name}` : entry.name;
      const abs = path.join(dir, entry.name);

      if (entry.isSymbolicLink()) {
        skip(relpath, "symbolic link");
      } else if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) skip(relpath + "/", "ignored folder");
        // Python virtualenvs have any name ("env", "venv", "py311"); pyvenv.cfg marks them
        else if (venvs.has(entry.name)) skip(relpath + "/", "ignored folder");
        else await walk(abs, relpath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (BINARY_EXTENSIONS.has(ext)) {
          skip(relpath, "binary");
        } else if (GENERATED_FILES.has(entry.name) || /\.min\.(js|css)$/i.test(entry.name)) {
          skip(relpath, "generated");
        } else if (files.length >= maxFiles) {
          truncated = true;
          skip(relpath, "file limit reached");
        } else {
          const size = sizes.get(entry.name);
          if (size == null) {
            skip(relpath, "unreadable");
          } else if (size > maxFileBytes) {
            skip(relpath, "too large");
          } else {
            const language = detectlanguage(relpath);
            files.push({
              path: relpath,
              abs,
              size,
              language,
              grammar: grammarfor(relpath),
              source: issource(language),
            });
          }
        }
      }
    }
  }

  await walk(root, "");
  return { files, skipped, truncated };
}

const exists = (p) =>
  fs.access(p).then(
    () => true,
    () => false
  );
