/**
 * Depth-first walk over a Tree-sitter tree with a cursor (no recursion, so
 * deeply nested files cannot overflow the stack, and no node object is
 * allocated unless a visitor asks for one).
 *
 * visitor.enter(cursor)  every node, on the way down
 * visitor.leaf(cursor)   nodes without children (tokens)
 * visitor.exit(cursor)   every node except the root, on the way up
 */
export function traverse(tree, visitor) {
  const cursor = tree.walk();
  try {
    for (;;) {
      visitor.enter?.(cursor);
      if (cursor.gotoFirstChild()) continue;

      visitor.leaf?.(cursor);
      visitor.exit?.(cursor);
      while (!cursor.gotoNextSibling()) {
        if (!cursor.gotoParent()) return;
        visitor.exit?.(cursor);
      }
    }
  } finally {
    cursor.delete?.();
  }
}

/** Text of a string literal without its quotes, or null if it is not a plain string. */
export function stringvalue(node) {
  if (!node) return null;
  if (node.type === "string") {
    // JS: (string (string_fragment)); Python: (string (string_start) (string_content) (string_end))
    for (const child of node.namedChildren) {
      if (child.type === "string_fragment" || child.type === "string_content") return child.text;
    }
    return "";
  }
  if (node.type === "template_string" && !node.namedChildren.some((c) => c.type === "template_substitution")) {
    return node.text.slice(1, -1);
  }
  return null;
}

export const lineof = (node) => node.startPosition.row + 1;
