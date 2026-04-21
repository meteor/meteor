'use strict';

// ---------------------------------------------------------------------------
// Static Analysis Worker Handler
// ---------------------------------------------------------------------------
// Provides findAssignedGlobals and findImportedModuleIdentifiers as worker
// tasks. These are the pure computation cores extracted from js-analyze.js,
// without any Meteor tool-env dependencies (Profile, buildmessage, etc.).

let acorn = null;
let babelParse = null;
let oxcParseSync = null;
let analyzeScope = null;
let Visitor = null;
let findPossibleIndexes = null;

// Per-worker LRU caches (each worker thread has its own).
let LRU = null;
let AST_CACHE = null;
let GLOBALS_CACHE = null;

function ensureDeps() {
  if (acorn) return;

  acorn = require('acorn');
  analyzeScope = require('escope').analyze;
  LRU = require('lru-cache');
  Visitor = require('@meteorjs/reify/lib/visitor.js');

  const reifyUtils = require('@meteorjs/reify/lib/utils.js');
  findPossibleIndexes = reifyUtils.findPossibleIndexes;

  try {
    babelParse = require('@meteorjs/babel').parse;
  } catch (_) {
    babelParse = null;
  }

  // Native Rust parser — ~3-7x faster than acorn.
  // oxc-parser is ESM-only, so load the native NAPI binding directly.
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
  } catch (_) {
    oxcParseSync = null;
  }

  AST_CACHE = new LRU({ max: Math.pow(2, 12) });
  GLOBALS_CACHE = new LRU({ max: Math.pow(2, 12) });
}

// ---------------------------------------------------------------------------
// Shared parser (matches js-analyze.js tryToParse)
// ---------------------------------------------------------------------------
function tryToParse(source, hash) {
  if (hash && AST_CACHE.has(hash)) {
    return AST_CACHE.get(hash);
  }

  let ast;
  try {
    // 1. Try oxc-parser (native Rust, ~3-7x faster than acorn).
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
        // oxc-parser failed — fall through to acorn.
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
      } catch (_) {
        // 3. Last resort: babel parser.
        if (babelParse) {
          ast = babelParse(source, {
            strictMode: false,
            sourceType: 'module',
            allowImportExportEverywhere: true,
            allowReturnOutsideFunction: true,
            allowUndeclaredExports: true,
            plugins: [
              'importAttributes',
              'explicitResourceManagement',
              'decorators',
            ],
          });
        } else {
          throw _;
        }
      }
    }
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

// ---------------------------------------------------------------------------
// Helpers (mirrors js-analyze.js)
// ---------------------------------------------------------------------------
const hasOwn = Object.prototype.hasOwnProperty;
const objToStr = Object.prototype.toString;

function isRegExp(value) {
  return value && objToStr.call(value) === '[object RegExp]';
}

function isIdWithName(node, name) {
  if (!node || node.type !== 'Identifier') return false;
  if (typeof name === 'string') return node.name === name;
  if (isRegExp(name)) return name.test(node.name);
  return false;
}

function isStringLiteral(node) {
  return node && (
    node.type === 'StringLiteral' ||
    (node.type === 'Literal' && typeof node.value === 'string')
  );
}

function isPropertyWithName(node, name) {
  if (isIdWithName(node, name) ||
      (isStringLiteral(node) && node.value === name)) {
    return name;
  }
}

// ---------------------------------------------------------------------------
// Import identifier visitor (mirrors js-analyze.js)
// ---------------------------------------------------------------------------
let ImportVisitorClass = null;

