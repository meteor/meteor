module.exports = function () {
  var template = require("@babel/template").default;
  var buildImport = template("module.dynamicImport(SOURCE)");

  return {
    name: "transform-meteor-dynamic-import",
    inherits: require("@babel/plugin-syntax-dynamic-import").default,
    visitor: {
      CallExpression: function (path) {
        if (path.node.callee.type === "Import") {
          path.replaceWith(buildImport({
            SOURCE: path.node.arguments
          }));
        }
      }
    }
  };
};
