var strictModulesPluginFactory =
  require("babel-plugin-transform-es2015-modules-commonjs");

var babelModulesPlugin = [function () {
  var plugin = strictModulesPluginFactory.apply(this, arguments);
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
  var babelPresetMeteor = require("babel-preset-meteor");
  var options = {
    compact: false,
    sourceMap: false,
    ast: false,
    babelrc: false,
    // "Loose" mode gets us faster and more IE-compatible transpilations of:
    // classes, computed properties, modules, for-of, and template literals.
    // Basically all the transformers that support "loose".
    // http://babeljs.io/docs/usage/loose/
    presets: [babelPresetMeteor]
  };

  babelPresetMeteor.plugins.push(
    require("./plugins/dynamic-import.js")
  );

  if (! (features &&
         features.runtime === false)) {
    babelPresetMeteor.plugins.push([
      require("babel-plugin-transform-runtime"),
      { // Avoid importing polyfills for things like Object.keys, which
        // Meteor already shims in other ways.
        polyfill: false }
    ]);
  }

  if (features) {
    if (features.react) {
      var presets = babelPresetMeteor.presets || [];
      presets.push(require("babel-preset-react"));
      babelPresetMeteor.presets = presets;
    }

    if (features.jscript) {
      babelPresetMeteor.plugins.push(
        require("./plugins/named-function-expressions.js"),
        require("./plugins/sanitize-for-in-objects.js")
      );
    }
  }

  // Even though we use Reify to transpile `import` and `export`
  // declarations in the original source, Babel sometimes inserts its own
  // `import` declarations later on, and of course Babel knows best how to
  // compile those declarations.
  babelPresetMeteor.plugins.push(babelModulesPlugin);

  return options;
};

exports.getMinifierDefaults = function getMinifierDefaults() {
  var options = {
    // Generate code in loose mode
    compact: false,
    // Don't generate a source map, we do that during compilation
    sourceMap: false,
    // We don't need to generate AST code
    ast: false,
    // Do not honor babelrc settings, would conflict with compilation
    babelrc: false,
    // Only include Babili, because we are only minifying, not compiling.
    presets: [require("babel-preset-babili")],
  }

  return options;
};
