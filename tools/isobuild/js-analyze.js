import { parse as meteorBabelParse } from 'meteor-babel';
import { analyze as analyzeScope } from 'escope';
import { Profile } from "../tool-env/profile.js";
import { compile as reifyCompile } from "reify/lib/compiler.js";
import LRU from "lru-cache";

const hasOwn = Object.prototype.hasOwnProperty;

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
    ast = meteorBabelParse(source);
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

// Map from file hash to Reify-compiled output.
const REIFY_COMPILE_CACHE = new LRU({
  max: Math.pow(2, 20),
  length(result) {
    return result.code.length;
  }
});

export const reifyCompileWithCache = Profile(
  "reifyCompileWithCache (js-analyze.js)",
  function (source, hash) {
    if (hash && REIFY_COMPILE_CACHE.has(hash)) {
      return REIFY_COMPILE_CACHE.get(hash);
    }

    const result = reifyCompile(source, {
      // Do not modify the AST, nor bother returning result.ast.
      ast: false,
      // It's not our job to enforce strict mode here.
      enforceStrictMode: false,
      // We may be generating code for JavaScript environments that don't
      // support const and let declarations (e.g. older browsers), so it
      // would be dangerous at this stage to introduce such declarations.
      // Fortunately, reifyCompileWithCache is only called for modules in
      // node_modules, which should only be using top-level import and
      // export declarations, so there should not be any difference.
      generateLetDeclarations: false,
      // Same concern for arrow functions as for const/let declarations.
      avoidArrowFunctions: true,
      parse(code) {
        // Avoid double-parsing the input source, but allow Reify to parse
        // other strings using the meteor-babel parser.
        return code === source
          ? tryToParse(code, hash)
          : meteorBabelParse(code);
      }
    });

    result.deps = findImportedModuleIdentifiers(source, hash);

    if (hash) {
      REIFY_COMPILE_CACHE.set(hash, result);
    }

    return result;
  }
);

var dependencyKeywordPattern =
  /\b(?:require|import|importSync|dynamicImport|export)\b/g;

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
  const identifiers = {};
  const possibleIndexes = [];
  let match;

  dependencyKeywordPattern.lastIndex = 0;
  while ((match = dependencyKeywordPattern.exec(source))) {
    possibleIndexes.push(match.index);
  }

  if (!possibleIndexes.length) {
    return {};
  }

  const ast = tryToParse(source, hash);

  function walk(node, left, right, requireIsBound) {
    if (left >= right) {
      // The window of possible indexes is empty, so we can ignore
      // the entire subtree rooted at this node.
    } else if (Array.isArray(node)) {
      for (var i = 0, len = node.length; i < len; ++i) {
        walk(node[i], left, right, requireIsBound);
      }
    } else if (isNode(node)) {
      const start = node.start;
      const end = node.end;

      // Narrow the left-right window to exclude possible indexes
      // that fall outside of the current node.
      while (left < right && possibleIndexes[left] < start) ++left;
      while (left < right && end < possibleIndexes[right - 1]) --right;

      if (left < right) {
        if (! requireIsBound &&
            isFunctionWithParameter(node, "require")) {
          requireIsBound = true;
        }

        let id = getRequiredModuleId(node);
        if (typeof id === "string") {
          return addIdentifier(id, "require", requireIsBound);
        }

        const importInfo = getImportedModuleInfo(node);
        if (importInfo) {
          return addIdentifier(
            importInfo.id,
            "import",
            requireIsBound,
            importInfo.dynamic
          );
        }

        // Continue traversing the children of this node.
        for (const key of Object.keys(node)) {
          switch (key) {
          case "type":
          case "loc":
          case "start":
          case "end":
            // Ignore common keys that are never nodes.
            continue;
          }

          walk(node[key], left, right, requireIsBound);
        }
      }
    }
  }

  function addIdentifier(id, type, requireIsBound, isDynamic) {
    const entry = hasOwn.call(identifiers, id)
      ? identifiers[id]
      : identifiers[id] = {
          possiblySpurious: true,
          dynamic: !! isDynamic
        };

    if (! isDynamic) {
      entry.dynamic = false;
    }

    if (type === "require") {
      // If the identifier comes from a require call, but require is not a
      // free variable, then this dependency might be spurious.
      entry.possiblySpurious =
        entry.possiblySpurious && requireIsBound;
    } else {
      // The import keyword can't be shadowed, so any dependencies
      // registered by import statements should be trusted absolutely.
      entry.possiblySpurious = false;
    }
  }

  walk(ast, 0, possibleIndexes.length, false);

  return identifiers;
}

function isNode(value) {
  return value
    && typeof value === "object"
    && typeof value.type === "string"
    && typeof value.start === "number"
    && typeof value.end === "number";
}

function isIdWithName(node, name) {
  return node &&
    node.type === "Identifier" &&
    node.name === name;
}

function isFunctionWithParameter(node, name) {
  if (node.type === "FunctionExpression" ||
      node.type === "FunctionDeclaration" ||
      node.type === "ArrowFunctionExpression") {
    return node.params.some(param => isIdWithName(param, name));
  }
}

function getRequiredModuleId(node) {
  if (node.type === "CallExpression" &&
      isIdWithName(node.callee, "require")) {
    const args = node.arguments;
    const argc = args.length;
    if (argc > 0) {
      const arg = args[0];
      if (isStringLiteral(arg)) {
        return arg.value;
      }
    }
  }
}

function isStringLiteral(node) {
  return node && (
    node.type === "StringLiteral" ||
    (node.type === "Literal" &&
     typeof node.value === "string"));
}

function getImportedModuleInfo(node) {
  switch (node.type) {
  case "CallExpression":
    if (node.callee.type === "Import" ||
        isIdWithName(node.callee, "import")) {
      const firstArg = node.arguments[0];
      if (isStringLiteral(firstArg)) {
        return {
          id: firstArg.value,
          dynamic: true,
        };
      }

    } else if (node.callee.type === "MemberExpression" &&
               isIdWithName(node.callee.object, "module")) {
      const propertyName =
        isPropertyWithName(node.callee.property, "import") ||
        isPropertyWithName(node.callee.property, "importSync") ||
        isPropertyWithName(node.callee.property, "dynamicImport");

      if (propertyName) {
        const dynamic = propertyName === "dynamicImport";
        const args = node.arguments;
        const argc = args.length;

        if (argc > 0) {
          const arg = args[0];
          if (isStringLiteral(arg)) {
            return {
              id: arg.value,
              dynamic,
            };
          }
        }
      }
    }

    return null;

  case "ImportDeclaration":
  case "ExportAllDeclaration":
  case "ExportNamedDeclaration":
    // The .source of an ImportDeclaration or Export{Named,All}Declaration
    // is always a string-valued Literal node, if not null.
    if (isNode(node.source)) {
      return {
        id: node.source.value,
        dynamic: false,
      };
    }

    return null;
  }
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
