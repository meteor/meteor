var assert = require("assert");
var getDefaultOptions = require("./options.js").getDefaults;
var Cache = require("./cache.js");
var compileCache; // Lazily initialized.

// Options passed to compile will completely replace the default options,
// so if you only want to modify the default options, call this function
// first, modify the result, and then pass those options to compile.
exports.getDefaultOptions = getDefaultOptions;

exports.parse = function parse(source, options) {
  return require("babel-core").parse(source, options);
};

exports.compile = function compile(source, options) {
  options = options || getDefaultOptions();
  if (! compileCache) {
    setCacheDir();
  }
  return compileCache.get(source, options);
};

function setCacheDir(cacheDir) {
  var babel = require("babel-core");
  compileCache = new Cache(function (source, options) {
    return babel.transform(source, options);
  }, cacheDir);
}
exports.setCacheDir = setCacheDir;

exports.runtime = // Legacy name; prefer installRuntime.
exports.installRuntime = function installRuntime() {
  return require("./runtime.js");
};
