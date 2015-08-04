module.exports = function (babel) {
  var Plugin = babel.Plugin;
  var t = babel.types;

  return new Plugin("meteor-sanitize-for-in-objects", {
    visitor: {
      // In browsers that do not support defining non-enumerable
      // properties, defining any new methods on Array.prototype means
      // those methods will become visible to for-in loops. This transform
      // solves that problem by wrapping the object expression of every
      // for-in loop with a call to babelHelpers.sanitizeForInObject.
      ForInStatement: function (node) {
        node.right = t.callExpression(
          t.memberExpression(
            t.identifier("babelHelpers"),
            t.identifier("sanitizeForInObject"),
            false
          ),
          [node.right]
        );
      }
    }
  });
};

