module.exports = function (babel) {
  var t = babel.types;

  return {
    visitor: {
      // From https://github.com/babel-plugins/babel-plugin-jscript
      // Solves http://kiro.me/blog/nfe_dilemma.html
      FunctionExpression: {
        exit: function (path) {
          var node = path.node;
          if (! node.id) return;
          node._ignoreUserWhitespace = true;

          path.replaceWith(t.callExpression(
            t.functionExpression(null, [], t.blockStatement([
              t.toStatement(node),
              t.returnStatement(node.id)
            ])),
            []
          ));
        }
      }
    }
  };
};
