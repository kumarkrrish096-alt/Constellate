import fs from "fs";
import path from "path";
import { builtinModules } from "module";
import { IGNORED_DIRS } from "./files.js";

const posix = path.posix;

// Tried in order when an import omits the extension.
const JS_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"];
// TypeScript projects write "./a.js" but the file on disk is a.ts.
const TS_SWAPS = { ".js": [".ts", ".tsx"], ".jsx": [".tsx"], ".mjs": [".mts"], ".cjs": [".cts"] };
const NODE_BUILTINS = new Set(builtinModules);
const ASSET_EXTENSION = /\.(png|jpe?g|gif|svg|webp|avif|ico|bmp|css|scss|sass|less|woff2?|ttf|otf|eot|mp3|mp4|webm|wav|txt|md|html|wasm|glsl|frag|vert)$/i;

/**
 * Build a resolver for one repository. `files` is the list from listfiles().
 *
 * resolve(fromPath, importEntry, language) returns an array of outcomes:
 *   { target: "src/a.ts" }       a source file in this repo (becomes a graph edge)
 *   { external: "react" }        a third-party package
 *   { builtin: "fs" }            a Node.js built-in module
 *   { generated: "dist/x.js" }   points into build output, which is never analysed
 *   { asset: "logo.png" }        an image, stylesheet or other non-code file
 *   { unresolved: "./missing" }  looks local but no file matches (a broken import)
 * Python "from pkg import a, b" can point at several submodules, hence an array.
 */
