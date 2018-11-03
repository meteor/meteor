import { parse } from 'meteor-babel';
import { analyze as analyzeScope } from 'escope';
import LRU from "lru-cache";

import Visitor from "reify/lib/visitor.js";
import { findPossibleIndexes } from "reify/lib/utils.js";

const hasOwn = Object.prototype.hasOwnProperty;
const objToStr = Object.prototype.toString

function isRegExp(value) {
  return value && objToStr.call(value) === "[object RegExp]";
}

var AST_CACHE = new LRU({
  max: Math.pow(2, 12),
  length(ast) {
    return ast.loc.end.line;
  }
});

// Like babel.parse, but annotates any thrown error with $ParseError = true.
function tryToParse(source, hash) {
  if (hash && AST_CACHE.has(hash)) {
    return AST_CACHE.get(hash);
  }

  let ast;

  try {
    ast = parse(source);
  } catch (e) {
    if (typeof e.loc === 'object') {
      e.$ParseError = true;
    }
    throw e;
  }

  if (hash) {
    AST_CACHE.set(hash, ast);
  }

  return ast;
}

/**
 * The `findImportedModuleIdentifiers` function takes a string of module
 * source code and returns a map from imported module identifiers to AST
 * nodes. The keys of this map are used in ./import-scanner.js to traverse
 * the module dependency graph. The AST nodes are generally ignored.
 *
 * The implementation uses a regular expression to scan quickly for
 * possible locations of certain tokens (`require`, `import`, `export`),
 * then uses that location information to steer the AST traversal, so that
 * it visits only subtrees that contain interesting tokens, saving a lot
 * of time by ignoring the rest of the AST. The AST traversal determines
 * if the tokens were actually what we thought they were (a `require`
 * function call, or an `import` or `export` statement).
 */
export function findImportedModuleIdentifiers(source, hash) {
  const possibleIndexes = findPossibleIndexes(source, [
    "require",
    "import",
    "export",
    "dynamicImport",
    "link",
  ]);

  if (possibleIndexes.length === 0) {
    return {};
  }

  const ast = tryToParse(source, hash);
  importedIdentifierVisitor.visit(ast, source, possibleIndexes);
  return importedIdentifierVisitor.identifiers;
}

const importedIdentifierVisitor = new (class extends Visitor {
  reset(rootPath, code, possibleIndexes) {
    this.requireIsBound = false;
    this.identifiers = Object.create(null);

    // Defining this.possibleIndexes causes the Visitor to ignore any
    // subtrees of the AST that do not contain any indexes of identifiers
    // that we care about. Note that findPossibleIndexes uses a RegExp to
    // scan for the given identifiers, so there may be false positives,
    // but that's fine because it just means scanning more of the AST.
    this.possibleIndexes = possibleIndexes;
  }

  addIdentifier(id, type, dynamic) {
    const entry = hasOwn.call(this.identifiers, id)
      ? this.identifiers[id]
      : this.identifiers[id] = {
          possiblySpurious: true,
          dynamic: !! dynamic
        };

    if (! dynamic) {
      entry.dynamic = false;
    }

    if (type === "require") {
      // If the identifier comes from a require call, but require is not a
      // free variable, then this dependency might be spurious.
      entry.possiblySpurious =
        entry.possiblySpurious && this.requireIsBound;
    } else {
      // The import keyword can't be shadowed, so any dependencies
      // registered by import statements should be trusted absolutely.
      entry.possiblySpurious = false;
    }
  }

  visitFunctionExpression(path) {
    return this._functionParamRequireHelper(path);
  }

  visitFunctionDeclaration(path) {
    return this._functionParamRequireHelper(path);
  }

  visitArrowFunctionExpression(path) {
    return this._functionParamRequireHelper(path);
  }

  _functionParamRequireHelper(path) {
    const node = path.getValue();
    if (node.params.some(param => isIdWithName(param, "require"))) {
      const { requireIsBound } = this;
      this.requireIsBound = true;
      this.visitChildren(path);
      this.requireIsBound = requireIsBound;
    } else {
      this.visitChildren(path);
    }
  }

  visitCallExpression(path) {
    const node = path.getValue();
    const args = node.arguments;
    const argc = args.length;
    const firstArg = args[0];

    this.visitChildren(path);

    if (! isStringLiteral(firstArg)) {
      return;
    }

    if (isIdWithName(node.callee, "require")) {
      this.addIdentifier(firstArg.value, "require");

    } else if (node.callee.type === "Import" ||
               isIdWithName(node.callee, "import")) {
      this.addIdentifier(firstArg.value, "import", true);

    } else if (node.callee.type === "MemberExpression" &&
               // The Reify compiler sometimes renames references to the
               // CommonJS module object for hygienic purposes, but it
               // always does so by appending additional numbers.
               isIdWithName(node.callee.object, /^module\d*$/)) {
      const propertyName =
        isPropertyWithName(node.callee.property, "link") ||
        isPropertyWithName(node.callee.property, "dynamicImport");

      if (propertyName) {
        this.addIdentifier(
          firstArg.value,
          "import",
          propertyName === "dynamicImport"
        );
      }
    }
  }

  visitImportDeclaration(path) {
    return this._importExportSourceHelper(path);
  }

  visitExportAllDeclaration(path) {
    return this._importExportSourceHelper(path);
  }

  visitExportNamedDeclaration(path) {
    return this._importExportSourceHelper(path);
  }

  _importExportSourceHelper(path) {
    const node = path.getValue();
    // The .source of an ImportDeclaration or Export{Named,All}Declaration
    // is always a string-valued Literal node, if not null.
    if (isStringLiteral(node.source)) {
      this.addIdentifier(
        node.source.value,
        "import",
        false
      );
    }
  }
});

