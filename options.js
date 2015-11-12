exports.getDefaults = function getDefaults(features) {
  var options = {
    compact: false,
    sourceMap: "inline",
    ast: false,
    // "Loose" mode gets us faster and more IE-compatible transpilations of:
    // classes, computed properties, modules, for-of, and template literals.
    // Basically all the transformers that support "loose".
    // http://babeljs.io/docs/usage/loose/
    presets: [require("babel-preset-meteor")],
    plugins: []
  };

  if (features) {
    if (features.asyncAwait) {
      options.whitelist.push(
        "es7.asyncFunctions",
        "regenerator"
      );
    } else if (features.meteorAsyncAwait) {
      addPlugin(options, "./plugins/async-await.js");
      options.whitelist.push("es7.asyncFunctions");
    }

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
