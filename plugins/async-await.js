"use strict";

module.exports = function (babel) {
  const t = babel.types;

  return {
    visitor: {
      Function: {
        exit: function (path) {
          const node = path.node;
          if (! node.async) {
            return;
          }

          // The original function becomes a non-async function that
          // returns a Promise.
          node.async = false;

          const innerFn = t.functionExpression(
            null, // anonymous
            node.params.slice(0),
            node.body
          );

          if (this.opts.useNativeAsyncAwait) {
            // The inner function called by Promise.asyncApply should be
            // async if we have native async/await support.
            innerFn.async = true;
          }

          // Calling the async function with Promise.asyncApply is
          // important to ensure that the part before the first await
          // expression runs synchronously in its own Fiber, even when
          // there is native support for async/await.
          node.body = t.blockStatement([
            t.expressionStatement(t.stringLiteral("use strict")),
            t.returnStatement(
              t.callExpression(
                t.memberExpression(
                  t.identifier("Promise"),
                  t.identifier("asyncApply"),
                  false
                ), [
                  innerFn,
                  t.thisExpression(),
                  t.identifier("arguments")
                ]
              )
            )
          ]);
        }
      },

      AwaitExpression: function (path) {
        if (this.opts.useNativeAsyncAwait) {
          // No need to transform await expressions if we have native
          // support for them.
          return;
        }

        const node = path.node;
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
