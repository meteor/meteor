module.exports = function (babel) {
  var Plugin = babel.Plugin;
  var t = babel.types;

  return new babel.Plugin("meteor-async-await", {
    metadata: {
      group: "builtin-pre"
    },

    visitor: {
      Function: function (node, parent, scope) {
        if (! node.async) {
          return node;
        }

        node.async = false;

        node.body = t.blockStatement([
          t.expressionStatement(t.literal("use strict")),
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

      AwaitExpression: function (node) {
        return t.callExpression(
          t.memberExpression(
            t.identifier("Promise"),
            t.identifier(node.all ? "awaitAll" : "await"),
            false
          ),
          [node.argument]
        );
      }
    }
  });
};
