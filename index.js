var assert = require("assert");
var getDefaultOptions = require("./options.js").getDefaults;
var Cache = require("./cache.js");
var compileCache; // Lazily initialized.
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

function setCacheDir(cacheDir) {
  if (compileCache && compileCache.dir === cacheDir) {
    return;
  }

  var reifyCompiler = require("reify/lib/compiler");

  compileCache = new Cache(function (source, options) {
    var ast = parse(source); // TODO Cache parsed ASTs somehow?
    var result = require("babel-core")
      .transformFromAst(ast, source, options);
    result.code = reifyCompiler.compile(result.code);
    return result;
  }, cacheDir);
}
exports.setCacheDir = setCacheDir;

exports.runtime = // Legacy name; prefer installRuntime.
exports.installRuntime = function installRuntime() {
  return require("./runtime.js");
};

exports.defineHelpers = function defineHelpers() {
  return require("meteor-babel-helpers");
};
