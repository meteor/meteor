module.exports = function (babel) {
  var t = babel.types;

  return {
    visitor: {
      // In browsers that do not support defining non-enumerable
      // properties, defining any new methods on Array.prototype means
      // those methods will become visible to for-in loops. This transform
      // solves that problem by wrapping the object expression of every
      // for-in loop with a call to babelHelpers.sanitizeForInObject.
      ForInStatement: function (path) {
        var rightPath = path.get("right");

        if (t.isCallExpression(rightPath.node) &&
            t.isMemberExpression(rightPath.node.callee) &&
            t.isIdentifier(rightPath.node.callee.property) &&
            rightPath.node.callee.property.name === "sanitizeForInObject") {
          return;
        }

        rightPath.replaceWith(t.callExpression(
          t.memberExpression(
            t.identifier("meteorBabelHelpers"),
            t.identifier("sanitizeForInObject"),
            false
          ),
          [rightPath.node]
        ));
      }
    }
  };
};

