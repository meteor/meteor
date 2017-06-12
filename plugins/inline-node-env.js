module.exports = function (babel) {
  var t = babel.types;
  return {
    name: "meteor-babel-inline-node-env",
    visitor: {
      MemberExpression: function (path, state) {
        if (typeof state.opts.nodeEnv === "string" &&
            path.get("object").matchesPattern("process.env")) {
          var key = path.toComputedKey();
          if (t.isStringLiteral(key) && key.value === "NODE_ENV") {
            path.replaceWith(t.valueToNode(state.opts.nodeEnv));
          }
        }
      }
    }
  };
};
