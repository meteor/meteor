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

// Options passed to compile will completely replace the default options,
// so if you only want to modify the default options, call this function
// first, modify the result, and then pass those options to compile.
exports.getDefaultOptions = getDefaultOptions;

function parse(source) {
  return require("babylon").parse(source, parseOptions);
}
exports.parse = parse;

exports.compile = function compile(source, options) {
  options = options || getDefaultOptions();
  if (! compileCache) {
    setCacheDir();
  }
  return compileCache.get(source, options);
};

function setCacheDir(cacheDir) {
  if (compileCache && compileCache.dir === cacheDir) {
    return;
  }

  compileCache = new Cache(function (source, options) {
    var ast = parse(source); // TODO Cache parsed ASTs somehow?
    return require("babel-core").transformFromAst(ast, source, options);
  }, cacheDir);
}
exports.setCacheDir = setCacheDir;

exports.runtime = // Legacy name; prefer installRuntime.
exports.installRuntime = function installRuntime() {
  return require("./runtime.js");
};
