"use strict";

const assert = require("assert");
const Cache = require("./cache.js");
const cachesByDir = Object.create(null);
const BABEL_CACHE_DIR = process.env.BABEL_CACHE_DIR;
let options; // Lazily initialized.

// Make sure that module.importSync and module.export are defined in the
// current Node process.
const Module = module.constructor;
require("reify/lib/runtime").enable(Module.prototype);

// Options passed to compile will completely replace the default options,
// so if you only want to modify the default options, call this function
// first, modify the result, and then pass those options to compile.
function getDefaultOptions(features) {
  options = options || require("./options.js");
  return options.getDefaults(features);
}
exports.getDefaultOptions = getDefaultOptions;

function getMinifierOptions(features) {
  options = options || require("./options.js");
  return options.getMinifierDefaults(features);
}
exports.getMinifierOptions = getMinifierOptions;

// If you have already imported meteor-babel as a package, and this file
// (index.js) has been evaluated, then there is very little additional
// cost to calling meteorBabel.getMinimumModernBrowserVersions. However,
// if you want to avoid importing meteor-babel, but need to know the
// minimum browser versions, you should import the modern-versions.js
// module directly: require("meteor-babel/modern-versions.js").get().
exports.getMinimumModernBrowserVersions = function () {
  return require("./modern-versions.js").get();
};

const parse = exports.parse =
  require("reify/lib/parsers/babylon.js").parse;

let didWarnAboutNoCache = false;

exports.compile = function (source, options, deps) {
  options = options || getDefaultOptions();

  if (deps && typeof deps.cacheDirectory === "string") {
    return getOrCreateCache(deps.cacheDirectory).get(source, options, deps);
  }

  // If no options.cacheDir was provided, but the BABEL_CACHE_DIR
  // environment variable is set, then respect that.
  if (BABEL_CACHE_DIR) {
    return getOrCreateCache(BABEL_CACHE_DIR).get(source, options, deps);
  }

  // If neither options.cacheDir nor BABEL_CACHE_DIR were provided, use
  // the first cache directory registered so far.
  for (var cacheDirectory in cachesByDir) {
    return getOrCreateCache(cacheDirectory).get(source, options, deps);
  }

  // Otherwise fall back to compiling without a cache.
  if (! didWarnAboutNoCache) {
    console.warn("Compiling " + options.filename +
                 " with meteor-babel without a cache");
    console.trace();
    didWarnAboutNoCache = true;
  }

  return compile(source, options);
};

function compile(source, options) {
  let ast = parse(source);

  // Since Reify inserts code without updating ast.tokens, it's better to
  // destroy unreliable token information. Don't worry; Babel can cope.
  delete ast.tokens;

  const babelCore = require("@babel/core");
  let result;

  function transform(presets, generateCode) {
    const optionsCopy = Object.assign({}, options);

    delete optionsCopy.plugins;
    optionsCopy.presets = presets;
    optionsCopy.ast = true;

    if (! generateCode) {
      optionsCopy.code = false;
      optionsCopy.sourceMap = false;
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
  return require("@babel/core").transformFromAst(
    parse(source),
    source,
    options || getMinifierOptions()
  );
}

function getOrCreateCache(cacheDir) {
  return cachesByDir[cacheDir] || (
    cachesByDir[cacheDir] = new Cache(compile, cacheDir)
  );
}
exports.setCacheDir = getOrCreateCache;

exports.runtime = // Legacy name; prefer installRuntime.
exports.installRuntime = function installRuntime() {
  return require("./runtime.js");
};

exports.defineHelpers = function defineHelpers() {
  return require("meteor-babel-helpers");
};
