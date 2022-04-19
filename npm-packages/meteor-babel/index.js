"use strict";

const assert = require("assert");
const Cache = require("./cache.js");
const util = require("./util.js");
const cachesByDir = Object.create(null);
const BABEL_CACHE_DIR = process.env.BABEL_CACHE_DIR;
let options; // Lazily initialized.

// Make sure that module.importSync and module.export are defined in the
// current Node process.
const Module = module.constructor;
require("@meteorjs/reify/lib/runtime").enable(Module.prototype);

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

const parse = exports.parse = require("./parser").parse;

let didWarnAboutNoCache = false;

exports.compile = function (source, babelOptions, cacheOptions) {
  babelOptions = babelOptions || getDefaultOptions();

  if (cacheOptions !== false) {
    if (cacheOptions &&
        typeof cacheOptions.cacheDirectory === "string") {
      return getOrCreateCache(
        cacheOptions.cacheDirectory
      ).get(source, babelOptions, cacheOptions.cacheDeps);
    }

    // If cacheOptions.cacheDirectory was not provided, and cacheOptions
    // does not have a cacheDeps property, use the whole cacheOptions object
    // as cacheDeps when computing the cache key.
    const cacheDeps = cacheOptions && cacheOptions.cacheDeps || cacheOptions;

    // If no babelOptions.cacheDir was provided, but the BABEL_CACHE_DIR
    // environment variable is set, then respect that.
    if (BABEL_CACHE_DIR) {
      return getOrCreateCache(BABEL_CACHE_DIR)
        .get(source, babelOptions, cacheDeps);
    }

    // If neither babelOptions.cacheDir nor BABEL_CACHE_DIR were provided,
    // use the first cache directory registered so far.
    for (var cacheDirectory in cachesByDir) {
      return getOrCreateCache(cacheDirectory)
        .get(source, babelOptions, cacheDeps);
    }

    // Otherwise fall back to compiling without a cache.
    if (! didWarnAboutNoCache) {
      console.warn("Compiling " + babelOptions.filename +
                  " with @meteorjs/babel without a cache");
      console.trace();
      didWarnAboutNoCache = true;
    }
  }

  return compile(source, babelOptions);
};

function compile(source, options) {
  const babelCore = require("@babel/core");
  let result = { code: source };

  const optionsCopy = util.deepClone(options);
  const { ast, plugins, presets } = optionsCopy;
  delete optionsCopy.plugins;
  delete optionsCopy.typescript;
  optionsCopy.ast = true;

  if (options.typescript) {
    precompileTypeScript(result, options);
  }

  function transform(presets) {
    optionsCopy.plugins = [{
      parserOverride: parse
    }];

    optionsCopy.presets = presets;
    optionsCopy.sourceMaps = options.sourceMap !== false && options.sourceMaps !== false;
    if (optionsCopy.sourceMaps && result.map) {
      optionsCopy.inputSourceMap = result.map;
    }

    if (result.ast) {
      result = babelCore.transformFromAstSync(
        result.ast,
        result.code,
        optionsCopy
      );
    } else {
      result = babelCore.transformSync(result.code, optionsCopy);
    }

    if (ast === false) {
      delete result.ast;
    }
  }

  if (plugins && plugins.length > 0) {
    const presetOfPlugins = { plugins };
    transform([presetOfPlugins]);
  }

  if (presets) {
    transform(presets);
  }

  return result;
}

function precompileTypeScript(result, options) {
  const fileName = options.filename || options.sourceFileName;
  if (fileName && ! fileName.endsWith(".ts") && ! fileName.endsWith(".tsx")) {
    return;
  }

  const ts = require("typescript");
  let tsResult;
  try {
    tsResult = ts.transpileModule(result.code, {
      fileName,
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        // Leave module syntax intact so that Babel/Reify can handle it.
        module: ts.ModuleKind.ESNext,
        // This used to be false by default, but appears to have become
        // true by default around the release of typescript@3.7. It's
        // important to disable this option because enabling it allows
        // TypeScript to use helpers like __importDefault, which are much
        // better handled by Babel/Reify later in the pipeline.
        esModuleInterop: false,
        sourceMap: true,
        inlineSources: true,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
      }
    });
  } catch (e) {
    e.message = "While compiling " + fileName + ": " + e.message;
    throw e;
  }

  result.code = tsResult.outputText.replace(
    /\/\/# sourceMappingURL=.*?(\n|$)/g,
    "$1" // preserve trailing \n characters
  );

  result.map = JSON.parse(tsResult.sourceMapText);
  if (fileName) {
    result.map.file = fileName;
    result.map.sources = [fileName];
  }
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
