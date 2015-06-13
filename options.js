module.exports = {
  sourceMap: "inline",
  externalHelpers: true,
  ast: false,
  // "Loose" mode gets us faster and more IE-compatible transpilations of:
  // classes, computed properties, modules, for-of, and template literals.
  // Basically all the transformers that support "loose".
  // http://babeljs.io/docs/usage/loose/
  loose: ["all", "es6.modules"],
  whitelist: [
    'es6.arrowFunctions',
    'es6.templateLiterals',
    'es6.classes',
    'es6.blockScoping',
    "es6.properties.shorthand",
    "es6.properties.computed",
    "es6.parameters.rest",
    "es6.parameters.default",
    "es6.spread",
    "es6.destructuring",
    "es6.modules",
    "flow"
  ]
};
