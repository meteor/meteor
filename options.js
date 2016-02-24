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
  }

  return options;
};
