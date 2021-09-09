import Visitor from "reify/lib/visitor.js";
import { findPossibleIndexes } from "reify/lib/utils.js";

// This RegExp will be used to scan the source for calls to meteorInstall,
// taking into consideration that the function name may have been mangled
// to something other than "meteorInstall" by the minifier.
const meteorInstallRegExp = new RegExp([
  // If meteorInstall is called by its unminified name, then that's what
  // we should be looking for in the AST.
  /\b(meteorInstall)\(\{/,
  // If the meteorInstall function name has been minified, we can figure
  // out its mangled name by examining the import assingment.
  /\b(\w+)=Package\.modules\.meteorInstall\b/,
  /\b(\w+)=Package\["modules-runtime"\].meteorInstall\b/,
  // Sometimes uglify-es will inline (0,Package.modules.meteorInstall) as
  // a call expression.
  /\(0,Package\.modules\.(meteorInstall)\)\(/,
  /\(0,Package\["modules-runtime"\]\.(meteorInstall)\)\(/,
].map(exp => exp.source).join("|"));

export function extractModuleSizesTree(source) {
  const match = meteorInstallRegExp.exec(source);
  if (match) {
    const ast = Babel.parse(source);
    let meteorInstallName = "meteorInstall";
    // The minifier may have renamed meteorInstall to something shorter.
    match.some((name, i) => (i > 0 && (meteorInstallName = name)));
    meteorInstallVisitor.visit(ast, meteorInstallName, source);
    return meteorInstallVisitor.tree;
  }
}

const meteorInstallVisitor = new (class extends Visitor {
  reset(root, meteorInstallName, source) {
    this.name = meteorInstallName;
    this.source = source;
    this.tree = Object.create(null);
    // Optimization to abandon entire subtrees of the AST that contain
    // nothing like the meteorInstall identifier we're looking for.
    this.possibleIndexes = findPossibleIndexes(source, [
      meteorInstallName,
    ]);
  }

  visitCallExpression(path) {
    const node = path.getValue();

    if (hasIdWithName(node.callee, this.name)) {
      const source = this.source;

      function walk(tree, expr) {
        if (expr.type !== "ObjectExpression") {
          return Buffer.byteLength(source.slice(expr.start, expr.end));
        }

        tree = tree || Object.create(null);

        expr.properties.forEach(prop => {
          const keyName = getKeyName(prop.key);
          if (typeof keyName === "string") {
            tree[keyName] = walk(tree[keyName], prop.value);
          }
        });

        return tree;
      }

      walk(this.tree, node.arguments[0]);

    } else {
      this.visitChildren(path);
    }
  }
});

function hasIdWithName(node, name) {
  switch (node && node.type) {
  case "SequenceExpression":
    const last = node.expressions[node.expressions.length - 1];
    return hasIdWithName(last, name);
  case "MemberExpression":
    return hasIdWithName(node.property, name);
  case "Identifier":
    return node.name === name;
  default:
    return false;
  }
}

function getKeyName(key) {
  if (key.type === "Identifier") {
    return key.name;
  }

  if (key.type === "StringLiteral" ||
      key.type === "Literal") {
    return key.value;
  }

  return null;
}