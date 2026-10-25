/**
 * Function-level call graph.
 *
 * functions: flat list [{ file, name, line, endline, complexity, tokens }];
 *            a file's top-level code appears as "<top-level>" when it calls something.
 * byfile:    Map path -> [indexes into functions]
 * edges:     [[caller, callee]] as indexes into functions
 * stats:     { calls, resolved } so the snapshot states how much was matched
 *
 * Matching is by name, following imports (static analysis has no runtime types):
 *   foo()          a function named foo in the same file, else where foo was imported from
 *   mod.foo()      foo inside the module imported as mod
 *   Thing.foo()    method Thing.foo in the file Thing was imported from (or this file)
 *   this.foo()     a method named foo in the same file
 * Anything else (library code, methods on runtime values) stays unresolved.
 */
export function buildcallgraph(parsed, resolver, { maxedges = 50000 } = {}) {
  const functions = [];
  const byfile = new Map();
  const lookup = new Map(); // path -> { byname: Map, bymethod: Map, file }

  for (const file of parsed) {
    const indexes = [];
    const byname = new Map();
    const bymethod = new Map();

    const add = (fn, calls) => {
      const id = functions.length;
      functions.push({
        file: file.path,
        name: fn.name,
        line: fn.line,
        endline: fn.endline,
        complexity: fn.complexity,
        tokens: fn.tokens,
        calls,
      });
      indexes.push(id);
      if (!byname.has(fn.name)) byname.set(fn.name, id);
      const dot = fn.name.lastIndexOf(".");
      if (dot > 0) {
        const method = fn.name.slice(dot + 1);
        if (!bymethod.has(method)) bymethod.set(method, id);
      }
      return id;
    };

    for (const fn of file.functions || []) add(fn, fn.calls);
    if (file.toplevel?.calls?.length) {
      add({ name: "<top-level>", line: 1, endline: file.lines, complexity: file.toplevel.complexity + 1, tokens: 0 }, file.toplevel.calls);
    }

    byfile.set(file.path, indexes);
    lookup.set(file.path, { byname, bymethod, file });
  }

  // name exported as "default" -> the function it refers to
  const defaultfunction = (target) => {
    const entry = lookup.get(target);
    if (!entry) return undefined;
    return entry.byname.get(entry.file.defaultname) ?? entry.byname.get("default");
  };

  const findin = (target, name) => {
    const entry = lookup.get(target);
    if (!entry) return undefined;
    return name === "default" ? defaultfunction(target) : entry.byname.get(name);
  };

  const edgeset = new Set();
  const edges = [];
  let calls = 0;
  let resolved = 0;

  for (let caller = 0; caller < functions.length; caller++) {
    const fn = functions[caller];
    const { byname, bymethod, file } = lookup.get(fn.file);
    // own properties only: a call to toString() must not find Object.prototype.toString
    const bindings = file.bindings || {};
    const bindingof = (name) => (Object.hasOwn(bindings, name) ? bindings[name] : undefined);

    for (const call of fn.calls) {
      calls++;
      let callee;
      const dot = call.indexOf(".");

      if (dot === -1) {
        callee = byname.get(call);
        if (callee === undefined && bindingof(call)) {
          const origin = resolver.resolvebinding(fn.file, bindingof(call), file.language);
          if (origin && origin.name !== "*") callee = findin(origin.target, origin.name);
        }
      } else {
        const object = call.slice(0, dot);
        const property = call.slice(dot + 1);
        if (object === "this" || object === "self") {
          callee = bymethod.get(property);
        } else if (object !== "?") {
          if (bindingof(object)) {
            const origin = resolver.resolvebinding(fn.file, bindingof(object), file.language);
            if (origin?.name === "*") callee = findin(origin.target, property);
            else if (origin) {
              const classname = origin.name === "default" ? lookup.get(origin.target)?.file.defaultname : origin.name;
              if (classname) callee = findin(origin.target, `${classname}.${property}`);
            }
          } else {
            callee = byname.get(`${object}.${property}`);
          }
        }
      }

      if (callee === undefined || callee === caller) continue;
      resolved++;
      const key = caller * 1e7 + callee;
      if (!edgeset.has(key) && edges.length < maxedges) {
        edgeset.add(key);
        edges.push([caller, callee]);
      }
    }
  }

  for (const fn of functions) delete fn.calls;
  return { functions, byfile, edges, stats: { calls, resolved, truncated: edges.length >= maxedges } };
}