function getImportVisitor() {
  if (ImportVisitorClass) return new ImportVisitorClass();

  ImportVisitorClass = class extends Visitor {
    reset(rootPath, code, possibleIndexes) {
      this.requireIsBound = false;
      this.identifiers = Object.create(null);
      this.possibleIndexes = possibleIndexes;
    }

    addIdentifier(id, type, dynamic) {
      const entry = hasOwn.call(this.identifiers, id)
        ? this.identifiers[id]
        : this.identifiers[id] = {
            possiblySpurious: true,
            dynamic: !!dynamic,
          };

      if (!dynamic) entry.dynamic = false;

      if (type === 'require') {
        entry.possiblySpurious =
          entry.possiblySpurious && this.requireIsBound;
      } else {
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
      if (node.params.some((param) => isIdWithName(param, 'require'))) {
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
      const firstArg = args[0];

      this.visitChildren(path);

      if (!isStringLiteral(firstArg)) return;

      if (isIdWithName(node.callee, 'require')) {
        this.addIdentifier(firstArg.value, 'require');
      } else if (node.callee.type === 'Import' ||
                 isIdWithName(node.callee, 'import')) {
        this.addIdentifier(firstArg.value, 'import', true);
      } else if (node.callee.type === 'MemberExpression' &&
                 isIdWithName(node.callee.object, /^module\d*$/)) {
        const propertyName =
          isPropertyWithName(node.callee.property, 'link') ||
          isPropertyWithName(node.callee.property, 'dynamicImport');

        if (propertyName) {
          this.addIdentifier(
            firstArg.value,
            'import',
            propertyName === 'dynamicImport',
          );
        }
      }
    }

    // oxc-parser represents dynamic import() as ImportExpression (ESTree spec),
    // whereas acorn uses CallExpression with callee.type === "Import".
    visitImportExpression(path) {
      const node = path.getValue();
      if (isStringLiteral(node.source)) {
        this.addIdentifier(node.source.value, 'import', true);
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
      if (isStringLiteral(node.source)) {
        this.addIdentifier(node.source.value, 'import', false);
      }
    }
  };

  return new ImportVisitorClass();
}

// ---------------------------------------------------------------------------
// Exported handlers
// ---------------------------------------------------------------------------
module.exports = {
  /**
   * Find all globally-assigned variables in a JavaScript source file.
   * Used by the linker to generate var declarations in package scope.
   *
   * @param {{ source: string, hash?: string }} payload
   * @returns {Record<string, true>} Map of variable names to true.
   */
  'analyze-globals'({ source, hash }) {
    ensureDeps();

    if (hash && GLOBALS_CACHE.has(hash)) {
      return GLOBALS_CACHE.get(hash);
    }

    const ast = tryToParse(source, hash);

    const scopeManager = analyzeScope(ast, {
      ecmaVersion: 9,
      sourceType: 'module',
      ignoreEval: true,
      nodejsScope: true,
    });

    const program = ast.type === 'File' ? ast.program : ast;
    const programScope = scopeManager.acquire(program);
    const assignedGlobals = {};

    programScope.implicit.variables.forEach((variable) => {
      assignedGlobals[variable.name] = true;
    });

    programScope.implicit.left.forEach((entry) => {
      if (entry.identifier &&
          entry.identifier.type === 'Identifier' &&
          entry.writeExpr) {
        assignedGlobals[entry.identifier.name] = true;
      }
    });

    if (hash) {
      GLOBALS_CACHE.set(hash, assignedGlobals);
    }

    return assignedGlobals;
  },

  /**
   * Find all imported module identifiers in a JavaScript source file.
   * Used by the import scanner for dependency graph traversal.
   *
   * @param {{ source: string, hash?: string }} payload
   * @returns {Record<string, { dynamic: boolean, possiblySpurious: boolean }>}
   */
  'find-imports'({ source, hash }) {
    ensureDeps();

    const possibleIndexes = findPossibleIndexes(source, [
      'require',
      'import',
      'export',
      'dynamicImport',
      'link',
    ]);

    if (possibleIndexes.length === 0) {
      return {};
    }

    const ast = tryToParse(source, hash);
    const visitor = getImportVisitor();
    visitor.visit(ast, source, possibleIndexes);

    return visitor.identifiers;
  },
};
