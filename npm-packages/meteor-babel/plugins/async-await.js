"use strict";

module.exports = function (babel) {
  const t = babel.types;

  return {
    name: "transform-meteor-async-await",
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

          // The inner function should inherit lexical environment items
          // like `this`, `super`, and `arguments` from the outer
          // function, and arrow functions provide exactly that behavior.
          const innerFn = t.arrowFunctionExpression(
            // The inner function has no parameters of its own, but can
            // refer to the outer parameters of the original function.
            [],
            node.body,
            // The inner function called by Promise.asyncApply should be
            // async if we have native async/await support.
            !! this.opts.useNativeAsyncAwait
          );

          const promiseResultExpression = t.callExpression(
            t.memberExpression(
              t.identifier("Promise"),
              t.identifier("asyncApply"),
              false
            ), [innerFn]
          );

          // Calling the async function with Promise.asyncApply is
          // important to ensure that the part before the first await
          // expression runs synchronously in its own Fiber, even when
          // there is native support for async/await.
          if (node.type === "ArrowFunctionExpression") {
            node.body = promiseResultExpression;
          } else {
            node.body = t.blockStatement([
              t.returnStatement(promiseResultExpression)
            ]);
          }
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
