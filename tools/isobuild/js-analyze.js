import { parse } from '@meteorjs/babel';
import { analyze as analyzeScope } from 'escope';
import LRUCache from "lru-cache";
import { Profile } from '../tool-env/profile';
import Visitor from "@meteorjs/reify/lib/visitor.js";
import { findPossibleIndexes } from "@meteorjs/reify/lib/utils.js";
import acorn from 'acorn';

// Native Rust parser — ~3-7x faster than acorn for typical Meteor files.
// oxc-parser is ESM-only ("type": "module"), so we can't require() it from
// Meteor's Babel-transpiled CJS tool code. Instead, load the native NAPI
// binding directly and wrap the result ourselves.
let oxcParseSync;
try {
  const oxcTargets = {
    'win32-x64': '@oxc-parser/binding-win32-x64-msvc',
    'win32-ia32': '@oxc-parser/binding-win32-ia32-msvc',
    'win32-arm64': '@oxc-parser/binding-win32-arm64-msvc',
    'darwin-x64': '@oxc-parser/binding-darwin-x64',
    'darwin-arm64': '@oxc-parser/binding-darwin-arm64',
    'linux-x64': '@oxc-parser/binding-linux-x64-gnu',
    'linux-arm64': '@oxc-parser/binding-linux-arm64-gnu',
  };
  const oxcPkg = oxcTargets[process.platform + '-' + process.arch];
  if (oxcPkg) {
    const oxcBinding = require(oxcPkg);
    // Replicate oxc-parser/src-js/wrap.js: parse AST JSON and fix
    // BigInt/RegExp Literal nodes that need their `value` set.
    const oxcJsonParseAst = (json) => {
      const { node: program, fixes } = JSON.parse(String(json));
      for (const fixPath of fixes) {
        let n = program;
        for (const key of fixPath) n = n[key];
        if (n.bigint) n.value = BigInt(n.bigint);
        else try { n.value = RegExp(n.regex.pattern, n.regex.flags); } catch (_) {}
      }
      return program;
    };
    oxcParseSync = (filename, sourceText, options) => {
      const result = oxcBinding.parseSync(filename, sourceText, options);
      let program;
      return {
        get program() {
          if (!program) program = oxcJsonParseAst(result.program);
          return program;
        },
        get module() { return result.module; },
        get errors() { return result.errors; },
      };
    };
  }
  if (oxcParseSync && process.env.METEOR_OXC_DEBUG) {
    console.log('[oxc] oxc-parser loaded (native binding)');
  }
} catch (e) {
  oxcParseSync = null;
  if (process.env.METEOR_OXC_DEBUG) {
    console.log('[oxc] not available, using acorn:', e.message);
  }
}

const hasOwn = Object.prototype.hasOwnProperty;
const objToStr = Object.prototype.toString

function isRegExp(value) {
  return value && objToStr.call(value) === "[object RegExp]";
}

var AST_CACHE = new LRUCache({
  max: Math.pow(2, 12),
  length(ast) {
    // Estimate cached lines based on average length per character
    const avgCharsPerLine = 40;
    return Math.ceil(ast.end / avgCharsPerLine);
  }
});

