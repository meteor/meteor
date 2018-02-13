"use strict";

const getESModule = require("reify/lib/runtime/utils.js").getESModule;
const nodeRequire = require;
require = function require(id) {
  const exports = nodeRequire(id);
  return getESModule(exports) && exports.default || exports;
};

const babelPresetMeteor = require("babel-preset-meteor");
const babelPresetMeteorModern = require("babel-preset-meteor/modern");
const reifyPlugin = require("babel-plugin-transform-es2015-modules-reify");
const strictModulesPluginFactory =
  require("@babel/plugin-transform-modules-commonjs");

const babelModulesPlugin = [function () {
  const plugin = strictModulesPluginFactory.apply(this, arguments);
  // Since babel-preset-meteor uses an exact version of the
  // @babel/plugin-transform-modules-commonjs transform (6.8.0), we can be
  // sure this plugin.inherits property is indeed the
  // @babel/plugin-transform-strict-mode transform that we wish to
  // disable. Otherwise it would be difficult to know exactly what we're
  // deleting here, since plugins don't provide much identifying
  // information.
  delete plugin.inherits;
  return plugin;
}, {
  allowTopLevelThis: true,
  strictMode: false,
  loose: true
}];

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
    presets: [babelPresetMeteor],
    plugins: [
      [reifyPlugin, {
        generateLetDeclarations: true,
        enforceStrictMode: false
      }]
    ]
  };

  combined.plugins.push(
    require("./plugins/dynamic-import.js")
  );

  const rt = getRuntimeTransform(features, false);
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

  // Even though we use Reify to transpile `import` and `export`
  // declarations in the original source, Babel sometimes inserts its own
  // `import` declarations later on, and of course Babel knows best how to
  // compile those declarations.
  combined.plugins.push(babelModulesPlugin);

  return finish([combined]);
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
    presets: [babelPresetMeteorModern.getPreset],
    plugins: []
  };

  combined.plugins.push(
    require("./plugins/dynamic-import.js")
  );

  const rt = getRuntimeTransform(features, true);
  if (rt) {
    combined.plugins.push(rt);
  }

  maybeAddReactPlugins(features, combined);

  combined.plugins.push(
    [reifyPlugin, {
      generateLetDeclarations: true,
      enforceStrictMode: false
    }]
  );

  return finish([combined]);
}

function finish(presets) {
  return {
    compact: false,
    sourceMap: false,
    ast: false,
    babelrc: false,
    presets: presets
  };
}

function isObject(value) {
  return value !== null && typeof value === "object";
}

function getRuntimeTransform(features, useBuiltIns) {
  if (isObject(features)) {
    if (features.runtime === false) {
      return null;
    }

    if (isObject(features.runtime)) {
      useBuiltIns = !! features.runtime.useBuiltIns;
    }
  }

  // Import helpers from the babel-runtime package rather than redefining
  // them at the top of each module.
  return [require("@babel/plugin-transform-runtime"), {
    // Avoid importing polyfills for things like Object.keys, which
    // Meteor already shims in other ways.
    polyfill: false,

    // Use runtime helpers that do not import any core-js polyfills,
    // since Meteor provides those polyfills in other ways.
    useBuiltIns: useBuiltIns
  }];
}

function getDefaultsForNode8(features) {
  const plugins = [];

  // Support Flow type syntax by simply stripping it out.
  plugins.push(
    require("@babel/plugin-syntax-flow"),
    require("@babel/plugin-transform-flow-strip-types")
  );

  const rt = getRuntimeTransform(features, true);
  if (rt) {
    plugins.push(rt);
  }

  // Not fully supported in Node 8 without the --harmony flag.
  plugins.push(
    require("@babel/plugin-syntax-object-rest-spread"),
    require("@babel/plugin-proposal-object-rest-spread")
  );

  // Ensure that async functions run in a Fiber, while also taking
  // full advantage of native async/await support in Node 8.
  plugins.push([require("./plugins/async-await.js"), {
    // Do not transform `await x` to `Promise.await(x)`, since Node
    // 8 has native support for await expressions.
    useNativeAsyncAwait: false
  }]);

  // Transform `import(id)` to `module.dynamicImport(id)`.
  plugins.push(require("./plugins/dynamic-import.js"));

  // Enable async generator functions proposal.
  plugins.push(require("@babel/plugin-proposal-async-generator-functions"));

  // Compile import/export syntax with Reify.
  plugins.push([reifyPlugin, {
    generateLetDeclarations: true,
    enforceStrictMode: false
  }]);

  const presets = [{
    plugins
  }];

  maybeAddReactPlugins(features, { plugins, presets });

  return finish(presets);
}

exports.getMinifierDefaults = function getMinifierDefaults(features) {
  const inlineNodeEnv = features && features.inlineNodeEnv;
  const keepFnName = !! (features && features.keepFnName);
  const options = {
    // Generate code in loose mode
    compact: false,
    // Don't generate a source map, we do that during compilation
    sourceMap: false,
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
