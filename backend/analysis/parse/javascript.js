import { traverse, stringvalue, lineof } from "./traverse.js";

// Each adds one independent path through the code (McCabe cyclomatic complexity).
const DECISIONS = new Set([
  "if_statement", "for_statement", "for_in_statement", "while_statement", "do_statement",
  "switch_case", "catch_clause", "ternary_expression",
]);
const LOGICAL_OPERATORS = new Set(["&&", "||", "??"]);

const FUNCTIONS = new Set([
  "function_declaration", "generator_function_declaration", "function_expression",
  "generator_function", "arrow_function", "method_definition",
]);
const CLASSES = new Set(["class_declaration", "class", "abstract_class_declaration"]);

const MAX_CALLS_PER_FUNCTION = 300;

/**
 * Extract the structure of one JavaScript / TypeScript file.
 *
 * imports:   [{ source, kind, line, names, typeonly }]
 *            kind: "import" | "require" | "dynamic" | "reexport"
 *            names: imported names, "default" for default imports, "*" for namespaces
 * bindings:  { localName: { source, imported } } for resolving calls to other files
 * exports:   names this file exports ("default" included), plus defaultname
 * functions: [{ name, line, endline, complexity, tokens, calls }]
 *            calls: "name" or "object.property" strings, as written
 * toplevel:  complexity and calls outside any function
 */