export function createresolver(root, files) {
  const sources = new Set(files.filter((f) => f.source).map((f) => f.path));
  const allpaths = new Set(files.map((f) => f.path));
  const tsconfigs = loadtsconfigs(root, files);
  const workspaces = loadworkspaces(root, files);
  const pyroots = pythonroots(allpaths);
  const cache = new Map();

  const issource = (p) => sources.has(p);

  function firstsource(base) {
    base = posix.normalize(base);
    if (base.startsWith("..")) return null; // outside the repository
    if (issource(base)) return base;
    const ext = posix.extname(base);
    for (const swap of TS_SWAPS[ext] || []) {
      const swapped = base.slice(0, -ext.length) + swap;
      if (issource(swapped)) return swapped;
    }
    for (const e of JS_EXTENSIONS) if (issource(base + e)) return base + e;
    for (const e of JS_EXTENSIONS) if (issource(`${base}/index${e}`)) return `${base}/index${e}`;
    return null;
  }

  function nearesttsconfig(frompath) {
    let dir = posix.dirname(frompath);
    for (;;) {
      const config = tsconfigs.get(dir === "." ? "" : dir);
      if (config) return config;
      if (dir === "." || dir === "") return null;
      dir = posix.dirname(dir);
    }
  }

  function resolvejs(frompath, spec) {
    if (typeof spec !== "string") return [{ unresolved: String(spec) }];
    spec = spec.split("?")[0].split("!").pop(); // drop "?raw" queries and "loader!" prefixes
    if (!spec) return [{ unresolved: spec }];

    if (spec.startsWith(".") || spec.startsWith("/")) {
      const base = spec.startsWith("/") ? spec.slice(1) : posix.join(posix.dirname(frompath), spec);
      // "./logo.png", "./styles.css": bundler assets, not code (images are not even listed)
      if (ASSET_EXTENSION.test(spec)) return [{ asset: posix.normalize(base) }];
      // "../node_modules/x", "./dist/bundle.js", "./cjs/x.min.js": dependencies or build
      // output, which are never analysed, so a missing file there is not a broken import
      const folders = posix.normalize(base).split("/");
      if (folders.includes("node_modules")) return [{ external: folders[folders.indexOf("node_modules") + 1] || spec }];
      if (folders.slice(0, -1).some((part) => IGNORED_DIRS.has(part) || part === "cjs") || /\.min\.js$/.test(spec)) {
        return [{ generated: posix.normalize(base) }];
      }
      const target = firstsource(base);
      // "./styles.css" or "./data.json" exist but are not source files: not an edge, not broken
      if (!target && allpaths.has(posix.normalize(base))) return [{ asset: posix.normalize(base) }];
      return [target ? { target } : { unresolved: spec }];
    }

    if (spec.startsWith("node:") || NODE_BUILTINS.has(spec) || NODE_BUILTINS.has(spec.split("/")[0])) {
      return [{ builtin: spec.replace(/^node:/, "") }];
    }

    const config = nearesttsconfig(frompath);
    if (config) {
      for (const rule of config.paths) {
        const matched = rule.match(spec);
        if (matched == null) continue;
        for (const replacement of rule.targets) {
          const target = firstsource(posix.join(rule.base, replacement.replace("*", matched)));
          if (target) return [{ target }];
        }
      }
      if (config.baseurl != null) {
        const target = firstsource(posix.join(config.baseurl, spec));
        if (target) return [{ target }];
      }
    }

    const packagename = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
    const workspace = workspaces.get(packagename);
    if (workspace) {
      const subpath = spec.slice(packagename.length + 1);
      const target = subpath
        ? firstsource(posix.join(workspace.dir, subpath)) || firstsource(posix.join(workspace.dir, "src", subpath))
        : workspace.entries.map(firstsource).find(Boolean);
      if (target) return [{ target }];
    }

    return [{ external: packagename }];
  }

  function pythonmodule(base) {
    for (const candidate of [`${base}.py`, `${base}/__init__.py`, `${base}.pyi`]) {
      if (issource(candidate)) return candidate;
    }
    return null;
  }

  function resolvepython(frompath, { source, names, kind }) {
    const dots = source.match(/^\.*/)[0].length;
    const rest = source.slice(dots).replace(/\./g, "/");

    let bases;
    if (dots > 0) {
      let dir = posix.dirname(frompath);
      for (let i = 1; i < dots; i++) dir = posix.dirname(dir);
      dir = dir === "." ? "" : dir;
      bases = [rest ? (dir ? `${dir}/${rest}` : rest) : dir];
    } else {
      bases = pyroots.map((r) => (r ? `${r}/${rest}` : rest));
    }

    const named = kind === "from" ? names.filter((n) => n !== "*") : [];
    for (const base of bases) {
      // from pkg import submodule  ->  edge to pkg/submodule.py when that file exists
      const outcomes = named
        .map((name) => ({ name, target: pythonmodule(base ? `${base}/${name}` : name) }))
        .filter((o) => o.target);
      // the package/module itself is needed unless every imported name was a submodule
      const module = base ? pythonmodule(base) : null;
      if (module && (named.length === 0 || outcomes.length < named.length)) outcomes.push({ target: module });
      if (outcomes.length) return outcomes;
    }

    if (dots > 0) return [{ unresolved: source }];
    return [{ external: source.split(".")[0] }];
  }

  function resolve(frompath, entry, language) {
    const key = `${language === "python" ? "py" : "js"}|${posix.dirname(frompath)}|${entry.source}|${entry.kind}|${entry.names?.join(",")}`;
    if (!cache.has(key)) {
      cache.set(key, language === "python" ? resolvepython(frompath, entry) : resolvejs(frompath, entry.source));
    }
    return cache.get(key);
  }

  /**
   * Where does a local name used in a call come from?
   * Returns { target, name } where name "*" means "the whole module".
   */
  function resolvebinding(frompath, binding, language) {
    if (language === "python") {
      const outcomes = resolvepython(frompath, { source: binding.source, names: [binding.imported], kind: "from" });
      const sub = outcomes.find((o) => o.name === binding.imported);
      if (sub) return { target: sub.target, name: "*" };
      const module = outcomes.find((o) => o.target);
      return module ? { target: module.target, name: binding.imported } : null;
    }
    const outcome = resolvejs(frompath, binding.source).find((o) => o.target);
    return outcome ? { target: outcome.target, name: binding.imported } : null;
  }

  return { resolve, resolvebinding };
}

// ── tsconfig / jsconfig ─────────────────────────────────────

/** Map of folder -> { baseurl, paths } for every tsconfig.json / jsconfig.json. */
function loadtsconfigs(root, files) {
  const configs = new Map();
  for (const file of files) {
    const name = posix.basename(file.path);
    if (name !== "tsconfig.json" && name !== "jsconfig.json") continue;
    const options = readcompileroptions(root, file.path, new Set());
    if (!options) continue;
    const dir = posix.dirname(file.path) === "." ? "" : posix.dirname(file.path);
    const existing = configs.get(dir);
    if (existing && name === "jsconfig.json") continue; // tsconfig wins in the same folder
    configs.set(dir, {
      baseurl: options.baseurl,
      paths: compilepaths(options.paths, options.pathsbase),
    });
  }
  return configs;
}

