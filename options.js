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
  var options = {
    compact: false,
    sourceMap: "inline",
    ast: false,
    babelrc: false,
    // "Loose" mode gets us faster and more IE-compatible transpilations of:
    // classes, computed properties, modules, for-of, and template literals.
    // Basically all the transformers that support "loose".
    // http://babeljs.io/docs/usage/loose/
    presets: [require("babel-preset-meteor")],
    plugins: []
  };

  if (! (features &&
         features.runtime === false)) {
    options.plugins.push([
      require("babel-plugin-transform-runtime"),
      { // Avoid importing polyfills for things like Object.keys, which
        // Meteor already shims in other ways.
        polyfill: false }
    ]);
  }

  if (features) {
    if (features.react) {
      options.presets.push(
        require("babel-preset-react")
      );
    }

    if (features.jscript) {
      options.plugins.push(
        require("./plugins/named-function-expressions.js"),
        require("./plugins/sanitize-for-in-objects.js")
      );
    }

    if (features.legacyModules) {
      options.plugins.push(babelModulesPlugin);
    }
  }

  return options;
};