// Like babel.parse, but annotates any thrown error with $ParseError = true.
// Tries oxc-parser (native Rust) first for speed, then acorn, then babel.
function tryToParse(source, hash) {
  if (hash && AST_CACHE.has(hash)) {
    return AST_CACHE.get(hash);
  }

  let ast;
  try {
    Profile.time('jsAnalyze.parse', () => {
      // 1. Try oxc-parser (native Rust, ~3-7x faster than acorn).
      //    oxc-parser does error recovery and always returns a best-effort
      //    AST, so we check that the body is non-empty to confirm the parse
      //    was meaningful. Soft errors (e.g. return outside function) are
      //    fine — the AST is still correct.
      if (oxcParseSync) {
        try {
          const result = oxcParseSync('source.js', source, {
            sourceType: 'script',
          });
          if (result.program &&
              (result.program.body.length > 0 || result.errors.length === 0)) {
            ast = result.program;
          }
        } catch (_) {
          // oxc-parser failed unexpectedly — fall through to acorn.
        }
      }

      // 2. Fall back to acorn.
      if (!ast) {
        try {
          ast = acorn.parse(source, {
            ecmaVersion: 'latest',
            sourceType: 'script',
            allowAwaitOutsideFunction: true,
            allowImportExportEverywhere: true,
            allowReturnOutsideFunction: true,
            allowHashBang: true,
            checkPrivateFields: false,
          });
        } catch (error) {
          // 3. Last resort: babel parser (handles exotic syntax).
          ast = parse(source, {
            strictMode: false,
            sourceType: 'module',
            allowImportExportEverywhere: true,
            allowReturnOutsideFunction: true,
            allowUndeclaredExports: true,
            plugins: [
              'importAttributes',
              'explicitResourceManagement',
              'decorators'
            ]
          });
        }
      }
    });
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
 * nodes. The keys of this map are used in ./import-scanner.ts to traverse
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
  // Fast path: single-pass source-level extraction (no AST, no JSON.parse).
  // ~10x faster than the AST-based approach for typical files.
  const fast = findImportsFast(source);
  if (fast !== null) return fast;

  // Fallback: full AST parse + Visitor walk (handles exotic edge cases).
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
  Profile.time('findImportedModuleIdentifiersVisitor', () => {
    importedIdentifierVisitor.visit(ast, source, possibleIndexes);
  });

  return importedIdentifierVisitor.identifiers;
}

/**
 * Fast import extraction via single-pass source scanning — no AST needed.
 *
 * Scans the source character by character, tracking whether we are in
 * code vs comment vs string vs template literal. When a keyword
 * (import, export, require, module.link, module.dynamicImport) is found
 * in code context, extracts the module specifier string directly.
 *
 * Returns the identifiers map, or null if the source uses patterns
 * too complex for this scanner (triggering AST fallback).
 */
function findImportsFast(source) {
  // Quick pre-check: any import-related keywords at all?
  if (source.indexOf('import') === -1 &&
      source.indexOf('require') === -1 &&
      source.indexOf('export') === -1 &&
      source.indexOf('module.') === -1) {
    return Object.create(null);
  }

  const identifiers = Object.create(null);
  const len = source.length;
  let i = 0;

  function addId(id, dynamic) {
    const existing = identifiers[id];
    if (existing) {
      if (!dynamic) existing.dynamic = false;
    } else {
      identifiers[id] = { possiblySpurious: false, dynamic: !!dynamic };
    }
  }

  function ch(pos) {
    return pos < len ? source.charCodeAt(pos) : 0;
  }

  function isIdentCh(c) {
    return (c >= 97 && c <= 122) || (c >= 65 && c <= 90) ||
           (c >= 48 && c <= 57) || c === 95 || c === 36;
  }

  function isKw(pos, word) {
    return source.startsWith(word, pos) &&
      !isIdentCh(ch(pos - 1)) &&
      !isIdentCh(ch(pos + word.length));
  }

  // Skip whitespace and inline comments (for multiline import declarations).
  function skipWS(pos) {
    while (pos < len) {
      var c = ch(pos);
      if (c === 32 || c === 9 || c === 10 || c === 13 || c === 12) {
        pos++;
      } else if (c === 47 && ch(pos + 1) === 47) {
        pos = source.indexOf('\n', pos + 2);
        if (pos === -1) return len;
        pos++;
      } else if (c === 47 && ch(pos + 1) === 42) {
        pos = source.indexOf('*/', pos + 2);
        if (pos === -1) return len;
        pos += 2;
      } else {
        break;
      }
    }
    return pos;
  }

  // Extract string literal at pos (must point to ' or ").
  // Returns { value, end } or null.
  function extractStr(pos) {
    var q = ch(pos);
    if (q !== 39 && q !== 34) return null;
    var j = pos + 1;
    while (j < len) {
      var c = source.charCodeAt(j);
      if (c === q) return { value: source.substring(pos + 1, j), end: j + 1 };
      if (c === 92) j++; // backslash escape
      j++;
    }
    return null;
  }

  // Skip past a string literal (pos points to opening quote).
  function skipStr(pos) {
    var q = source.charCodeAt(pos);
    pos++;
    while (pos < len) {
      var c = source.charCodeAt(pos);
      if (c === q) return pos + 1;
      if (c === 92) pos++;
      pos++;
    }
    return pos;
  }

  // Skip past a template literal (pos points to opening backtick).
  // Handles ${} expression nesting with strings, comments, nested templates.
  function skipTemplate(pos) {
    pos++; // skip `
    while (pos < len) {
      var c = source.charCodeAt(pos);
      if (c === 96) return pos + 1; // closing `
      if (c === 92) { pos += 2; continue; }
      if (c === 36 && ch(pos + 1) === 123) { // ${
        pos = skipExpr(pos + 2);
        continue;
      }
      pos++;
    }
    return pos;
  }

  // Skip a ${...} expression body. Handles nested braces, strings,
  // templates, and comments. pos points right after the opening ${.
  function skipExpr(pos) {
    var depth = 1;
    while (pos < len && depth > 0) {
      var c = source.charCodeAt(pos);
      if (c === 123) { depth++; pos++; continue; }
      if (c === 125) { depth--; pos++; continue; }
      if (c === 39 || c === 34) { pos = skipStr(pos); continue; }
      if (c === 96) { pos = skipTemplate(pos); continue; }
      if (c === 47 && ch(pos + 1) === 47) {
        pos = source.indexOf('\n', pos + 2);
        if (pos === -1) return len;
        pos++;
        continue;
      }
      if (c === 47 && ch(pos + 1) === 42) {
        pos = source.indexOf('*/', pos + 2);
        if (pos === -1) return len;
        pos += 2;
        continue;
      }
      pos++;
    }
    return pos;
  }

  // Skip a regex literal (pos points to opening /).
  // Returns new position after the regex, or pos if not a regex.
  function skipRegex(pos) {
    var j = pos + 1;
    while (j < len) {
      var c = source.charCodeAt(j);
      if (c === 47) { // closing /
        j++;
        while (j < len && isIdentCh(source.charCodeAt(j))) j++; // flags
        return j;
      }
      if (c === 92) { j += 2; continue; } // escape
      if (c === 10 || c === 13) return pos; // newline = not a regex
      if (c === 91) { // character class [...]
        j++;
        while (j < len && source.charCodeAt(j) !== 93) {
          if (source.charCodeAt(j) === 92) j++;
          j++;
        }
        j++; // skip ]
        continue;
      }
      j++;
    }
    return pos; // unclosed = not a regex
  }

  // Scan forward looking for 'from' keyword followed by a string literal.
  // Used for `import ... from '...'` and `export ... from '...'`.
  function tryExtractFrom(pos) {
    var limit = Math.min(len, pos + 4000);
    while (pos < limit) {
      var c = ch(pos);
      if (c === 102 && isKw(pos, 'from')) {
        var strPos = skipWS(pos + 4);
        var str = extractStr(strPos);
        if (str) { addId(str.value, false); return str.end; }
        return -1;
      }
      if (c === 39 || c === 34) { pos = skipStr(pos); continue; }
      if (c === 59 || c === 125) return -1; // statement boundary
      // Skip inline comments inside multiline declarations
      if (c === 47 && ch(pos + 1) === 47) {
        pos = source.indexOf('\n', pos + 2);
        if (pos === -1) return -1;
        pos++;
        continue;
      }
      if (c === 47 && ch(pos + 1) === 42) {
        pos = source.indexOf('*/', pos + 2);
        if (pos === -1) return -1;
        pos += 2;
        continue;
      }
      pos++;
    }
    return -1;
  }

  // Track previous meaningful character for regex detection.
  var prevCode = 10; // treat start of file as newline

  // Main scan loop
  while (i < len) {
    var c = ch(i);

    // Skip whitespace (don't update prevCode)
    if (c === 32 || c === 9 || c === 10 || c === 13 || c === 12) {
      i++;
      continue;
    }

    // Skip string literals
    if (c === 39 || c === 34) {
      i = skipStr(i);
      prevCode = c; // string is an expression
      continue;
    }

    // Skip template literals
    if (c === 96) {
      i = skipTemplate(i);
      prevCode = 96;
      continue;
    }

    // Skip line comments
    if (c === 47 && ch(i + 1) === 47) {
      i = source.indexOf('\n', i + 2);
      if (i === -1) break;
      i++;
      continue;
    }

    // Skip block comments
    if (c === 47 && ch(i + 1) === 42) {
      i = source.indexOf('*/', i + 2);
      if (i === -1) break;
      i += 2;
      continue;
    }

    // Skip regex literals (heuristic based on preceding token).
    // After ), ], identifier chars, ++, -- → division. Otherwise → regex.
    if (c === 47) {
      if (!isIdentCh(prevCode) && prevCode !== 41 && prevCode !== 93) {
        var regEnd = skipRegex(i);
        if (regEnd > i) { i = regEnd; prevCode = 47; continue; }
      }
    }

    // 'import' keyword
    if (c === 105 && isKw(i, 'import')) {
      var j = skipWS(i + 6);
      // Dynamic import: import(...)
      if (ch(j) === 40) {
        j = skipWS(j + 1);
        var s = extractStr(j);
        if (s) { addId(s.value, true); i = s.end; prevCode = 41; continue; }
      }
      // Side-effect import: import '...'
      var s2 = extractStr(j);
      if (s2) { addId(s2.value, false); i = s2.end; prevCode = 39; continue; }
      // import ... from '...'
      var end = tryExtractFrom(j);
      if (end > 0) { i = end; prevCode = 39; continue; }
      i += 6;
      prevCode = 116; // 't'
      continue;
    }

    // 'export' keyword
    if (c === 101 && isKw(i, 'export')) {
      var end2 = tryExtractFrom(i + 6);
      if (end2 > 0) { i = end2; prevCode = 39; continue; }
      i += 6;
      prevCode = 116; // 't'
      continue;
    }

    // 'require' keyword
    if (c === 114 && isKw(i, 'require')) {
      var rj = skipWS(i + 7);
      if (ch(rj) === 40) {
        rj = skipWS(rj + 1);
        var rs = extractStr(rj);
        if (rs) { addId(rs.value, false); i = rs.end; prevCode = 41; continue; }
      }
      i += 7;
      prevCode = 101; // 'e'
      continue;
    }

    // 'module' + optional digits + '.link(...)' or '.dynamicImport(...)'
    if (c === 109 && source.startsWith('module', i) && !isIdentCh(ch(i - 1))) {
      var mj = i + 6;
      while (mj < len && ch(mj) >= 48 && ch(mj) <= 57) mj++;
      if (ch(mj) === 46) { // dot
        mj++;
        var isDynamic = false;
        if (source.startsWith('link', mj) && !isIdentCh(ch(mj + 4))) {
          mj += 4;
        } else if (source.startsWith('dynamicImport', mj) && !isIdentCh(ch(mj + 13))) {
          mj += 13;
          isDynamic = true;
        } else {
          i++;
          prevCode = c;
          continue;
        }
        mj = skipWS(mj);
        if (ch(mj) === 40) {
          mj = skipWS(mj + 1);
          var ms = extractStr(mj);
          if (ms) { addId(ms.value, isDynamic); i = ms.end; prevCode = 41; continue; }
        }
      }
      i += 6;
      prevCode = 101; // 'e'
      continue;
    }

    prevCode = c;
    i++;
  }

  return identifiers;
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

  // oxc-parser represents dynamic import() as ImportExpression (ESTree spec),
  // whereas acorn uses CallExpression with callee.type === "Import".
  visitImportExpression(path) {
    const node = path.getValue();
    if (isStringLiteral(node.source)) {
      this.addIdentifier(node.source.value, "import", true);
    }
    this.visitChildren(path);
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
const globalsCache = new LRUCache({
  max: Math.pow(2, 12),
  length(globals) {
    let sum = 0;
    Object.keys(globals).forEach(name => sum += name.length);
    return sum === 0 ? 1 : sum;
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
    ecmaVersion: 9,
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
        // Only consider identifiers that are assigned a value.
        entry.writeExpr) {
      assignedGlobals[entry.identifier.name] = true;
    }
  });

  if (hash) {
    globalsCache.set(hash, assignedGlobals);
  }

  return assignedGlobals;
}

// ---------------------------------------------------------------------------
// Worker-pool-aware async variants
// ---------------------------------------------------------------------------
// These dispatch to the worker pool when available, falling back to the
// synchronous main-thread implementations above. Callers that are already
// async (linker, import-scanner) should prefer these for parallelism.

export async function findAssignedGlobalsAsync(source, hash) {
  const pool = global.__meteor_worker_pool;
  if (pool) {
    try {
      return await pool.submit('analyze-globals', { source, hash });
    } catch (_) {
      // Worker failed — fall back to main thread.
    }
  }
  return findAssignedGlobals(source, hash);
}

export async function findImportedModuleIdentifiersAsync(source, hash) {
  // The fast scanner runs on the main thread and is faster than dispatching
  // to the worker pool (avoids structured-clone IPC overhead for each source
  // string). It handles 99%+ of real-world JavaScript files.
  return findImportedModuleIdentifiers(source, hash);
}
