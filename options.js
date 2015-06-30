exports.getDefaults = function getDefaults(features) {
  var options = {
    compact: false,
    sourceMap: "inline",
    externalHelpers: true,
    ast: false,
    // "Loose" mode gets us faster and more IE-compatible transpilations of:
    // classes, computed properties, modules, for-of, and template literals.
    // Basically all the transformers that support "loose".
    // http://babeljs.io/docs/usage/loose/
    loose: ["all", "es6.modules"],
    whitelist: [
      "es3.propertyLiterals",
      "es3.memberExpressionLiterals",
      "es6.arrowFunctions",
      "es6.templateLiterals",
      "es6.classes",
      "es6.constants",
      "es6.blockScoping",
      "es6.properties.shorthand",
      "es6.properties.computed",
      "es6.parameters",
      "es6.spread",
      "es7.objectRestSpread",
      "es6.destructuring",
      "es6.modules",
      "es7.trailingFunctionCommas",
      "flow"
    ]
  };

  if (features) {
    if (features.meteorAsyncAwait) {
      var plugins = options.plugins || [];
      plugins.push("meteor-async-await");
      options.plugins = plugins;

      if (options.whitelist.indexOf("es7.asyncFunctions") < 0) {
        options.whitelist.push("es7.asyncFunctions");
      }
    }
  }

  return options;
};
