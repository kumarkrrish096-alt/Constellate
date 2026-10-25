import { traverse, stringvalue, lineof } from "./traverse.js";

const DECISIONS = new Set([
  "if_statement", "elif_clause", "for_statement", "while_statement", "except_clause",
  "conditional_expression", "boolean_operator", "for_in_clause", "if_clause", "case_clause",
]);

const MAX_CALLS_PER_FUNCTION = 300;

/**
 * Extract the structure of one Python file. Same shape as extractjavascript().
 * Import sources keep Python's notation: "os", "a.b", ".sibling", "..pkg.mod".
 */
export function extractpython(tree) {
  const imports = [];
  const bindings = Object.create(null);
  const toplevelnames = new Set();
  let dunderall = null;

  const toplevel = { name: "<top-level>", complexity: 0, calls: new Set() };
  const functions = [];
  const fnstack = [];
  const classstack = [];
  let complexity = 1;
  let tokens = 0;

  const current = () => fnstack[fnstack.length - 1] || toplevel;
  const attoplevel = () => fnstack.length === 0 && classstack.length === 0;

  traverse(tree, {
    enter(cursor) {
      const type = cursor.nodeType;

      if (DECISIONS.has(type)) {
        complexity++;
        current().complexity++;
      } else if (type === "function_definition") {
        const node = cursor.currentNode;
        const own = node.childForFieldName("name")?.text || "<anonymous>";
        const cls = classstack[classstack.length - 1];
        if (attoplevel()) toplevelnames.add(own);
        const fn = {
          name: cls && fnstack.length === 0 ? `${cls}.${own}` : own,
          line: lineof(node),
          endline: node.endPosition.row + 1,
          complexity: 1,
          tokens: 0,
          calls: new Set(),
        };
        functions.push(fn);
        fnstack.push(fn);
      } else if (type === "class_definition") {
        const name = cursor.currentNode.childForFieldName("name")?.text || "<class>";
        if (attoplevel()) toplevelnames.add(name);
        classstack.push(name);
      } else if (type === "call") {
        handlecall(cursor.currentNode);
      } else if (type === "import_statement") {
        handleimport(cursor.currentNode);
      } else if (type === "import_from_statement") {
        handlefromimport(cursor.currentNode);
      } else if (type === "assignment" && attoplevel()) {
        handletoplevelassignment(cursor.currentNode);
      }
    },

    leaf(cursor) {
      if (cursor.nodeType === "comment") return;
      tokens++;
      for (const fn of fnstack) fn.tokens++;
    },

    exit(cursor) {
      const type = cursor.nodeType;
      if (type === "function_definition") fnstack.pop();
      else if (type === "class_definition") classstack.pop();
    },
  });

  function handlecall(node) {
    const callee = node.childForFieldName("function");
    const fn = current();
    if (!callee || fn.calls.size >= MAX_CALLS_PER_FUNCTION) return;
    if (callee.type === "identifier") {
      fn.calls.add(callee.text);
    } else if (callee.type === "attribute") {
      const object = callee.childForFieldName("object");
      const attribute = callee.childForFieldName("attribute")?.text;
      if (!attribute) return;
      fn.calls.add(object?.type === "identifier" ? `${object.text}.${attribute}` : `?.${attribute}`);
    }
  }

  // import a.b.c        -> binds "a" (to module a)
  // import a.b as ab    -> binds "ab" (to module a.b)
  function handleimport(node) {
    for (const name of node.childrenForFieldName("name")) {
      if (name.type === "aliased_import") {
        const module = name.childForFieldName("name")?.text;
        const alias = name.childForFieldName("alias")?.text;
        if (!module) continue;
        if (alias) bindings[alias] = { source: module, imported: "*" };
        imports.push({ source: module, kind: "import", line: lineof(node), names: ["*"], typeonly: false });
      } else {
        const module = name.text;
        bindings[module.split(".")[0]] = { source: module.split(".")[0], imported: "*" };
        imports.push({ source: module, kind: "import", line: lineof(node), names: ["*"], typeonly: false });
      }
    }
  }

  // from .x import y as z, w   |   from m import *
  function handlefromimport(node) {
    const module = node.childForFieldName("module_name")?.text;
    if (module == null) return;
    const names = [];
    if (node.namedChildren.some((c) => c.type === "wildcard_import")) {
      names.push("*");
    }
    for (const name of node.childrenForFieldName("name")) {
      const imported = (name.type === "aliased_import" ? name.childForFieldName("name") : name)?.text;
      const local = (name.type === "aliased_import" ? name.childForFieldName("alias")?.text : null) || imported;
      if (!imported) continue;
      names.push(imported);
      bindings[local] = { source: module, imported };
    }
    imports.push({ source: module, kind: "from", line: lineof(node), names, typeonly: false });
  }

  function handletoplevelassignment(node) {
    const left = node.childForFieldName("left");
    if (left?.type !== "identifier") return;
    if (left.text === "__all__") {
      const right = node.childForFieldName("right");
      if (right?.type === "list" || right?.type === "tuple") {
        dunderall = right.namedChildren.map(stringvalue).filter(Boolean);
      }
    } else {
      toplevelnames.add(left.text);
    }
  }

  const exports = dunderall || [...toplevelnames].filter((name) => !name.startsWith("_"));

  return {
    imports,
    bindings,
    exports: [...new Set(exports)].sort(),
    defaultname: null,
    complexity,
    tokens,
    functions: functions.map((fn) => ({ ...fn, calls: [...fn.calls] })),
    toplevel: { complexity: toplevel.complexity, calls: [...toplevel.calls] },
  };
}
