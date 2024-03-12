"use strict";

const getESModule = require("@meteorjs/reify/lib/runtime/utils.js").getESModule;
const nodeRequire = require;
require = function require(id) {
  const exports = nodeRequire(id);
  return getESModule(exports) && exports.default || exports;
};

const babelRuntimeVersion = require("@babel/runtime/package.json").version;
const babelPresetMeteor = require("babel-preset-meteor");
const babelPresetMeteorModern = require("babel-preset-meteor/modern");
const reifyPlugin = require("@meteorjs/reify/plugins/babel");

function getReifyPlugin(features) {
  return [reifyPlugin, getReifyOptions(features)];
}

function getReifyOptions(features) {
  const reifyOptions = {
    avoidModernSyntax: true,
    enforceStrictMode: false,
    dynamicImport: true
  };

  if (features) {
    if (features.modernBrowsers ||
        features.nodeMajorVersion >= 8) {
      reifyOptions.avoidModernSyntax = false;
      reifyOptions.generateLetDeclarations = true;
    }

    if (features.compileForShell) {
      // If we're compiling code to run in the Node REPL; we never want to
      // wrap it with a function to rename the `module` identifier.
      reifyOptions.moduleAlias = "module";
    }

    if (features.topLevelAwait) {
      reifyOptions.topLevelAwait = true;
    }
  }

  return reifyOptions;
}

exports.getDefaults = function getDefaults(features) {
  if (features) {
    if (features.nodeMajorVersion >= 8) {
      return getDefaultsForNode8(features);
    }

    if (features.modernBrowsers) {
      return getDefaultsForModernBrowsers(features);
    }
  }

  const combined = {
    presets: [],
    plugins: [getReifyPlugin(features)]
  };

  const compileModulesOnly = features && features.compileModulesOnly;
  if (! compileModulesOnly) {
    combined.presets.push(babelPresetMeteor);

    const rt = getRuntimeTransform(features);
    if (rt) {
      combined.plugins.push(rt);
    }

    maybeAddReactPlugins(features, combined);

    if (features && features.jscript) {
      combined.plugins.push(
        require("./plugins/named-function-expressions.js"),
        require("./plugins/sanitize-for-in-objects.js")
      );
    }
  }

  return finish(features, [combined]);
};

function maybeAddReactPlugins(features, options) {
  if (features && features.react) {
    options.presets.push(require("@babel/preset-react"));
    options.plugins.push(
      [require("@babel/plugin-proposal-class-properties"), {
        loose: true
      }]
    );
  }
}

function getDefaultsForModernBrowsers(features) {
  const combined = {
    presets: [],
    plugins: [getReifyPlugin(features)]
  };

  const compileModulesOnly = features && features.compileModulesOnly;
  if (! compileModulesOnly) {
    combined.presets.push(babelPresetMeteorModern.getPreset);

    const rt = getRuntimeTransform(features);
    if (rt) {
      combined.plugins.push(rt);
    }

    maybeAddReactPlugins(features, combined);
  }

  return finish(features, [combined]);
}

const parserOpts = require("@meteorjs/reify/lib/parsers/babel.js").options;
const util = require("./util.js");

function finish(features, presets) {
  const options = {
    compact: false,
    sourceMaps: false,
    ast: false,
    // Disable .babelrc lookup and processing.
    babelrc: false,
    // Disable babel.config.js lookup and processing.
    configFile: false,
    parserOpts: util.deepClone(parserOpts),
    presets: presets
  };

  if (features && features.typescript) {
    // This additional option will be consumed by the meteorBabel.compile
    // function before the options are passed to Babel.
    options.typescript = true;
  }

  return options;
}

function isObject(value) {
  return value !== null && typeof value === "object";
}

function getRuntimeTransform(features) {
  if (isObject(features)) {
    if (features.runtime === false) {
      return null;
    }
  }

  // Import helpers from the babel-runtime package rather than redefining
  // them at the top of each module.
  return [require("@babel/plugin-transform-runtime"), {
    // Necessary to enable importing helpers like objectSpread:
    // https://github.com/babel/babel/pull/10170#issuecomment-508936150
    version: babelRuntimeVersion,
    // Use @babel/runtime/helpers/*.js:
    helpers: true,
    // Do not use @babel/runtime/helpers/esm/*.js:
    useESModules: false,
    // Do not import from @babel/runtime-corejs2
    // or @babel/runtime-corejs3:
    corejs: false,
  }];
}

function getDefaultsForNode8(features) {
  const combined = {
    presets: [],
    plugins: [getReifyPlugin(features)]
  };

  const compileModulesOnly = features.compileModulesOnly;
  if (! compileModulesOnly) {
    combined.presets.push(babelPresetMeteorModern.getPreset);

    const rt = getRuntimeTransform(features);
    if (rt) {
      combined.plugins.push(rt);
    }

    // Not fully supported in Node 8 without the --harmony flag.
    combined.plugins.push(
      require("@babel/plugin-syntax-object-rest-spread"),
      require("@babel/plugin-proposal-object-rest-spread")
    );

    if (features.useNativeAsyncAwait === false) {
      combined.plugins.push([
        require('./plugins/async-await.js'),
        {
          // Even though Node 8 supports native async/await, it is not
          // compatible with fibers.
          useNativeAsyncAwait: false,
        },
      ]);
    }
    // Enable async generator functions proposal.
    combined.plugins.push(require("@babel/plugin-proposal-async-generator-functions"));
  }

  if (! compileModulesOnly) {
    maybeAddReactPlugins(features, combined);
  }

  return finish(features, [combined]);
}

exports.getMinifierDefaults = function getMinifierDefaults(features) {
  const inlineNodeEnv = features && features.inlineNodeEnv;
  const keepFnName = !! (features && features.keepFnName);
  const options = {
    // Generate code in loose mode
    compact: false,
    // Don't generate a source map, we do that during compilation
    sourceMaps: false,
    // Necessary after https://github.com/babel/minify/pull/855
    comments: false,
    // We don't need to generate AST code
    ast: false,
    // Do not honor babelrc settings, would conflict with compilation
    babelrc: false,
    // May be modified according to provided features below.
    plugins: [],
    // Only include the minifier plugins, since we've already compiled all
    // the ECMAScript syntax we want.
    presets: [
      [require("babel-preset-minify"), {
        keepClassName: keepFnName,
        keepFnName
      }]
    ]
  };

  if (inlineNodeEnv) {
    options.plugins.push([
      require("./plugins/inline-node-env.js"),
      { nodeEnv: inlineNodeEnv }
    ]);
  }

  return options;
};
