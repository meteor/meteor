"use strict";

module.exports = function (babel) {
  const t = babel.types;

  function visitFunction(path, opts, reuseFiber) {
    const node = path.node;
    if (!node.async) {
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
      !!opts.useNativeAsyncAwait
    );

    let args = [innerFn];

    if (reuseFiber) {
      // context, args, allowReuseOfCurrentFiber
      args.push(t.identifier('undefined'), t.identifier('undefined'), t.booleanLiteral(true));
    }

    const promiseResultExpression = t.callExpression(
      t.memberExpression(
        t.identifier("Promise"),
        t.identifier("asyncApply"),
        false
      ), args
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

  function visitAwaitExpression(path, opts) {
    if (opts.useNativeAsyncAwait) {
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

  return {
    name: "transform-meteor-async-await",
    visitor: {
      Function: {
        exit: function (path) {
          return visitFunction(path, this.opts);
        }
      },

      AwaitExpression: function (path) {
        return visitAwaitExpression(path, this.opts);
      },
      Program: {
        // When top level await is enabled, reify wraps the module in an async function
        // after the above visitors finished. This visitor ensures that wrapper is also
        // transpiled.
        exit: function (path) {
          let asyncFunctionPath = path.get('body.0');
          if (asyncFunctionPath.node) {
            asyncFunctionPath = asyncFunctionPath.get('expression');
          }
          if (asyncFunctionPath.node) {
            asyncFunctionPath = asyncFunctionPath.get('argument');
          }
          if (asyncFunctionPath.node) {
            asyncFunctionPath = asyncFunctionPath.get('arguments');
          }
          if (asyncFunctionPath) {
            asyncFunctionPath = asyncFunctionPath[0];
          }

          if (!asyncFunctionPath || asyncFunctionPath.type !== 'FunctionExpression' || !asyncFunctionPath.node.async) {
            return
          }

          let ifPath = asyncFunctionPath.get('body.body').find(subPath => subPath.type === 'IfStatement');
          let awaitExpressionPath = ifPath.get('consequent.expression');
          if (awaitExpressionPath.type === 'AwaitExpression') {
            visitAwaitExpression(awaitExpressionPath, this.opts);
          }

          // Configures it to re-use the parent fiber.
          // TODO: figure out another solution since this is not spec compliant
          visitFunction(asyncFunctionPath, this.opts, true);
        }
      }
    }
  };
};
