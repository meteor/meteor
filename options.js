exports.getDefaults = function getDefaults() {
  return {
    compact: false,
    sourceMap: "inline",
    externalHelpers: true,
    ast: false,
    // "Loose" mode gets us faster and more IE-compatible transpilations of:
    // classes, computed properties, modules, for-of, and template literals.
    // Basically all the transformers that support "loose".
    // http://babeljs.io/docs/usage/loose/
    loose: ["all", "es6.modules"],
    plugins: ["meteor-async-await"],
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
      "es6.parameters.rest",
      "es6.parameters.default",
      "es6.spread",
      "es7.objectRestSpread",
      "es6.destructuring",
      "es6.modules",
      "es7.trailingFunctionCommas",
      "es7.asyncFunctions",
      "flow"
    ]
  };
};