export function extractjavascript(tree) {
  const imports = [];
  const bindings = Object.create(null);
  const exports = new Set();
  let defaultname = null;

  const toplevel = { name: "<top-level>", complexity: 0, calls: new Set() };
  const functions = [];
  const fnstack = [];
  const classstack = [];
  let complexity = 1;
  let tokens = 0;

  const current = () => fnstack[fnstack.length - 1] || toplevel;

  const addimport = (source, kind, node, names = [], typeonly = false) => {
    if (source == null) return;
    imports.push({ source, kind, line: lineof(node), names, typeonly });
  };

  traverse(tree, {
    enter(cursor) {
      const type = cursor.nodeType;

      if (DECISIONS.has(type)) {
        complexity++;
        current().complexity++;
      } else if (type === "binary_expression") {
        const operator = cursor.currentNode.childForFieldName("operator")?.type;
        if (LOGICAL_OPERATORS.has(operator)) {
          complexity++;
          current().complexity++;
        }
      } else if (FUNCTIONS.has(type)) {
        const node = cursor.currentNode;
        const fn = {
          name: functionname(node, classstack),
          line: lineof(node),
          endline: node.endPosition.row + 1,
          complexity: 1,
          tokens: 0,
          calls: new Set(),
        };
        functions.push(fn);
        fnstack.push(fn);
      } else if (CLASSES.has(type)) {
        classstack.push(cursor.currentNode.childForFieldName("name")?.text || "<class>");
      } else if (type === "call_expression" || type === "new_expression") {
        handlecall(cursor.currentNode);
      } else if (type === "import_statement") {
        handleimport(cursor.currentNode);
      } else if (type === "export_statement") {
        handleexport(cursor.currentNode);
      } else if (type === "assignment_expression") {
        handlecommonjsexport(cursor.currentNode);
      }
    },

    leaf(cursor) {
      const type = cursor.nodeType;
      if (type === "comment" || type === "html_comment") return;
      tokens++;
      for (const fn of fnstack) fn.tokens++;
    },

    exit(cursor) {
      const type = cursor.nodeType;
      if (FUNCTIONS.has(type)) fnstack.pop();
      else if (CLASSES.has(type)) classstack.pop();
    },
  });

  function handlecall(node) {
    const callee = node.childForFieldName(node.type === "new_expression" ? "constructor" : "function");
    if (!callee) return;
    const args = node.childForFieldName("arguments");

    // import("./x") and require("./x")
    if (callee.type === "import") {
      return addimport(stringvalue(args?.namedChild(0)), "dynamic", node, ["*"]);
    }
    if (callee.type === "identifier" && callee.text === "require" && args?.namedChildCount === 1) {
      const source = stringvalue(args.namedChild(0));
      if (source != null) {
        const names = requirebindings(node, source);
        return addimport(source, "require", node, names);
      }
    }

    const fn = current();
    if (fn.calls.size >= MAX_CALLS_PER_FUNCTION) return;
    if (callee.type === "identifier") {
      fn.calls.add(callee.text);
    } else if (callee.type === "member_expression") {
      const object = callee.childForFieldName("object");
      const property = callee.childForFieldName("property");
      if (property && (object?.type === "identifier" || object?.type === "this")) {
        fn.calls.add(`${object.text}.${property.text}`);
      } else if (property) {
        fn.calls.add(`?.${property.text}`);
      }
    }
  }

  // const x = require("./y")            -> x is the whole module
  // const { a, b: c } = require("./y")  -> a and c are named exports
  function requirebindings(callnode, source) {
    const declarator = callnode.parent;
    if (declarator?.type !== "variable_declarator") return ["*"];
    const pattern = declarator.childForFieldName("name");
    if (pattern?.type === "identifier") {
      bindings[pattern.text] = { source, imported: "*" };
      return ["*"];
    }
    const names = [];
    if (pattern?.type === "object_pattern") {
      for (const prop of pattern.namedChildren) {
        if (prop.type === "shorthand_property_identifier_pattern") {
          bindings[prop.text] = { source, imported: prop.text };
          names.push(prop.text);
        } else if (prop.type === "pair_pattern") {
          const key = prop.childForFieldName("key")?.text;
          const value = prop.childForFieldName("value");
          if (key && value?.type === "identifier") {
            bindings[value.text] = { source, imported: key };
            names.push(key);
          }
        }
      }
    }
    return names.length ? names : ["*"];
  }

  function handleimport(node) {
    const typeonly = node.children.some((c) => c.type === "type");

    // TypeScript: import x = require("./y")
    const requireclause = node.namedChildren.find((c) => c.type === "import_require_clause");
    if (requireclause) {
      const source = stringvalue(requireclause.childForFieldName("source"));
      const local = requireclause.namedChildren.find((c) => c.type === "identifier")?.text;
      if (local && source != null) bindings[local] = { source, imported: "*" };
      return addimport(source, "import", node, ["*"], typeonly);
    }

    const source = stringvalue(node.childForFieldName("source"));
    if (source == null) return;
    const names = [];
    const clause = node.namedChildren.find((c) => c.type === "import_clause");

    for (const part of clause?.namedChildren || []) {
      if (part.type === "identifier") {
        names.push("default");
        bindings[part.text] = { source, imported: "default" };
      } else if (part.type === "namespace_import") {
        const local = part.namedChildren.find((c) => c.type === "identifier")?.text;
        names.push("*");
        if (local) bindings[local] = { source, imported: "*" };
      } else if (part.type === "named_imports") {
        for (const spec of part.namedChildren) {
          if (spec.type !== "import_specifier") continue;
          const imported = spec.childForFieldName("name")?.text;
          const local = spec.childForFieldName("alias")?.text || imported;
          if (!imported) continue;
          names.push(imported);
          bindings[local] = { source, imported };
        }
      }
    }
    // import "./side-effect" has no clause but is still a dependency
    addimport(source, "import", node, names, typeonly);
  }

  function handleexport(node) {
    const source = stringvalue(node.childForFieldName("source"));
    const declaration = node.childForFieldName("declaration");
    const isdefault = node.children.some((c) => c.type === "default");
    const clause = node.namedChildren.find((c) => c.type === "export_clause");

    if (source != null) {
      // export { a as b } from "./x"   or   export * from "./x"
      const names = [];
      for (const spec of clause?.namedChildren || []) {
        if (spec.type !== "export_specifier") continue;
        const name = spec.childForFieldName("name")?.text;
        if (name) names.push(name);
        exports.add(spec.childForFieldName("alias")?.text || name);
      }
      const typeonly = node.children.some((c) => c.type === "type");
      return addimport(source, "reexport", node, names.length ? names : ["*"], typeonly);
    }

    if (isdefault) {
      exports.add("default");
      const target = declaration || node.namedChildren.find((c) => c.type !== "comment");
      defaultname = target?.childForFieldName?.("name")?.text || (target?.type === "identifier" ? target.text : null);
      return;
    }

    if (declaration) {
      const name = declaration.childForFieldName("name");
      if (name) exports.add(name.text);
      // export const a = 1, b = () => {}
      for (const child of declaration.namedChildren) {
        if (child.type === "variable_declarator") {
          const id = child.childForFieldName("name");
          if (id?.type === "identifier") exports.add(id.text);
        }
      }
    }
    for (const spec of clause?.namedChildren || []) {
      if (spec.type !== "export_specifier") continue;
      exports.add(spec.childForFieldName("alias")?.text || spec.childForFieldName("name")?.text);
    }
  }

  // module.exports = { a, b } | module.exports = x | exports.a = ... | module.exports.a = ...
  function handlecommonjsexport(node) {
    const left = node.childForFieldName("left");
    if (left?.type !== "member_expression") return;
    const object = left.childForFieldName("object");
    const property = left.childForFieldName("property")?.text;
    const right = node.childForFieldName("right");

    if (object?.text === "module" && property === "exports") {
      if (right?.type === "object") {
        for (const prop of right.namedChildren) {
          if (prop.type === "shorthand_property_identifier") exports.add(prop.text);
          else if (prop.type === "pair" || prop.type === "method_definition") {
            const key = (prop.childForFieldName("key") || prop.childForFieldName("name"))?.text;
            if (key) exports.add(key);
          }
        }
      } else {
        exports.add("default");
        if (right?.type === "identifier") defaultname = right.text;
        else defaultname = right?.childForFieldName?.("name")?.text || defaultname;
      }
    } else if (object?.text === "exports" || object?.text === "module.exports") {
      if (property) exports.add(property);
    }
  }

  return {
    imports,
    bindings,
    exports: [...exports].filter(Boolean).sort(),
    defaultname,
    complexity,
    tokens,
    functions: functions.map(finishfunction),
    toplevel: { complexity: toplevel.complexity, calls: [...toplevel.calls] },
  };
}

function finishfunction(fn) {
  return { ...fn, calls: [...fn.calls] };
}

/** Best human name for a function node, following how it is used. */
function functionname(node, classstack) {
  const cls = classstack[classstack.length - 1];
  const own = node.childForFieldName("name")?.text;

  if (node.type === "method_definition") return cls ? `${cls}.${own}` : own;
  if (own) return own;

  const parent = node.parent;
  switch (parent?.type) {
    case "variable_declarator":
      return parent.childForFieldName("name")?.text || "<anonymous>";
    case "assignment_expression":
      return parent.childForFieldName("left")?.text || "<anonymous>";
    case "pair":
      return parent.childForFieldName("key")?.text || "<anonymous>";
    case "public_field_definition":
    case "field_definition": {
      const prop = (parent.childForFieldName("name") || parent.childForFieldName("property"))?.text;
      return cls && prop ? `${cls}.${prop}` : prop || "<anonymous>";
    }
    case "export_statement":
      return "default";
    case "arguments": {
      // router.post("/", async (req, res) => {...})  ->  "router.post callback"
      const callee = parent.parent?.childForFieldName("function")?.text;
      return callee && callee.length <= 60 ? `${callee} callback` : "<callback>";
    }
    default:
      return "<anonymous>";
  }
}
