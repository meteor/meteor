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

          const innerFn = Object.assign({}, node);

          // The inner function has no parameters of its own, but can
          // refer to the outer parameters of the original function.
          innerFn.params = [];

          if (this.opts.useNativeAsyncAwait) {
            // The inner function called by Promise.asyncApply should be
            // async if we have native async/await support.
            innerFn.async = true;
          }

          if (/^(|Arrow|Generator)Function/.test(node.type)) {
            // If the original node was an ArrowFunctionExpression, the
            // inner function should be as well. However, the inner
            // function should always be an Expression, not a Declaration
            // or something more exotic like a ClassMethod.
            innerFn.type = node.type.replace(/Declaration$/, "Expression");
          } else {
            // For any other kind of function (e.g. ClassMethod), make
            // sure the inner function is a simple FunctionExpression.
            innerFn.type = "FunctionExpression";
          }

          // tl;dr: innerFn must now be an Expression.
          t.assertExpression(innerFn);

          // Calling the async function with Promise.asyncApply is
          // important to ensure that the part before the first await
          // expression runs synchronously in its own Fiber, even when
          // there is native support for async/await.
          node.body = t.blockStatement([
            t.returnStatement(
              t.callExpression(
                t.memberExpression(
                  t.identifier("Promise"),
                  t.identifier("asyncApply"),
                  false
                ), [
                  innerFn,
                  t.thisExpression()
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
