import Visitor from "./visitor.js";

// This RegExp will be used to scan the source for calls to meteorInstall,
// taking into consideration that the function name may have been mangled
// to something other than "meteorInstall" by the minifier.
const meteorInstallRegExp = new RegExp([
  // If meteorInstall is called by its unminified name, then that's what
  // we should be looking for in the AST.
  /\b(meteorInstall)\(\{/,
  // If the meteorInstall function name has been minified, we can figure
  // out its mangled name by examining the import assingment.
  /\b(\w+)=Package.modules.meteorInstall\b/,
  /\b(\w+)=Package\["modules-runtime"\].meteorInstall\b/,
].map(exp => exp.source).join("|"));

export function extractModuleSizesTree(source) {
  const match = meteorInstallRegExp.exec(source);
  if (match) {
    const ast = Babel.parse(source);
    const name = match[1] || match[2] || match[3];
    meteorInstallVisitor.visit(ast, name, source);
    return meteorInstallVisitor.tree;
  }
}

const meteorInstallVisitor = new (class extends Visitor {
  reset(root, meteorInstallName, source) {
    this.name = meteorInstallName;
    this.source = source;
    this.tree = null;
  }

  visitCallExpression(node) {
    if (this.tree !== null) {
      return;
    }

    if (isIdWithName(node.callee, this.name)) {
      const source = this.source;

      function walk(expr) {
        if (expr.type !== "ObjectExpression") {
          return Buffer.byteLength(source.slice(expr.start, expr.end));
        }

        const contents = Object.create(null);

        expr.properties.forEach(prop => {
          const keyName = getKeyName(prop.key);
          if (typeof keyName === "string") {
            contents[keyName] = walk(prop.value);
          }
        });

        return contents;
      }

      this.tree = walk(node.arguments[0]);

    } else {
      this.visitChildren(node);
    }
  }
});

function isIdWithName(node, name) {
  return node &&
    node.type === "Identifier" &&
    node.name === name;
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