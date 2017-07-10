"use strict";

const assert = require("assert");
const getDefaultOptions = require("./options.js").getDefaults;
const getMinifierOptions = require("./options.js").getMinifierDefaults;
const Cache = require("./cache.js");
let compileCache; // Lazily initialized.

// Make sure that module.importSync and module.export are defined in the
// current Node process.
const Module = module.constructor;
require("reify/lib/runtime").enable(Module.prototype);

// Options passed to compile will completely replace the default options,
// so if you only want to modify the default options, call this function
// first, modify the result, and then pass those options to compile.
exports.getDefaultOptions = getDefaultOptions;
exports.getMinifierOptions = getMinifierOptions;

const parse = exports.parse =
  require("reify/lib/parsers/babylon.js").parse;

exports.compile = function compile(source, options, deps) {
  options = options || getDefaultOptions();
  if (! compileCache) {
    setCacheDir();
  }
  return compileCache.get(source, options, deps);
};

function compile(source, options) {
  let ast = parse(source);

  // Since Reify inserts code without updating ast.tokens, it's better to
  // destroy unreliable token information. Don't worry; Babel can cope.
  delete ast.tokens;

  const babelCore = require("babel-core");
  let result;

  function transform(presets, generateCode) {
    const optionsCopy = Object.assign({}, options);

    delete optionsCopy.plugins;
    optionsCopy.presets = presets;
    optionsCopy.ast = true;

    if (! generateCode) {
      optionsCopy.code = false;
      optionsCopy.sourceMaps = false;
    }

    const result = babelCore.transformFromAst(ast, source, optionsCopy);

    if (options.ast === false) {
      delete result.ast;
    }

    return result;
  }

  if (options.plugins &&
      options.plugins.length > 0) {
    result = transform(
      [{ plugins: options.plugins }],
      // If there are no options.presets, then this is the final transform
      // call, so make sure we generate code.
      ! options.presets
    );
  }

  if (options.presets) {
    result = transform(options.presets, true);
  }

  return result;
}

exports.minify = function minify(source, options) {
  // We are not compiling the code in this step, only minifying, so reify
  // is not used.
  return require("babel-core").transformFromAst(
    parse(source),
    source,
    options || getMinifierOptions()
  );
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