/** compilerOptions with "extends" followed (relative paths only), paths made repo-relative. */
function readcompileroptions(root, relpath, seen) {
  if (seen.has(relpath) || seen.size > 5) return null;
  seen.add(relpath);
  const json = readjsonc(path.join(root, relpath));
  if (!json) return null;

  const dir = posix.dirname(relpath) === "." ? "" : posix.dirname(relpath);
  let inherited = {};
  const parents = Array.isArray(json.extends) ? json.extends : json.extends ? [json.extends] : [];
  for (const parent of parents) {
    if (typeof parent !== "string" || !parent.startsWith(".")) continue;
    let parentpath = posix.join(dir, parent);
    if (!parentpath.endsWith(".json")) parentpath += ".json";
    inherited = { ...inherited, ...(readcompileroptions(root, parentpath, seen) || {}) };
  }

  const own = json.compilerOptions || {};
  const result = { ...inherited };
  if (typeof own.baseUrl === "string") result.baseurl = posix.join(dir, own.baseUrl);
  if (own.paths && typeof own.paths === "object") {
    result.paths = own.paths;
    // paths are relative to baseUrl when set, otherwise to the config declaring them
    result.pathsbase = typeof own.baseUrl === "string" ? posix.join(dir, own.baseUrl) : dir;
  }
  if (result.paths && result.pathsbase == null) result.pathsbase = result.baseurl ?? dir;
  return result;
}

/** "@/*": ["src/*"]  ->  matcher objects, longest prefix first (TypeScript's rule). */
function compilepaths(paths, base) {
  if (!paths) return [];
  return Object.entries(paths)
    .filter(([, targets]) => Array.isArray(targets))
    .map(([pattern, targets]) => {
      const star = pattern.indexOf("*");
      const prefix = star === -1 ? pattern : pattern.slice(0, star);
      const suffix = star === -1 ? "" : pattern.slice(star + 1);
      return {
        prefix,
        base: posix.normalize(base || "."),
        targets: targets.filter((t) => typeof t === "string"),
        match(spec) {
          if (star === -1) return spec === pattern ? "" : null;
          if (spec.startsWith(prefix) && spec.endsWith(suffix) && spec.length >= prefix.length + suffix.length) {
            return spec.slice(prefix.length, spec.length - suffix.length);
          }
          return null;
        },
      };
    })
    .sort((a, b) => b.prefix.length - a.prefix.length);
}

/** JSON with comments and trailing commas, as tsconfig allows. null if unreadable. */
export function readjsonc(abspath) {
  let text;
  try {
    text = fs.readFileSync(abspath, "utf8");
  } catch {
    return null;
  }
  let out = "";
  let instring = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (instring) {
      out += ch;
      if (ch === "\\") out += text[++i] ?? "";
      else if (ch === '"') instring = false;
    } else if (ch === '"') {
      instring = true;
      out += ch;
    } else if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++;
    } else {
      out += ch;
    }
  }
  try {
    return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
  } catch {
    return null;
  }
}

// ── Monorepo workspace packages ─────────────────────────────

/** Map of package name -> { dir, entries } for every package.json below the root. */
function loadworkspaces(root, files) {
  const packages = new Map();
  for (const file of files) {
    if (posix.basename(file.path) !== "package.json" || file.path === "package.json") continue;
    const json = readjsonc(path.join(root, file.path));
    if (!json || typeof json.name !== "string") continue;
    const dir = posix.dirname(file.path);
    const entries = [json.source, json.module, json.main, "src/index", "index"]
      .filter((e) => typeof e === "string")
      .map((e) => posix.join(dir, e));
    packages.set(json.name, { dir, entries });
  }
  return packages;
}

// ── Python ──────────────────────────────────────────────────

/** Folders that absolute imports can start from: the root, src/, and project folders. */
function pythonroots(allpaths) {
  const roots = new Set([""]);
  for (const p of allpaths) {
    if (p.startsWith("src/")) roots.add("src");
    const name = posix.basename(p);
    if (name === "setup.py" || name === "pyproject.toml" || name === "setup.cfg") {
      const dir = posix.dirname(p);
      if (dir !== ".") {
        roots.add(dir);
        roots.add(`${dir}/src`);
      }
    }
  }
  return [...roots];
}
