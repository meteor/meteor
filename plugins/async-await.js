module.exports = function (babel) {
  var t = babel.types;

  return {
    visitor: {
      Function: function (path) {
        var node = path.node;
        if (! node.async) {
          return;
        }

        node.async = false;

        node.body = t.blockStatement([
          t.expressionStatement(t.stringLiteral("use strict")),
          t.returnStatement(
            t.callExpression(
              t.memberExpression(
                t.identifier("Promise"),
                t.identifier("asyncApply"),
                false
              ),
              [
                t.functionExpression(
                  null, // anonymous
                  node.params.slice(0),
                  node.body
                ),
                t.thisExpression(),
                t.identifier("arguments")
              ]
            )
          )
        ]);
      },

      AwaitExpression: function (path) {
        var node = path.node;
        path.replaceWith(t.callExpression(
          t.memberExpression(
            t.identifier("Promise"),
            t.identifier(node.all ? "awaitAll" : "await"),
            false
          ),
          [node.argument]
        ));
      }
    }
  };
};
