var assert = require("assert");
var getDefaultOptions = require("./options.js").getDefaults;
var Cache = require("./cache.js");
var compileCache; // Lazily initialized.
var reifyCompiler = require("reify/lib/compiler");
var parseOptions = {
  sourceType: "module",
  strictMode: false,
  allowImportExportEverywhere: true,
  allowReturnOutsideFunction: true,
  plugins: [
    "asyncFunctions",
    "asyncGenerators",
    "classConstructorCall",
    "classProperties",
    "decorators",
    "doExpressions",
    "exponentiationOperator",
    "exportExtensions",
    "flow",
    "functionBind",
    "functionSent",
    "jsx",
    "objectRestSpread",
    "trailingFunctionCommas"
  ]
};

// Make sure that module.import and module.export are defined in the
// current Node process.
require("reify/node/runtime");

// Options passed to compile will completely replace the default options,
// so if you only want to modify the default options, call this function
// first, modify the result, and then pass those options to compile.
exports.getDefaultOptions = getDefaultOptions;

function parse(source) {
  return require("babylon").parse(source, parseOptions);
}
exports.parse = parse;

exports.compile = function compile(source, options, deps) {
  options = options || getDefaultOptions();
  if (! compileCache) {
    setCacheDir();
  }
  return compileCache.get(source, options, deps);
};

function compile(source, options) {
  var reifyResult = reifyCompiler.compile(source, {
    // Use Babel's parser during Reify compilation.
    parse: parse,
    // Return the modified AST as reifyResult.ast.
    ast: true,
    // Generate let declarations for imported symbols.
    generateLetDeclarations: true
  });

  // Since Reify inserts code without updating ast.tokens, it's better to
  // destroy unreliable token information. Don't worry; Babel can cope.
  delete reifyResult.ast.tokens;

  var babelResult = require("babel-core").transformFromAst(
    reifyResult.ast,
    reifyResult.code,
    options
  );

  if (babelResult.map) {
    // The reifyCompiler.compile step doesn't alter any line numbers, so
    // it's safe to use the original source (before reification) for the
    // source map returned by Babel.
    babelResult.map.sourcesContent[0] = source;
  }

  return babelResult;
}

function setCacheDir(cacheDir) {
  if (! (compileCache && compileCache.dir === cacheDir)) {
    compileCache = new Cache(compile, cacheDir);
  }
}
exports.setCacheDir = setCacheDir;

exports.runtime = // Legacy name; prefer installRuntime.
exports.installRuntime = function installRuntime() {
  return require("./runtime.js");
};

exports.defineHelpers = function defineHelpers() {
  return require("meteor-babel-helpers");
};
