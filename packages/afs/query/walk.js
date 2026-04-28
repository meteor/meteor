import { UnsupportedOperatorError } from './errors';

/**
 * Dispatch a SelectorAST node to its visitor handler.
 *
 * Visitor handlers are responsible for recursing into child nodes; the
 * walker does not auto-descend. This keeps adapter control flow explicit
 * — an adapter that emits `(child1 AND child2)` chooses how to combine
 * its children's results.
 *
 * Missing handlers throw `UnsupportedOperatorError` with the node type.
 */
export function walkSelector(node, visitor, ctx) {
  const handler = visitor[node.type];
  if (!handler) {
    throw new UnsupportedOperatorError(
      `Selector node-type '${node.type}' has no visitor handler`,
      { nodeType: node.type, adapterName: visitor.__adapterName__ }
    );
  }
  return handler(node, ctx, visitor);
}

/**
 * Dispatch a ModifierAST's ops through their visitor handlers.
 *
 * Returns an array of handler results, one per op (in declaration order).
 * Replacement-doc programs are routed through visitor.__replacement__ if
 * defined; otherwise the caller must check `ast.isReplacement` before
 * invoking walkModifier.
 */
export function walkModifier(ast, visitor, ctx) {
  if (ast.isReplacement) {
    if (visitor.__replacement__) return visitor.__replacement__(ast.replacement, ctx);
    throw new UnsupportedOperatorError(
      'ModifierAST is a replacement doc and visitor has no __replacement__ handler',
      { nodeType: 'ReplacementDoc', adapterName: visitor.__adapterName__ }
    );
  }
  return ast.ops.map((op) => {
    const handler = visitor[op.kind];
    if (!handler) {
      throw new UnsupportedOperatorError(
        `ModOp kind '${op.kind}' has no visitor handler`,
        { nodeType: op.kind, adapterName: visitor.__adapterName__ }
      );
    }
    return handler(op, ctx, visitor);
  });
}