function isIdWithName(node, name) {
  if (! node ||
      node.type !== "Identifier") {
    return false;
  }

  if (typeof name === "string") {
    return node.name === name;
  }

  if (isRegExp(name)) {
    return name.test(node.name);
  }

  return false;
}

function isStringLiteral(node) {
  return node && (
    node.type === "StringLiteral" ||
    (node.type === "Literal" &&
     typeof node.value === "string"));
}

function isPropertyWithName(node, name) {
  if (isIdWithName(node, name) ||
      (isStringLiteral(node) &&
       node.value === name)) {
    return name;
  }
}

// Analyze the JavaScript source code `source` and return a dictionary of all
// globals which are assigned to in the package. The values in the dictionary
// are all `true`.
//
// This is intended for use in detecting package-scope variables in Meteor
// packages, where the linker needs to add a "var" statement to prevent them
// from staying as globals.
//
// It only cares about assignments to variables; an assignment to a field on an
// object (`Foo.Bar = true`) neither causes `Foo` nor `Foo.Bar` to be returned.
const globalsCache = new LRU({
  max: Math.pow(2, 12),
  length(globals) {
    let sum = 0;
    Object.keys(globals).forEach(name => sum += name.length);
    return sum;
  }
});

export function findAssignedGlobals(source, hash) {
  if (hash && globalsCache.has(hash)) {
    return globalsCache.get(hash);
  }

  const ast = tryToParse(source, hash);

  // We have to pass ignoreEval; otherwise, the existence of a direct eval call
  // causes escope to not bother to resolve references in the eval's scope.
  // This is because an eval can pull references inward:
  //
  //   function outer() {
  //     var i = 42;
  //     function inner() {
  //       eval('var i = 0');
  //       i;  // 0, not 42
  //     }
  //   }
  //
  // But it can't pull references outward, so for our purposes it is safe to
  // ignore.
  const scopeManager = analyzeScope(ast, {
    ecmaVersion: 6,
    sourceType: "module",
    ignoreEval: true,
    // Ensures we don't treat top-level var declarations as globals.
    nodejsScope: true,
  });

  const program = ast.type === "File" ? ast.program : ast;
  const programScope = scopeManager.acquire(program);
  const assignedGlobals = {};

  // Passing {sourceType: "module"} to analyzeScope leaves this list
  // strangely empty, but {sourceType: "script"} forbids ImportDeclaration
  // nodes (because they are only legal in modules.
  programScope.implicit.variables.forEach(variable => {
    assignedGlobals[variable.name] = true;
  });

  // Fortunately, even with {sourceType: "module"}, the .implicit.left
  // array still has all the information we need, as long as we ignore
  // global variable references that are not assignments.
  programScope.implicit.left.forEach(entry => {
    if (entry.identifier &&
        entry.identifier.type === "Identifier" &&
        // Only consider identifers that are assigned a value.
        entry.writeExpr) {
      assignedGlobals[entry.identifier.name] = true;
    }
  });

  if (hash) {
    globalsCache.set(hash, assignedGlobals);
  }

  return assignedGlobals;
}
