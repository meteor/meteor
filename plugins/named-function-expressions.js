module.exports = function (babel) {
  var Plugin = babel.Plugin;
  var t = babel.types;

  return new Plugin("meteor-named-function-expressions", {
    visitor: {
      // From https://github.com/babel-plugins/babel-plugin-jscript
      // Solves http://kiro.me/blog/nfe_dilemma.html
      FunctionExpression: {
        exit: function (node) {
          if (! node.id) return;
          node._ignoreUserWhitespace = true;

          return t.callExpression(
            t.functionExpression(null, [], t.blockStatement([
              t.toStatement(node),
              t.returnStatement(node.id)
            ])),
            []
          );
        }
      }
    }
  });
};
