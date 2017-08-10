"use strict";

const babelPresetMeteor = require("babel-preset-meteor");
const reifyPlugin = require("babel-plugin-transform-es2015-modules-reify");
const strictModulesPluginFactory =
  require("babel-plugin-transform-es2015-modules-commonjs");

const babelModulesPlugin = [function () {
  const plugin = strictModulesPluginFactory.apply(this, arguments);
  // Since babel-preset-meteor uses an exact version of the
  // babel-plugin-transform-es2015-modules-commonjs transform (6.8.0), we
  // can be sure this plugin.inherits property is indeed the
  // babel-plugin-transform-strict-mode transform that we wish to disable.
  // Otherwise it would be difficult to know exactly what we're deleting
  // here, since plugins don't provide much identifying information.
  delete plugin.inherits;
  return plugin;
}, {
  allowTopLevelThis: true,
  strict: false,
  loose: true
}];

exports.getDefaults = function getDefaults(features) {
  if (features &&
      features.nodeMajorVersion >= 8) {
    return getDefaultsForNode8(features);
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

  if (! (features &&
         features.runtime === false)) {
    combined.plugins.push([
      require("babel-plugin-transform-runtime"),
      { // Avoid importing polyfills for things like Object.keys, which
        // Meteor already shims in other ways.
        polyfill: false }
    ]);
  }

  if (features) {
    if (features.react) {
      combined.presets.push(require("babel-preset-react"));
      combined.plugins.push(
        require("babel-plugin-transform-class-properties")
      );
    }

    if (features.jscript) {
      combined.plugins.push(
        require("./plugins/named-function-expressions.js"),
        require("./plugins/sanitize-for-in-objects.js")
      );
    }
  }

  // Even though we use Reify to transpile `import` and `export`
  // declarations in the original source, Babel sometimes inserts its own
  // `import` declarations later on, and of course Babel knows best how to
  // compile those declarations.
  combined.plugins.push(babelModulesPlugin);

  return {
    compact: false,
    sourceMap: false,
    ast: false,
    babelrc: false,
    presets: [combined]
  };
};

function getDefaultsForNode8(features) {
  const plugins = [
    // Support Flow type syntax by simply stripping it out.
    require("babel-plugin-syntax-flow"),
    require("babel-plugin-transform-flow-strip-types"),

    // Compile import/export syntax with Reify.
    [reifyPlugin, {
      generateLetDeclarations: true,
      enforceStrictMode: false
    }],

    // Import helpers from the babel-runtime package rather than
    // redefining them at the top of each module.
    [require("babel-plugin-transform-runtime"), {
      // Avoid importing polyfills for things like Object.keys, which
      // Meteor already shims in other ways.
      polyfill: false
    }],

    // Make assigning to imported symbols a syntax error.
    require("babel-plugin-check-es2015-constants"),

    // Not fully supported in Node 8 without the --harmony flag.
    require("babel-plugin-syntax-object-rest-spread"),
    require("babel-plugin-transform-object-rest-spread"),

    // Ensure that async functions run in a Fiber, while also taking
    // full advantage of native async/await support in Node 8.
    [require("./plugins/async-await.js"), {
      // Do not transform `await x` to `Promise.await(x)`, since Node
      // 8 has native support for await expressions.
      useNativeAsyncAwait: false
    }],

    // Transform `import(id)` to `module.dynamicImport(id)`.
    require("./plugins/dynamic-import.js"),

    // Enable class property syntax for server-side React code.
    require("babel-plugin-transform-class-properties"),

    // In case babel-plugin-transform-runtime generated any import
    // declarations after reifyPlugin ran, make sure to compile them.
    babelModulesPlugin
  ];

  const presets = [{
    plugins
  }];

  if (features) {
    if (features.react) {
      // Enable JSX syntax for server-side React code.
      presets.push(require("babel-preset-react"));
    }
  }

  return {
    compact: false,
    sourceMap: false,
    ast: false,
    babelrc: false,
    presets
  };
}

exports.getMinifierDefaults = function getMinifierDefaults(features) {
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
    // Only include Babili, because we are only minifying, not compiling.
    presets: [require("babel-preset-babili")]
  };

  if (features) {
    if (features.inlineNodeEnv) {
      options.plugins.push([
        require("./plugins/inline-node-env.js"),
        { nodeEnv: features.inlineNodeEnv }
      ]);
    }
  }

  return options;
};
